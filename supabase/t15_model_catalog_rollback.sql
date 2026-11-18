-- T15 ROLLBACK PREPARED ONLY: execute only after reviewing the snapshot.
BEGIN;

UPDATE public.manikins m
SET team_code = s.old_team_code,
    status = s.old_status,
    is_active = s.old_is_active
FROM public.t15_model_catalog_snapshot s
WHERE s.migration_key = 't15_model_catalog_v1'
  AND s.manikin_id = m.id;

UPDATE public.equipments e
SET total_quantity = q.total_quantity,
    maintenance_quantity = q.maintenance_quantity
FROM (
  SELECT team_code,
         count(*) FILTER (WHERE is_active AND status = 'ready')::int AS total_quantity,
         count(*) FILTER (WHERE is_active AND status IN ('maintenance','repair'))::int AS maintenance_quantity
  FROM public.manikins
  WHERE deleted_at IS NULL
  GROUP BY team_code
) q
WHERE e.source_team_code = q.team_code;

DELETE FROM public.equipments e
WHERE e.source_team_code LIKE 'MODEL_%'
  AND NOT EXISTS (SELECT 1 FROM public.borrow_request_items i WHERE i.equipment_id = e.id);

COMMIT;
