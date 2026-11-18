-- T17 patient-group seed (strict). Run only after supabase/t17_equipment_tags.sql is applied.
-- Inserts 133 SAP rows into equipment_tags(patient_group) via manikins.sap_id -> manikins.team_code -> equipments.source_team_code.
-- Explicitly excluded (unmatched in production): C5 198000089399, C6 198000089400, C9 131000020971, C15 131000012083,
-- C16 131000020919, C17 131000020794, C18 131000035967.
-- Every check raises an exception. An exception aborts the transaction, so nothing is written.
-- Seeds only equipment_tags. Does not change manikins, equipments, statuses, or availability.

BEGIN;

CREATE TEMP TABLE t17_sheet (sap_id text PRIMARY KEY, category text NOT NULL) ON COMMIT DROP;
INSERT INTO t17_sheet (sap_id, category) VALUES
  ('131200000516', 'Adult'),
  ('131200000517', 'Adult'),
  ('131200000518', 'Adult'),
  ('131200000519', 'Adult'),
  ('131200000520', 'Adult'),
  ('131200000521', 'Adult'),
  ('131200000522', 'Adult'),
  ('131200000523', 'Adult'),
  ('131200000524', 'Adult'),
  ('131200000525', 'Adult'),
  ('131200000554', 'Adult'),
  ('131200000555', 'Adult'),
  ('131200000556', 'Adult'),
  ('131200000557', 'Adult'),
  ('131200000558', 'Adult'),
  ('131200000496', 'Adult'),
  ('131200000497', 'Adult'),
  ('131200000498', 'Adult'),
  ('131200000499', 'Adult'),
  ('131200000500', 'Adult'),
  ('131200000490', 'Infant'),
  ('131200000491', 'Infant'),
  ('131200000492', 'Infant'),
  ('131200000493', 'Infant'),
  ('131200000494', 'Infant'),
  ('131200000495', 'Infant'),
  ('131200000377', 'Adult'),
  ('131200000378', 'Adult'),
  ('131200000527', 'Pediatric'),
  ('131200000526', 'Adult'),
  ('131000016343', 'Pediatric'),
  ('131200000424', 'Pediatric'),
  ('131200000480', 'Pediatric'),
  ('131200000481', 'Pediatric'),
  ('131200000419', 'Adult'),
  ('131200000420', 'Adult'),
  ('131200000421', 'Adult'),
  ('131200000487', 'Adult'),
  ('131200000489', 'Adult'),
  ('131200000559', 'Adult'),
  ('131200000584', 'Adult'),
  ('131200000585', 'Adult'),
  ('131200000003', 'Pediatric'),
  ('131200000004', 'Pediatric'),
  ('131200000390', 'Pediatric'),
  ('131200000391', 'Pediatric'),
  ('131000012496', 'Adult'),
  ('131200000425', 'Infant'),
  ('131200000379', 'Infant'),
  ('131200000380', 'Infant'),
  ('131200000482', 'Infant'),
  ('131200000483', 'Infant'),
  ('131200000484', 'Infant'),
  ('131200000485', 'Infant'),
  ('131200000486', 'Infant'),
  ('131000015191', 'Infant'),
  ('131000016342', 'Infant'),
  ('131200000387', 'Infant'),
  ('131200000409', 'Infant'),
  ('131200000410', 'Infant'),
  ('131200000513', 'Pediatric'),
  ('131200000514', 'Pediatric'),
  ('131200000411', 'Pediatric'),
  ('131000048258', 'Adult'),
  ('131200000577', 'Adult'),
  ('131200000578', 'Adult'),
  ('131200000581', 'Adult'),
  ('131000015192', 'Infant'),
  ('131000015193', 'Infant'),
  ('131200000412', 'Infant'),
  ('131200000515', 'Infant'),
  ('131000016339', 'Pediatric'),
  ('131000016340', 'Pediatric'),
  ('131000016341', 'Pediatric'),
  ('131200000415', 'Pediatric'),
  ('131200000416', 'Pediatric'),
  ('131200000417', 'Pediatric'),
  ('131200000383', 'Pediatric'),
  ('131200000384', 'Pediatric'),
  ('131000016336', 'Infant'),
  ('131000016337', 'Infant'),
  ('131000016338', 'Infant'),
  ('131000019014', 'Infant'),
  ('131000019015', 'Infant'),
  ('131000019016', 'Infant'),
  ('131200000381', 'Infant'),
  ('131200000382', 'Infant'),
  ('131200000418', 'Infant'),
  ('131000012500', 'Pediatric'),
  ('131000012501', 'Pediatric'),
  ('131200000236', 'Pediatric'),
  ('131200000237', 'Pediatric'),
  ('131200000386', 'Pediatric'),
  ('131200000385', 'Pediatric'),
  ('131000012494', 'Adult'),
  ('131000016737', 'Adult'),
  ('131000016738', 'Adult'),
  ('131000016739', 'Adult'),
  ('131000016740', 'Adult'),
  ('131000016741', 'Adult'),
  ('131200000244', 'Adult'),
  ('131200000245', 'Adult'),
  ('131200000246', 'Adult'),
  ('131200000234', 'Adult'),
  ('131200000235', 'Adult'),
  ('198000001243', 'Adult'),
  ('198000063815', 'Adult'),
  ('198000089401', 'Adult'),
  ('131200000247', 'Adult'),
  ('131000032818', 'Adult'),
  ('131000032819', 'Adult'),
  ('131000018200', 'Adult'),
  ('131200000502', 'Pediatric'),
  ('198000001116', 'Infant'),
  ('131000012505', 'Infant'),
  ('131200000388', 'Infant'),
  ('131200000426', 'Infant'),
  ('131200000561', 'Infant'),
  ('131200000562', 'Infant'),
  ('131200000563', 'Infant'),
  ('131200000564', 'Infant'),
  ('131200000565', 'Infant'),
  ('131200000414', 'Adult'),
  ('131200000413', 'Obstetric'),
  ('131000040345', 'Infant'),
  ('131200000609', 'Infant'),
  ('131200000610', 'Infant'),
  ('131200000594', 'Adult'),
  ('131200000595', 'Adult'),
  ('131200000596', 'Adult'),
  ('131200000597', 'Adult'),
  ('131200000598', 'Adult'),
  ('131200000599', 'Adult');

