-- T14 self-check. STAGING / controlled window only. Everything is rolled back.
-- Prereq: t14_manikin_sync.sql already applied in this database.
-- Run as the SQL-editor/owner role. Any failed ASSERT aborts with its message;
-- success prints "T14 tests PASS". Expect: ERROR-free run, then ROLLBACK.
BEGIN;

DO $$
DECLARE
  sync_uid  uuid := gen_random_uuid();
  staff_uid uuid := gen_random_uuid();
  eq_id uuid; req_id uuid; course_old uuid; course_new uuid;
  r jsonb; n int; msg text;
BEGIN
  -- ---- fixtures (all rolled back) ----
  INSERT INTO public.manikin_sync_accounts(auth_user_id, email) VALUES (sync_uid, 't14-sync@test.invalid');
  INSERT INTO public.manikins(sap_id, model_id, status) VALUES
    ('T14-M1','T14-M1','maintenance'),   -- test 1
    ('T14-M2','T14-M2','ready'),         -- test 2 (active borrow)
    ('T14-M3','T14-M3','maintenance'),   -- test 3a (transferred note)
    ('T14-M4','T14-M4','maintenance'),   -- test 3b/3c (course)
    ('T14-M5','T14-M5','maintenance');   -- test 3c (ended course)
  INSERT INTO public.equipments(name_th) VALUES ('T14 test eq') RETURNING id INTO eq_id;
  INSERT INTO public.borrow_requests(tracking_id, borrower_name, status) VALUES ('T14-REQ','t14','pending') RETURNING id INTO req_id;
  INSERT INTO public.borrow_request_items(request_id, equipment_id, start_date, end_date, qty_borrowed, manikin_sap_id)
    VALUES (req_id, eq_id, current_date, current_date, 1, 'T14-M2');
  INSERT INTO public.courses(course_code, course_name, starts_on, ends_on) VALUES ('T14-NEW','t14 future', current_date, current_date + 1) RETURNING id INTO course_new;
  INSERT INTO public.courses(course_code, course_name, starts_on, ends_on) VALUES ('T14-OLD','t14 ended', current_date - 5, current_date - 1) RETURNING id INTO course_old;
  INSERT INTO public.course_reserved_manikins(course_id, manikin_sap_id) VALUES (course_new,'T14-M4'),(course_old,'T14-M5');

  -- act as the sync account
  PERFORM set_config('request.jwt.claim.sub', sync_uid::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', sync_uid)::text, true);

  -- ---- TEST 1: conflict is created once, re-created only after resolve ----
  r := public.sync_manikin_status_from_sheet('[{"sap_id":"T14-M1","sheet_status":"พร้อมใช้งาน"}]');
  ASSERT (r->>'conflict_count')::int = 1, 'T1 first sync must create 1 conflict';
  r := public.sync_manikin_status_from_sheet('[{"sap_id":"T14-M1","sheet_status":"พร้อมใช้งาน"}]');
  ASSERT (r->>'conflict_count')::int = 0, 'T1 second sync must not duplicate the open conflict';
  SELECT count(*) INTO n FROM public.manikin_sync_conflicts WHERE sap_id='T14-M1' AND resolved_at IS NULL;
  ASSERT n = 1, 'T1 exactly one open conflict';

  -- staff resolves
  PERFORM set_config('request.jwt.claim.sub', staff_uid::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', staff_uid, 'email','staff@test.invalid',
          'app_metadata', json_build_object('role','staff'))::text, true);
  PERFORM public.resolve_manikin_sync_conflict('T14-M1', 'repaired');
  ASSERT (SELECT status FROM public.manikins WHERE sap_id='T14-M1') = 'ready', 'T1 resolve sets ready';
  ASSERT (SELECT count(*) FROM public.manikin_sync_conflicts WHERE sap_id='T14-M1' AND resolved_at IS NULL) = 0, 'T1 conflict closed';

  -- breaks again -> a NEW conflict must be creatable
  UPDATE public.manikins SET status='maintenance' WHERE sap_id='T14-M1';
  PERFORM set_config('request.jwt.claim.sub', sync_uid::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', sync_uid)::text, true);
  r := public.sync_manikin_status_from_sheet('[{"sap_id":"T14-M1","sheet_status":"พร้อมใช้งาน"}]');
  ASSERT (r->>'conflict_count')::int = 1, 'T1 repeat repair after resolve must create a new conflict';
  ASSERT (SELECT count(*) FROM public.manikin_sync_conflicts WHERE sap_id='T14-M1') = 2, 'T1 history kept (2 rows)';

  -- ---- TEST 2: transferred + active borrow => untouched, not counted as skipped ----
  r := public.sync_manikin_status_from_sheet('[{"sap_id":"T14-M2","sheet_status":"โอนย้าย"}]');
  ASSERT (r->>'changed_count')::int = 0 AND (r->>'skipped_count')::int = 0 AND (r->>'transferred_count')::int = 1,
         'T2 counts: changed 0, skipped 0, transferred 1';
  ASSERT (SELECT is_active AND NOT needs_review AND notes IS NULL FROM public.manikins WHERE sap_id='T14-M2'),
         'T2 row with active borrow must stay untouched';

  -- ---- TEST 3: resolve guards (as staff) ----
  PERFORM set_config('request.jwt.claim.sub', staff_uid::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', staff_uid, 'email','staff@test.invalid',
          'app_metadata', json_build_object('role','staff'))::text, true);

  -- 3a transferred note
  UPDATE public.manikins SET notes='Transferred; excluded from borrowing', is_active=false, needs_review=true WHERE sap_id='T14-M3';
  INSERT INTO public.manikin_sync_conflicts(sap_id, model_id, sheet_status, production_status, reason) VALUES ('T14-M3','T14-M3','พร้อมใช้งาน','maintenance','t');
  BEGIN PERFORM public.resolve_manikin_sync_conflict('T14-M3','x'); msg := NULL;
  EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
  ASSERT msg LIKE '%transferred manikin%', 'T3a resolve must refuse transferred manikin, got: ' || COALESCE(msg,'no error');

  -- 3b future course reservation
  INSERT INTO public.manikin_sync_conflicts(sap_id, model_id, sheet_status, production_status, reason) VALUES ('T14-M4','T14-M4','พร้อมใช้งาน','maintenance','t');
  BEGIN PERFORM public.resolve_manikin_sync_conflict('T14-M4','x'); msg := NULL;
  EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
  ASSERT msg LIKE '%active borrow or course reservation%', '3b must refuse live course, got: ' || COALESCE(msg,'no error');

  -- 3c ended course must NOT block
  INSERT INTO public.manikin_sync_conflicts(sap_id, model_id, sheet_status, production_status, reason) VALUES ('T14-M5','T14-M5','พร้อมใช้งาน','maintenance','t');
  PERFORM public.resolve_manikin_sync_conflict('T14-M5','ok');
  ASSERT (SELECT status FROM public.manikins WHERE sap_id='T14-M5') = 'ready', 'T3c ended course must not block resolve';

  -- 3d non-staff role refused
  PERFORM set_config('request.jwt.claims', json_build_object('sub', staff_uid, 'app_metadata', json_build_object('role','borrower'))::text, true);
  BEGIN PERFORM public.resolve_manikin_sync_conflict('T14-M1','x'); msg := NULL;
  EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
  ASSERT msg LIKE '%unauthorized%', '3d non-staff must be refused, got: ' || COALESCE(msg,'no error');

  RAISE NOTICE 'T14 tests PASS';
END $$;

ROLLBACK;
