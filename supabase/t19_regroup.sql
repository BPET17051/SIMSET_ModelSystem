-- T19 step 2: one catalog card per model_group (RA = 15 units, shown under its most common name).
-- PREPARED, NOT RUN. Needs t19_model_group.sql applied first. Undo with t19_regroup_rollback.sql.
--
-- ONE single DO statement on purpose: the Supabase SQL editor does not keep BEGIN..COMMIT as one
-- transaction (temp tables vanished between statements), but a DO block is atomic by itself -- any
-- RAISE EXCEPTION below rolls the whole thing back, whatever the editor does. Run the WHOLE file.
--
-- What it does (reuse-first: no new equipments, no renames, no ids change for the survivors):
--   * per group, the survivor = the existing equipment named after the group's most common display_name
--     (T15 already created it as MODEL_<md5(name)>), so its id, image, tags and history stay put;
--   * every unit of the group is moved onto the survivor's team_code;
--   * tags / image / allocation audit of the merged-away equipments are carried over to the survivor;
--   * merged-away equipments are deleted if unreferenced by borrow requests, otherwise disabled (kept for history);
--   * quantities are recomputed from the units.
-- The other names in a group still show in the quick view (get_public_equipment_manikins counts per name).
-- ponytail: "most common name wins, ties -> alphabetical". Rename a survivor by hand if that is not the title you want.
DO $t19$
DECLARE
  v text;
  v_groups int; v_active_groups int; v_units int; v_qty int; v_bad int; v_kept int;
