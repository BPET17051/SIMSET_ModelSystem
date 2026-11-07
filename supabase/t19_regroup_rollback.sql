-- T19 ROLLBACK (PREPARED, NOT RUN). Undoes t19_regroup.sql: units go back to their old team_code,
-- deleted/disabled equipments come back with their old quantities and tags.
-- Single DO statement = atomic even if the SQL editor does not keep BEGIN..COMMIT together. Run the WHOLE file.
-- Not undone (additive, harmless): tags/image copied onto survivors, allocation-audit rows re-pointed,
-- the manikins.model_group column.
DO $t19r$
BEGIN
  UPDATE public.manikins m
  SET team_code = s.old_team_code
  FROM public.t15_model_catalog_snapshot s
  WHERE s.migration_key = 't19_model_group_v1' AND s.manikin_id = m.id;

  INSERT INTO public.equipments
  SELECT b.* FROM public.t19_equipments_backup b
  WHERE NOT EXISTS (SELECT 1 FROM public.equipments e WHERE e.id = b.id);

  UPDATE public.equipments e
  SET borrow_enabled = b.borrow_enabled,
      total_quantity = b.total_quantity,
      maintenance_quantity = b.maintenance_quantity
  FROM public.t19_equipments_backup b
  WHERE b.id = e.id;

  INSERT INTO public.equipment_tags
  SELECT t.* FROM public.t19_equipment_tags_backup t
  WHERE EXISTS (SELECT 1 FROM public.equipments e WHERE e.id = t.equipment_id)
  ON CONFLICT DO NOTHING;
END
$t19r$;