DO $$
DECLARE v_rows int; v_matched int; v_equipments int; v_multi_map int; v_conflict int;
BEGIN
  SELECT count(*) INTO v_rows FROM t17_sheet;
  IF v_rows <> 133 THEN RAISE EXCEPTION 'T17 abort: expected 133 sheet rows, got %', v_rows; END IF;

  SELECT count(*) INTO v_matched FROM t17_sheet s WHERE EXISTS (SELECT 1 FROM public.manikins m WHERE m.sap_id = s.sap_id);
  IF v_matched <> 133 THEN RAISE EXCEPTION 'T17 abort: matched % of 133 sheet rows in manikins', v_matched; END IF;

  SELECT count(*) INTO v_multi_map FROM (
    SELECT s.sap_id FROM t17_sheet s JOIN public.manikins m ON m.sap_id = s.sap_id
    JOIN public.equipments e ON e.source_team_code = m.team_code
    GROUP BY s.sap_id HAVING count(DISTINCT e.id) > 1) x;
  IF v_multi_map > 0 THEN RAISE EXCEPTION 'T17 abort: % sap_id map to more than one equipment', v_multi_map; END IF;

  SELECT count(DISTINCT e.id) INTO v_equipments FROM t17_sheet s JOIN public.manikins m ON m.sap_id = s.sap_id
    JOIN public.equipments e ON e.source_team_code = m.team_code;
  IF v_equipments <> 66 THEN RAISE EXCEPTION 'T17 abort: expected 66 equipments, got %', v_equipments; END IF;

  SELECT count(*) INTO v_conflict FROM (
    SELECT e.id FROM t17_sheet s JOIN public.manikins m ON m.sap_id = s.sap_id
    JOIN public.equipments e ON e.source_team_code = m.team_code
    GROUP BY e.id HAVING count(DISTINCT s.category) > 1) x;
  IF v_conflict > 0 THEN RAISE EXCEPTION 'T17 abort: % equipments have conflicting patient groups', v_conflict; END IF;
END $$;

INSERT INTO public.equipment_tags (equipment_id, tag_group, tag_value, evidence)
SELECT DISTINCT e.id, 'patient_group', s.category, 'sheet_category'
FROM t17_sheet s
JOIN public.manikins m ON m.sap_id = s.sap_id
JOIN public.equipments e ON e.source_team_code = m.team_code
ON CONFLICT (equipment_id, tag_group, tag_value) DO NOTHING;

DO $$
DECLARE v_tags int;
BEGIN
  SELECT count(*) INTO v_tags FROM public.equipment_tags WHERE tag_group = 'patient_group' AND evidence = 'sheet_category';
  IF v_tags <> 66 THEN RAISE EXCEPTION 'T17 abort: expected 66 patient_group tags, got %', v_tags; END IF;
END $$;

COMMIT;