BEGIN
  DROP TABLE IF EXISTS pg_temp.t19_grp, pg_temp.t19_map, pg_temp.t19_orphans;

  -- Backups the rollback needs. RLS on + no grants: these must never be readable from the API.
  CREATE TABLE IF NOT EXISTS public.t19_equipments_backup     (LIKE public.equipments     INCLUDING ALL);
  CREATE TABLE IF NOT EXISTS public.t19_equipment_tags_backup (LIKE public.equipment_tags INCLUDING ALL);
  ALTER TABLE public.t19_equipments_backup      ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.t19_equipment_tags_backup  ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.t15_model_catalog_snapshot ENABLE ROW LEVEL SECURITY;  -- T15 left it open; tighten while we are here
  REVOKE ALL ON public.t19_equipments_backup, public.t19_equipment_tags_backup, public.t15_model_catalog_snapshot
    FROM PUBLIC, anon, authenticated;

  -- Per-unit snapshot (same table T15 used, new key) so units can be put back.
  INSERT INTO public.t15_model_catalog_snapshot
    (migration_key, manikin_id, old_team_code, old_status, old_is_active, old_equipment_id)
  SELECT 't19_model_group_v1', m.id, m.team_code, m.status, m.is_active, e.id
  FROM public.manikins m
  LEFT JOIN public.equipments e ON e.source_team_code = m.team_code
  WHERE m.deleted_at IS NULL
  ON CONFLICT DO NOTHING;

  -- group -> survivor team_code
  CREATE TEMP TABLE t19_grp ON COMMIT DROP AS
  SELECT DISTINCT ON (s.model_group)
         s.model_group,
         s.display_name AS top_name,
         'MODEL_' || substr(md5(s.display_name), 1, 16) AS primary_code
  FROM (
    SELECT model_group, display_name, count(*) AS n
    FROM public.manikins
    WHERE is_active AND deleted_at IS NULL AND model_group IS NOT NULL
      AND btrim(coalesce(display_name, '')) <> ''
    GROUP BY model_group, display_name
  ) s
  ORDER BY s.model_group, s.n DESC, s.display_name;

  -- old equipment -> survivor (via where its units sat before)
  CREATE TEMP TABLE t19_map ON COMMIT DROP AS
  SELECT DISTINCT s.old_equipment_id AS old_id, p.id AS primary_id
  FROM public.t15_model_catalog_snapshot s
  JOIN public.manikins m   ON m.id = s.manikin_id
  JOIN t19_grp g           ON g.model_group = m.model_group
  JOIN public.equipments p ON p.source_team_code = g.primary_code AND p.inventory_mode = 'manikin'
  WHERE s.migration_key = 't19_model_group_v1' AND s.old_equipment_id IS NOT NULL;

  -- catalog-managed equipments that stop being a card
  CREATE TEMP TABLE t19_orphans ON COMMIT DROP AS
  SELECT e.id
  FROM public.equipments e
  WHERE e.inventory_mode = 'manikin'
    AND (e.source_team_code LIKE 'MODEL_%' OR e.source_team_code = 'BLS_ADULT_QCPR')
    AND e.source_team_code NOT IN (SELECT primary_code FROM t19_grp);

  -- Preconditions: stop on anything a human should decide.
  IF EXISTS (SELECT 1 FROM public.manikins WHERE is_active AND deleted_at IS NULL AND model_group IS NULL) THEN
    RAISE EXCEPTION 'T19: active manikins without model_group (run t19_model_group.sql first)';
  END IF;

  SELECT string_agg(g.model_group, ', ') INTO v FROM t19_grp g
  WHERE NOT EXISTS (SELECT 1 FROM public.equipments e
                    WHERE e.source_team_code = g.primary_code AND e.inventory_mode = 'manikin');
  IF v IS NOT NULL THEN RAISE EXCEPTION 'T19: no survivor equipment for groups: %', v; END IF;

  SELECT string_agg(d.primary_code, ', ') INTO v
  FROM (SELECT primary_code FROM t19_grp GROUP BY primary_code HAVING count(*) > 1) d;
  IF v IS NOT NULL THEN RAISE EXCEPTION 'T19: one name is the top name of two groups: %', v; END IF;

  SELECT string_agg(DISTINCT g.model_group, ', ') INTO v
  FROM t19_grp g
  JOIN public.equipments p ON p.source_team_code = g.primary_code
  JOIN t19_map mp          ON mp.primary_id = p.id
  JOIN public.equipments o ON o.id = mp.old_id
  WHERE o.allocation_type IS DISTINCT FROM p.allocation_type;
  IF v IS NOT NULL THEN RAISE EXCEPTION 'T19: allocation_type differs inside group (decide first): %', v; END IF;

  -- Backups (survivors + orphans + their tags).
  INSERT INTO public.t19_equipments_backup
  SELECT e.* FROM public.equipments e
  WHERE e.id IN (SELECT id FROM t19_orphans UNION SELECT primary_id FROM t19_map)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.t19_equipment_tags_backup
  SELECT t.* FROM public.equipment_tags t
  WHERE t.equipment_id IN (SELECT id FROM t19_orphans UNION SELECT primary_id FROM t19_map)
  ON CONFLICT DO NOTHING;

  -- Carry over tags (union), image (only if survivor has none) and allocation audit history.
  INSERT INTO public.equipment_tags (equipment_id, tag_group, tag_value, evidence)
  SELECT DISTINCT mp.primary_id, t.tag_group, t.tag_value, t.evidence
  FROM public.equipment_tags t
  JOIN t19_map mp ON mp.old_id = t.equipment_id
  WHERE mp.old_id <> mp.primary_id
  ON CONFLICT DO NOTHING;

  UPDATE public.equipments p
  SET image_url = (SELECT o.image_url FROM public.equipments o JOIN t19_map mp ON mp.old_id = o.id
                   WHERE mp.primary_id = p.id AND o.image_url IS NOT NULL LIMIT 1)
  WHERE p.id IN (SELECT primary_id FROM t19_map) AND p.image_url IS NULL;

  UPDATE public.manikin_allocation_type_audit a
  SET equipment_id = mp.primary_id
  FROM t19_map mp
  WHERE a.equipment_id = mp.old_id AND mp.old_id <> mp.primary_id;

  -- Move the units.
  UPDATE public.manikins m
  SET team_code = g.primary_code
  FROM t19_grp g
  WHERE m.model_group = g.model_group AND m.deleted_at IS NULL
    AND m.team_code IS DISTINCT FROM g.primary_code;

  -- Quantities from units (same convention as T15: total = active units, maintenance = active & in repair).
  UPDATE public.equipments e
  SET total_quantity = q.total, maintenance_quantity = q.maint
  FROM (
    SELECT team_code,
           count(*) FILTER (WHERE is_active)::int AS total,
           count(*) FILTER (WHERE is_active AND status IN ('maintenance', 'repair'))::int AS maint
    FROM public.manikins WHERE deleted_at IS NULL GROUP BY team_code
  ) q
  WHERE e.source_team_code = q.team_code
    AND e.source_team_code IN (SELECT primary_code FROM t19_grp);

  -- Merged-away equipments: keep only if a borrow request still points at them.
  UPDATE public.equipments e
  SET borrow_enabled = false, total_quantity = 0, maintenance_quantity = 0
  WHERE e.id IN (SELECT id FROM t19_orphans)
    AND EXISTS (SELECT 1 FROM public.borrow_request_items i WHERE i.equipment_id = e.id);

  DELETE FROM public.equipments e
  WHERE e.id IN (SELECT id FROM t19_orphans)
    AND NOT EXISTS (SELECT 1 FROM public.borrow_request_items i WHERE i.equipment_id = e.id);

  -- Postconditions (the self-check): abort everything if the catalog is not consistent.
  SELECT count(*) INTO v_groups FROM t19_grp;
  SELECT count(DISTINCT model_group) INTO v_active_groups
    FROM public.manikins WHERE is_active AND deleted_at IS NULL;
  SELECT count(*) INTO v_units FROM public.manikins WHERE is_active AND deleted_at IS NULL;
  SELECT coalesce(sum(total_quantity), 0) INTO v_qty
    FROM public.equipments WHERE source_team_code IN (SELECT primary_code FROM t19_grp);
  SELECT count(*) INTO v_bad FROM public.manikins m
   WHERE m.is_active AND m.deleted_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM t19_grp g
                     JOIN public.equipments e ON e.source_team_code = g.primary_code
                          AND e.borrow_enabled AND e.inventory_mode = 'manikin'
                     WHERE g.primary_code = m.team_code AND g.model_group = m.model_group);
  SELECT count(*) INTO v_kept FROM public.equipments e
   WHERE e.id IN (SELECT id FROM t19_orphans);

  IF v_groups <> v_active_groups OR v_qty <> v_units OR v_bad <> 0 THEN
    RAISE EXCEPTION 'T19 postcondition failed: groups % vs %, qty % vs units %, unplaced units %',
      v_groups, v_active_groups, v_qty, v_units, v_bad;
  END IF;
  RAISE NOTICE 'T19 ok: % groups, % units, % old equipments kept for history', v_groups, v_units, v_kept;
END
$t19$;

-- After it succeeds, run the preview query at the bottom of t19_model_group.sql:
-- every group must now show exactly ONE team_code (RA: one code, 15 units).
