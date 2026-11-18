-- T21 self-check. STAGING / controlled window only. Everything is rolled back.
-- Prereq: t14_manikin_sync.sql and t21_import_new_manikins.sql applied. Success prints "T21 tests PASS".
BEGIN;

DO $$
DECLARE
  sync_uid uuid := gen_random_uuid();
  r jsonb; n int; en boolean;
BEGIN
  INSERT INTO public.manikin_sync_accounts(auth_user_id, email) VALUES (sync_uid, 't21-sync@test.invalid');
  PERFORM set_config('request.jwt.claim.sub', sync_uid::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', sync_uid, 'role', 'authenticated')::text, true);

  -- new family: unit is added, card created but hidden, reported in new_groups
  r := public.import_new_manikins_from_sheet('[
    {"sap_id":"T21-1","model_id":"T21X1","display_name":"T21 test model","asset_code":"A-1","model_type":"Skill Trainer","sheet_status":"พร้อมใช้งาน"},
    {"sap_id":"T21-9","model_id":"T21Z1","display_name":"T21 retired","sheet_status":"ปลดระวาง"}
  ]'::jsonb);
  ASSERT (r->>'added_count')::int = 1, 'new unit added: ' || r::text;
  ASSERT jsonb_array_length(r->'new_groups') = 1, 'new family reported';
  SELECT borrow_enabled INTO en FROM public.equipments WHERE name_th = 'T21 test model';
  ASSERT en = false, 'new card starts hidden';
  ASSERT NOT EXISTS (SELECT 1 FROM public.manikins WHERE sap_id = 'T21-9'), 'non-ready row is not imported';

  -- second unit of the same family joins the existing card, no new card, quantity recomputed
  r := public.import_new_manikins_from_sheet('[
    {"sap_id":"T21-2","model_id":"T21X2","display_name":"T21 test model","model_type":"Skill Trainer","sheet_status":"พร้อมใช้งาน"}
  ]'::jsonb);
  ASSERT (r->>'added_count')::int = 1 AND jsonb_array_length(r->'new_groups') = 0, 'joins existing card: ' || r::text;
  SELECT total_quantity INTO n FROM public.equipments WHERE name_th = 'T21 test model';
  ASSERT n = 2, 'quantity recomputed';

  -- idempotent: same rows again add nothing
  r := public.import_new_manikins_from_sheet('[{"sap_id":"T21-1","model_id":"T21X1","display_name":"T21 test model","sheet_status":"พร้อมใช้งาน"}]'::jsonb);
  ASSERT (r->>'added_count')::int = 0, 'rerun adds nothing';

  RAISE NOTICE 'T21 tests PASS';
END $$;

ROLLBACK;
