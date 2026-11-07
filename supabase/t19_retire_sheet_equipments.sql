-- T19 step 3 (PREPARED, NOT RUN): remove the 15 old "<type> - <patient group>" equipments (SHEET_* team codes).
-- Evidence (production query): all 15 have units = 0 (no manikin points at them), refs = 0 (no borrow request
-- items), tags = 0. They only show up as empty duplicate cards. Anon already hides disabled rows, but logged-in
-- staff see every row, so they are deleted (after a backup) instead of just disabled.
-- ONE DO statement = atomic in the Supabase editor. Run the WHOLE file.
-- Undo (restores only these rows):
--   INSERT INTO public.equipments SELECT b.* FROM public.t19_equipments_backup b
--   WHERE b.source_team_code LIKE 'SHEET\_%' AND NOT EXISTS (SELECT 1 FROM public.equipments e WHERE e.id = b.id);
DO $t19s$
DECLARE v_n int; v_dep int;
BEGIN
  CREATE TEMP TABLE t19_sheet_eq ON COMMIT DROP AS
  SELECT e.id
  FROM public.equipments e
  WHERE e.inventory_mode = 'manikin'
    AND e.source_team_code LIKE 'SHEET\_%'
    AND e.name_th ~ ' - (Adult|Infant|Pediatric|Obstetric)$'
    AND NOT EXISTS (SELECT 1 FROM public.manikins m
                    WHERE m.team_code = e.source_team_code AND m.deleted_at IS NULL)
    AND NOT EXISTS (SELECT 1 FROM public.borrow_request_items i WHERE i.equipment_id = e.id);

  SELECT count(*) INTO v_n FROM t19_sheet_eq;
  IF v_n <> 15 THEN
    RAISE EXCEPTION 'T19 step 3: expected 15 empty SHEET_* equipments, found % (nothing changed)', v_n;
  END IF;

  -- Cascade targets must be empty too, otherwise a human decides.
  SELECT (SELECT count(*) FROM public.equipment_units u WHERE u.equipment_id IN (SELECT id FROM t19_sheet_eq))
       + (SELECT count(*) FROM public.manikin_allocation_type_audit a WHERE a.equipment_id IN (SELECT id FROM t19_sheet_eq))
       + (SELECT count(*) FROM public.equipment_tags t WHERE t.equipment_id IN (SELECT id FROM t19_sheet_eq))
    INTO v_dep;
  IF v_dep <> 0 THEN
    RAISE EXCEPTION 'T19 step 3: % dependent rows (units/audit/tags) would be cascade-deleted (nothing changed)', v_dep;
  END IF;

  INSERT INTO public.t19_equipments_backup
  SELECT e.* FROM public.equipments e WHERE e.id IN (SELECT id FROM t19_sheet_eq)
  ON CONFLICT DO NOTHING;

  DELETE FROM public.equipments WHERE id IN (SELECT id FROM t19_sheet_eq);

  IF EXISTS (SELECT 1 FROM public.equipments e WHERE e.id IN (SELECT id FROM t19_sheet_eq)) THEN
    RAISE EXCEPTION 'T19 step 3: delete did not remove all rows';
  END IF;
  RAISE NOTICE 'T19 step 3 ok: % equipments removed (backed up in t19_equipments_backup)', v_n;
END
$t19s$;
