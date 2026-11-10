-- T20 stage 1 (PREPARED, NOT RUN): which manikin is used in a course on which day (from the sheet's Sessions tab).
-- ADDITIVE ONLY: one new table + two functions. It does NOT touch availability, request submit or staff assignment.
-- Stage 1 purpose: staff see "this borrowed/approved manikin clashes with a course". Blocking comes in stage 2.
-- Every statement below is independent and idempotent, so it is safe in the Supabase editor (which does not keep
-- BEGIN..COMMIT together). Run the whole file.

CREATE TABLE IF NOT EXISTS public.manikin_usage_blocks (
  session_id    text PRIMARY KEY,            -- Sessions.session_id (stable per manikin+course+day)
  sap_id        text NOT NULL,               -- = manikins.sap_id
  usage_date    date NOT NULL,
  course_name   text,
  source_status text NOT NULL,               -- ACTIVE | CONFLICT (as written by the timer project)
  synced_at     timestamptz NOT NULL DEFAULT timezone('utc', now())
);
CREATE INDEX IF NOT EXISTS idx_manikin_usage_blocks_sap_date ON public.manikin_usage_blocks (sap_id, usage_date);
ALTER TABLE public.manikin_usage_blocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.manikin_usage_blocks FROM PUBLIC, anon, authenticated;

-- Called hourly by the Apps Script sync account (same account/guard as sync_manikin_status_from_sheet).
CREATE OR REPLACE FUNCTION public.sync_manikin_usage_from_sheet(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_total int; v_received int := 0; v_upserted int := 0; v_deleted int := 0;
  v_today date := (now() AT TIME ZONE 'Asia/Bangkok')::date;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.manikin_sync_accounts a WHERE a.auth_user_id = auth.uid() AND a.is_active
  ) THEN
    RAISE EXCEPTION 'unauthorized sync account';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a json array';
  END IF;
  v_total := jsonb_array_length(p_rows);
  IF v_total > 5000 THEN RAISE EXCEPTION 'too many rows: %', v_total; END IF;
  -- ponytail: an empty payload never deletes (it may be a failed read); stale future rows then stay until the
  -- next non-empty sync. Upgrade path: send an explicit "authoritative" flag from the script.
  IF v_total = 0 THEN
    RETURN jsonb_build_object('received', 0, 'upserted', 0, 'not_found', 0, 'deleted', 0);
  END IF;

  WITH incoming AS (
    SELECT DISTINCT ON (btrim(r->>'session_id'))
           btrim(r->>'session_id')                  AS session_id,
           btrim(r->>'sap_id')                      AS sap_id,
           (r->>'usage_date')::date                 AS usage_date,
           NULLIF(btrim(r->>'course_name'), '')     AS course_name,
           upper(btrim(r->>'status'))               AS source_status
    FROM jsonb_array_elements(p_rows) r
    WHERE NULLIF(btrim(r->>'session_id'), '') IS NOT NULL
      AND NULLIF(btrim(r->>'sap_id'), '') IS NOT NULL
    ORDER BY btrim(r->>'session_id')
  ), up AS (
    INSERT INTO public.manikin_usage_blocks (session_id, sap_id, usage_date, course_name, source_status)
    SELECT i.session_id, i.sap_id, i.usage_date, i.course_name, i.source_status
    FROM incoming i
    JOIN public.manikins m ON m.sap_id = i.sap_id AND m.deleted_at IS NULL
    ON CONFLICT (session_id) DO UPDATE
      SET sap_id = EXCLUDED.sap_id, usage_date = EXCLUDED.usage_date, course_name = EXCLUDED.course_name,
          source_status = EXCLUDED.source_status, synced_at = timezone('utc', now())
    RETURNING 1
  )
  SELECT (SELECT count(*) FROM incoming), (SELECT count(*) FROM up) INTO v_received, v_upserted;

  -- Sessions that disappeared from the sheet (course moved/cancelled): drop today-and-future rows only.
  DELETE FROM public.manikin_usage_blocks b
  WHERE b.usage_date >= v_today
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_rows) r WHERE btrim(r->>'session_id') = b.session_id);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object('received', v_received, 'upserted', v_upserted,
                            'not_found', v_received - v_upserted, 'deleted', v_deleted);
END;
$$;

-- Staff view: open borrow requests whose assigned manikin is in a course on a day inside the borrow window.
CREATE OR REPLACE FUNCTION public.get_manikin_usage_conflicts()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_today date := (now() AT TIME ZONE 'Asia/Bangkok')::date;
BEGIN
  IF auth.uid() IS NULL OR COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') NOT IN ('admin', 'staff', 'approver_l1') THEN
    RAISE EXCEPTION 'unauthorized: staff role required';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(q.x ORDER BY q.x->>'first_date', q.x->>'tracking_id')
    FROM (
      SELECT jsonb_build_object(
               'item_id',        bri.id,
               'request_id',     br.id,
               'tracking_id',    br.tracking_id,
               'borrower_name',  br.borrower_name,
               'request_status', br.status,
               'sap_id',         bri.manikin_sap_id,
               'model_id',       m.model_id,
               'first_date',     min(u.usage_date),
               'dates',          jsonb_agg(DISTINCT u.usage_date ORDER BY u.usage_date),
               'courses',        COALESCE(jsonb_agg(DISTINCT u.course_name) FILTER (WHERE u.course_name IS NOT NULL), '[]'::jsonb)
             ) AS x
      FROM public.borrow_request_items bri
      JOIN public.borrow_requests br ON br.id = bri.request_id
      JOIN public.manikin_usage_blocks u
           ON u.sap_id = bri.manikin_sap_id
          AND u.usage_date BETWEEN bri.start_date AND bri.end_date
          AND u.usage_date >= v_today
      LEFT JOIN public.manikins m ON m.sap_id = bri.manikin_sap_id
      WHERE br.status IN ('pending', 'approved', 'ready', 'borrowed', 'overdue')
        AND bri.manikin_sap_id IS NOT NULL
      GROUP BY bri.id, br.id, br.tracking_id, br.borrower_name, br.status, bri.manikin_sap_id, m.model_id
    ) q
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.sync_manikin_usage_from_sheet(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_manikin_usage_from_sheet(jsonb) TO authenticated;  -- sync account checked inside
REVOKE ALL ON FUNCTION public.get_manikin_usage_conflicts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_manikin_usage_conflicts() TO authenticated;          -- staff role checked inside
