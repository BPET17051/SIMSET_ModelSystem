-- T14 preparation only. Execute after inserting the approved Sync Auth UID.
BEGIN;

CREATE TABLE IF NOT EXISTS public.manikin_sync_accounts (
  auth_user_id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

ALTER TABLE public.manikin_sync_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.manikin_sync_accounts FROM PUBLIC, anon, authenticated;

-- Existing production table; extend it for explicit staff resolution without
-- recreating or deleting historical conflict rows.
ALTER TABLE IF EXISTS public.manikin_sync_conflicts
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by uuid,
  ADD COLUMN IF NOT EXISTS resolution_note text;

CREATE OR REPLACE FUNCTION public.sync_manikin_status_from_sheet(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  row_data jsonb;
  target record;
  next_status text;
  changed_count integer := 0;
  conflict_count integer := 0;
  skipped_count integer := 0;
  not_found_count integer := 0;
  transferred_count integer := 0;
  is_transferred boolean := false;
  inserted_conflict integer := 0;
  last_sync timestamptz := timezone('utc', now());
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.manikin_sync_accounts a
    WHERE a.auth_user_id = auth.uid() AND a.is_active
  ) THEN
    RAISE EXCEPTION 'unauthorized sync account';
  END IF;

  FOR row_data IN SELECT value FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb)) LOOP
    SELECT * INTO target FROM public.manikins WHERE sap_id = NULLIF(row_data->>'sap_id', '') FOR UPDATE;
    IF NOT FOUND THEN
      not_found_count := not_found_count + 1;
      CONTINUE;
    END IF;

    is_transferred := lower(trim(row_data->>'sheet_status')) IN ('โอนย้าย', 'ถ่ายโอน');
    next_status := CASE lower(trim(row_data->>'sheet_status'))
      WHEN 'พร้อมใช้งาน' THEN 'ready'
      WHEN 'ซ่อมบำรุง' THEN 'maintenance'
      WHEN 'อยู่ระหว่างการซ่อม' THEN 'maintenance'
      WHEN 'ปลดระวาง' THEN 'retired'
      WHEN 'งดใช้งาน' THEN 'retired'
      WHEN 'โอนย้าย' THEN target.status
      WHEN 'ถ่ายโอน' THEN target.status
      ELSE NULL
    END;
    IF is_transferred THEN
      transferred_count := transferred_count + 1;
    END IF;
    IF next_status IS NULL THEN
      skipped_count := skipped_count + 1;
      CONTINUE;
    END IF;

    -- A conflict only means "sheet says ready, production says maintenance". If the sheet no longer
    -- says that (e.g. it went back to maintenance), the conflict is stale: close it so staff cannot
    -- confirm a repair the sheet no longer claims.
    IF NOT (target.status = 'maintenance' AND next_status = 'ready') THEN
      UPDATE public.manikin_sync_conflicts
      SET resolved_at = timezone('utc', now()),
          resolution_note = 'auto-closed: sheet no longer differs from production'
      WHERE sap_id = target.sap_id AND resolved_at IS NULL;
    END IF;

    IF target.status = 'maintenance' AND next_status = 'ready' THEN
      INSERT INTO public.manikin_sync_conflicts(sap_id, model_id, sheet_status, production_status, reason)
      SELECT target.sap_id, target.model_id, row_data->>'sheet_status', target.status, 'Maintenance to ready requires staff review'
      WHERE NOT EXISTS (
        SELECT 1 FROM public.manikin_sync_conflicts c
        WHERE c.sap_id = target.sap_id AND c.resolved_at IS NULL
      );
      GET DIAGNOSTICS inserted_conflict = ROW_COUNT;
      IF inserted_conflict > 0 THEN conflict_count := conflict_count + 1; END IF;
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.borrow_request_items bri
      JOIN public.borrow_requests br ON br.id = bri.request_id
      WHERE bri.manikin_sap_id = target.sap_id
        AND br.status IN ('pending','approved','ready','borrowed','overdue')
    ) THEN
      IF NOT is_transferred THEN skipped_count := skipped_count + 1; END IF;
      CONTINUE;
    END IF;

    -- Transferred rows are idempotent: is_active is intentionally false there, so the
    -- generic "is_active differs from next_status" test must not apply to them.
    IF (
      (is_transferred AND (
        target.is_active OR NOT target.needs_review
        OR position('Transferred; excluded from borrowing' in COALESCE(target.notes, '')) = 0
      ))
      OR
      ((NOT is_transferred) AND (
        target.status IS DISTINCT FROM next_status
        OR target.is_active IS DISTINCT FROM (next_status <> 'retired')
      ))
    ) THEN
      UPDATE public.manikins
      SET status = next_status,
          is_active = CASE WHEN is_transferred THEN false ELSE (next_status <> 'retired') END,
          needs_review = is_transferred,
          notes = CASE WHEN is_transferred AND position('Transferred; excluded from borrowing' in COALESCE(notes, '')) = 0
                       THEN concat_ws(' | ', NULLIF(notes, ''), 'Transferred; excluded from borrowing')
                       ELSE notes END
      WHERE id = target.id;
      changed_count := changed_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'changed_count', changed_count,
    'skipped_count', skipped_count,
    'conflict_count', conflict_count,
    'not_found_count', not_found_count,
    'transferred_count', transferred_count,
    'last_sync_at', last_sync
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_manikin_sync_conflict(
  p_sap_id text,
  p_resolution_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target public.manikins%ROWTYPE;
  actor_email text := COALESCE(auth.jwt() ->> 'email', 'unknown');
BEGIN
  IF auth.uid() IS NULL OR COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') NOT IN ('admin', 'staff') THEN
    RAISE EXCEPTION 'unauthorized conflict resolution';
  END IF;

  SELECT m.* INTO target FROM public.manikins m
  WHERE m.sap_id = p_sap_id AND m.status = 'maintenance'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'manikin is not in maintenance'; END IF;
  IF position('Transferred; excluded from borrowing' in COALESCE(target.notes, '')) > 0 THEN
    RAISE EXCEPTION 'transferred manikin requires asset disposition review';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.manikin_sync_conflicts c
    WHERE c.sap_id = p_sap_id AND c.resolved_at IS NULL
  ) THEN RAISE EXCEPTION 'no open sync conflict'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.borrow_request_items bri
    JOIN public.borrow_requests br ON br.id = bri.request_id
    WHERE bri.manikin_sap_id = p_sap_id
      AND br.status IN ('pending','approved','ready','borrowed','overdue')
  ) OR EXISTS (
    SELECT 1 FROM public.course_reserved_manikins crm
      WHERE crm.manikin_sap_id = p_sap_id
        AND EXISTS (SELECT 1 FROM public.courses c WHERE c.id = crm.course_id AND c.ends_on >= CURRENT_DATE)
  ) THEN
    RAISE EXCEPTION 'manikin has an active borrow or course reservation';
  END IF;

  UPDATE public.manikins
  SET status = 'ready', is_active = true, needs_review = false
  WHERE id = target.id;

  UPDATE public.manikin_sync_conflicts
  SET resolved_at = timezone('utc', now()),
      resolved_by = auth.uid(),
      resolution_note = p_resolution_note
  WHERE sap_id = p_sap_id AND resolved_at IS NULL;

  INSERT INTO public.audit_logs(action, actor_email, target_ids, note)
  VALUES ('resolve_manikin_sync_conflict', actor_email, jsonb_build_array(p_sap_id), p_resolution_note);

  RETURN jsonb_build_object('sap_id', p_sap_id, 'status', 'ready', 'resolved_at', timezone('utc', now()));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_open_manikin_sync_conflicts()
RETURNS SETOF public.manikin_sync_conflicts
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT c FROM public.manikin_sync_conflicts c
  WHERE c.resolved_at IS NULL
    AND COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') IN ('admin', 'staff')
  ORDER BY c.id ASC; -- table has no created_at in production; id is its only known key
$$;

REVOKE ALL ON FUNCTION public.sync_manikin_status_from_sheet(jsonb) FROM PUBLIC, anon, authenticated;
-- Grant EXECUTE only to the dedicated database role mapped to the Sync Auth identity.
GRANT EXECUTE ON FUNCTION public.sync_manikin_status_from_sheet(jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.resolve_manikin_sync_conflict(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_manikin_sync_conflict(text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.get_open_manikin_sync_conflicts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_open_manikin_sync_conflicts() TO authenticated;

COMMIT;
