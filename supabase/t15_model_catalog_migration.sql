-- T15 PREPARED ONLY: do not execute until separately approved.
BEGIN;

DO $$
DECLARE v_models int; v_active int; v_pending int;
BEGIN
  SELECT count(DISTINCT display_name), count(*) INTO v_models, v_active
  FROM public.manikins
  WHERE is_active AND deleted_at IS NULL AND display_name IS NOT NULL AND btrim(display_name) <> '';
  SELECT count(*) INTO v_pending
  FROM public.borrow_request_items i
  JOIN public.borrow_requests r ON r.id = i.request_id
  WHERE r.status IN ('pending','approved','ready','borrowed','overdue');
  IF v_models <> 65 OR v_active <> 130 OR v_pending <> 0 THEN
    RAISE EXCEPTION 'T15 precondition failed: models %, active %, pending %', v_models, v_active, v_pending;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.t15_model_catalog_snapshot (
  migration_key text NOT NULL,
  manikin_id uuid NOT NULL,
  old_team_code text,
  old_status text,
  old_is_active boolean,
  old_equipment_id uuid,
  PRIMARY KEY (migration_key, manikin_id)
);

INSERT INTO public.t15_model_catalog_snapshot
  (migration_key, manikin_id, old_team_code, old_status, old_is_active, old_equipment_id)
SELECT 't15_model_catalog_v1', m.id, m.team_code, m.status, m.is_active, e.id
FROM public.manikins m
LEFT JOIN public.equipments e ON e.source_team_code = m.team_code
WHERE m.is_active AND m.deleted_at IS NULL
ON CONFLICT DO NOTHING;

WITH model_names AS (
  SELECT DISTINCT display_name
  FROM public.manikins
  WHERE is_active AND deleted_at IS NULL AND display_name IS NOT NULL AND btrim(display_name) <> ''
), ins AS (
  INSERT INTO public.equipments
    (name_th, name_en, type, source_team_code, total_quantity, maintenance_quantity,
     allocation_type, borrow_enabled, inventory_mode, image_url)
  SELECT display_name, display_name, 'manikin',
         'MODEL_' || substr(md5(display_name), 1, 16), 0, 0,
         'rotating', true, 'manikin', NULL
  FROM model_names n
  WHERE NOT EXISTS (
    SELECT 1 FROM public.equipments e
    WHERE e.source_team_code = 'MODEL_' || substr(md5(n.display_name), 1, 16)
  )
  RETURNING id
)
SELECT count(*) FROM ins;

UPDATE public.manikins m
SET team_code = 'MODEL_' || substr(md5(m.display_name), 1, 16)
WHERE m.is_active AND m.deleted_at IS NULL AND m.display_name IS NOT NULL
  AND btrim(m.display_name) <> '';

UPDATE public.equipments e
SET total_quantity = q.total_quantity,
    maintenance_quantity = q.maintenance_quantity
FROM (
  SELECT team_code,
         count(*) FILTER (WHERE is_active)::int AS total_quantity,
         count(*) FILTER (WHERE is_active AND status IN ('maintenance','repair'))::int AS maintenance_quantity
  FROM public.manikins
  WHERE deleted_at IS NULL
  GROUP BY team_code
) q
WHERE e.source_team_code = q.team_code
  AND e.source_team_code LIKE 'MODEL_%';

DO $$
DECLARE v_groups int; v_manikins int; v_qty int; v_mismatch int;
BEGIN
  SELECT count(*) INTO v_groups FROM public.equipments WHERE source_team_code LIKE 'MODEL_%';
  SELECT count(*) INTO v_manikins FROM public.manikins WHERE is_active AND deleted_at IS NULL AND team_code LIKE 'MODEL_%';
  SELECT coalesce(sum(total_quantity),0) INTO v_qty FROM public.equipments WHERE source_team_code LIKE 'MODEL_%';
  SELECT count(*) INTO v_mismatch
  FROM public.equipments e
  LEFT JOIN (SELECT team_code,count(*)::int n FROM public.manikins WHERE is_active AND deleted_at IS NULL GROUP BY team_code) m
    ON m.team_code=e.source_team_code
  WHERE e.source_team_code LIKE 'MODEL_%' AND e.total_quantity <> coalesce(m.n,0);
  IF v_groups <> 65 OR v_manikins <> 130 OR v_qty <> 130 OR v_mismatch <> 0 THEN
    RAISE EXCEPTION 'T15 postcondition failed: groups %, manikins %, qty %, mismatch %', v_groups, v_manikins, v_qty, v_mismatch;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.equipments
    WHERE allocation_type NOT IN ('rotating','room_dedicated','advance_course_dedicated')
  ) THEN
    RAISE EXCEPTION 'T15 unsupported allocation_type remains';
  END IF;
END $$;

COMMIT;
