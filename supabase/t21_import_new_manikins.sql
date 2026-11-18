-- T21: let the hourly sheet sync ADD manikins that exist in Models_Data but not in Supabase.
-- PREPARED, NOT RUN. Additive: a NEW function; sync_manikin_status_from_sheet (T14) is not touched.
-- Run the whole file in one go (CREATE FUNCTION + GRANT are idempotent). Then paste the updated
-- scripts/google-sheets-manikin-sync.gs into the Apps Script project. Self-check: t21_import_new_manikins_test.sql.
--
-- Rules (ponytail: deliberately small):
--   * only sheet rows whose status is 'พร้อมใช้งาน' are imported; the 16 retired/maintenance/transferred units
--     that are absent on purpose stay absent;
--   * a unit whose sap_id OR model_id already exists is skipped (status sync owns existing units);
--   * model_group = model_id without its trailing number (same rule as t19_model_group.sql);
--   * the unit joins the EXISTING card of its model_group (shown in the catalog immediately);
--   * a model_group with no card yet gets a card with borrow_enabled = false, so a typo in the sheet cannot put a
--     wrong card on the public page. It is reported in `new_groups`. Enable it after checking name/type:
--       UPDATE public.equipments SET borrow_enabled = true WHERE source_team_code = '<team_code from new_groups>';
--     Ceiling: that one UPDATE is manual per NEW model family. Upgrade path: a staff "approve new model" button.
CREATE OR REPLACE FUNCTION public.import_new_manikins_from_sheet(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r jsonb;
  v_sap text; v_model text; v_name text; v_asset text; v_type text; v_group text; v_team text;
  v_added int := 0; v_skipped int := 0;
  v_groups jsonb := '[]'::jsonb;
  v_touched text[] := '{}';
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.manikin_sync_accounts a WHERE a.auth_user_id = auth.uid() AND a.is_active
  ) THEN
    RAISE EXCEPTION 'unauthorized sync account';
  END IF;

  FOR r IN SELECT value FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb)) LOOP
    v_sap   := NULLIF(btrim(r->>'sap_id'), '');
    v_model := NULLIF(btrim(r->>'model_id'), '');
    v_name  := NULLIF(btrim(r->>'display_name'), '');
    v_asset := NULLIF(btrim(r->>'asset_code'), '');
    v_type  := NULLIF(btrim(r->>'model_type'), '');

    IF v_sap IS NULL OR v_model IS NULL OR v_name IS NULL
       OR btrim(coalesce(r->>'sheet_status', '')) <> 'พร้อมใช้งาน'
       OR EXISTS (SELECT 1 FROM public.manikins m WHERE m.sap_id = v_sap OR m.model_id = v_model) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_group := regexp_replace(v_model, '[-[:space:]]?[0-9]+$', '');

    SELECT m.team_code INTO v_team FROM public.manikins m
    WHERE m.model_group = v_group AND m.deleted_at IS NULL AND m.team_code LIKE 'MODEL\_%'
    LIMIT 1;

    IF v_team IS NULL THEN
      v_team := 'MODEL_' || substr(md5(v_name), 1, 16);
      INSERT INTO public.equipments
        (name_th, name_en, type, source_team_code, total_quantity, maintenance_quantity,
         allocation_type, borrow_enabled, inventory_mode, image_url)
      SELECT v_name, v_name, coalesce(v_type, 'manikin'), v_team, 0, 0, 'rotating', false, 'manikin', NULL
      WHERE NOT EXISTS (SELECT 1 FROM public.equipments e WHERE e.source_team_code = v_team);
      v_groups := v_groups || jsonb_build_object('model_group', v_group, 'team_code', v_team, 'name', v_name);
    END IF;

    INSERT INTO public.manikins
      (sap_id, model_id, team_code, display_name, asset_code, status, is_active, needs_review, model_group)
    VALUES (v_sap, v_model, v_team, v_name, v_asset, 'ready', true, false, v_group);
    v_added := v_added + 1;
    v_touched := array_append(v_touched, v_team);
  END LOOP;

  -- same quantity rule as T15
  UPDATE public.equipments e
  SET total_quantity = q.total, maintenance_quantity = q.maint
  FROM (SELECT team_code,
               count(*) FILTER (WHERE is_active)::int AS total,
               count(*) FILTER (WHERE is_active AND status IN ('maintenance', 'repair'))::int AS maint
        FROM public.manikins WHERE deleted_at IS NULL AND team_code = ANY (v_touched) GROUP BY team_code) q
  WHERE e.source_team_code = q.team_code;

  RETURN jsonb_build_object('added_count', v_added, 'skipped_count', v_skipped, 'new_groups', v_groups);
END;
$$;

REVOKE ALL ON FUNCTION public.import_new_manikins_from_sheet(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_new_manikins_from_sheet(jsonb) TO authenticated;  -- sync account checked inside
