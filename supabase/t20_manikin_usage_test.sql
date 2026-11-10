-- T20 self-check (PREPARED, NOT RUN). One DO statement: fixtures are created, asserted, then the block ENDS WITH AN
-- EXCEPTION so everything rolls back (the Supabase editor does not honour BEGIN..ROLLBACK, a failing DO does).
-- Expected result: ERROR "T20_TESTS_PASS_ROLLED_BACK". Any other error text names the failing check.
-- Needs: t14_manikin_sync.sql (sync accounts) and t20_manikin_usage.sql applied.
DO $t20$
DECLARE
  sync_uid uuid := gen_random_uuid();
  staff_uid uuid := gen_random_uuid();
  today date := (now() AT TIME ZONE 'Asia/Bangkok')::date;
  eq_id uuid; req_id uuid; r jsonb; n int; msg text;
BEGIN
  INSERT INTO public.manikin_sync_accounts(auth_user_id, email) VALUES (sync_uid, 't20-sync@test.invalid');
  INSERT INTO public.manikins(sap_id, model_id, status) VALUES ('T20-M1', 'T20-M1', 'ready'), ('T20-M2', 'T20-M2', 'ready');
  INSERT INTO public.equipments(name_th) VALUES ('T20 test eq') RETURNING id INTO eq_id;
  INSERT INTO public.borrow_requests(tracking_id, borrower_name, status) VALUES ('T20-REQ', 't20', 'approved') RETURNING id INTO req_id;
  INSERT INTO public.borrow_request_items(request_id, equipment_id, start_date, end_date, qty_borrowed, manikin_sap_id)
    VALUES (req_id, eq_id, today + 1, today + 3, 1, 'T20-M1');

  -- 1) a non-sync identity is refused
  PERFORM set_config('request.jwt.claim.sub', staff_uid::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', staff_uid)::text, true);
  BEGIN PERFORM public.sync_manikin_usage_from_sheet('[]'::jsonb); msg := NULL;
  EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
  ASSERT msg LIKE '%unauthorized sync account%', '1: non-sync identity must be refused, got: ' || COALESCE(msg, 'no error');

  -- act as the sync account
  PERFORM set_config('request.jwt.claim.sub', sync_uid::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', sync_uid)::text, true);

  -- 2) upsert: 2 known manikins stored, 1 unknown counted as not_found
  r := public.sync_manikin_usage_from_sheet(jsonb_build_array(
    jsonb_build_object('session_id', 'T20-S1', 'sap_id', 'T20-M1', 'usage_date', today + 2, 'course_name', 'BLS', 'status', 'ACTIVE'),
    jsonb_build_object('session_id', 'T20-S2', 'sap_id', 'T20-M2', 'usage_date', today + 10, 'course_name', 'ACLS', 'status', 'CONFLICT'),
    jsonb_build_object('session_id', 'T20-S3', 'sap_id', 'NOPE-999', 'usage_date', today + 2, 'course_name', 'X', 'status', 'ACTIVE')));
  ASSERT (r->>'received')::int = 3 AND (r->>'upserted')::int = 2 AND (r->>'not_found')::int = 1, '2: counts ' || r::text;

  -- 3) idempotent: same payload again keeps exactly 2 rows
  PERFORM public.sync_manikin_usage_from_sheet(jsonb_build_array(
    jsonb_build_object('session_id', 'T20-S1', 'sap_id', 'T20-M1', 'usage_date', today + 2, 'course_name', 'BLS', 'status', 'ACTIVE'),
    jsonb_build_object('session_id', 'T20-S2', 'sap_id', 'T20-M2', 'usage_date', today + 10, 'course_name', 'ACLS', 'status', 'CONFLICT')));
  SELECT count(*) INTO n FROM public.manikin_usage_blocks WHERE session_id LIKE 'T20-%';
  ASSERT n = 2, '3: expected 2 rows after re-sync, got ' || n;

  -- 4) empty payload deletes nothing
  r := public.sync_manikin_usage_from_sheet('[]'::jsonb);
  SELECT count(*) INTO n FROM public.manikin_usage_blocks WHERE session_id LIKE 'T20-%';
  ASSERT n = 2 AND (r->>'deleted')::int = 0, '4: empty payload must not delete';

  -- 5) a past row survives; a future row missing from the payload is removed
  INSERT INTO public.manikin_usage_blocks(session_id, sap_id, usage_date, source_status) VALUES ('T20-S0', 'T20-M1', today - 1, 'ACTIVE');
  r := public.sync_manikin_usage_from_sheet(jsonb_build_array(
    jsonb_build_object('session_id', 'T20-S1', 'sap_id', 'T20-M1', 'usage_date', today + 2, 'course_name', 'BLS', 'status', 'ACTIVE')));
  ASSERT (r->>'deleted')::int = 1, '5: expected 1 stale future row deleted, got ' || r::text;
  ASSERT EXISTS (SELECT 1 FROM public.manikin_usage_blocks WHERE session_id = 'T20-S0'), '5: past row must be kept';
  ASSERT NOT EXISTS (SELECT 1 FROM public.manikin_usage_blocks WHERE session_id = 'T20-S2'), '5: stale future row must be gone';

  -- 6) staff sees the clash (request window today+1..today+3 contains the course day today+2)
  PERFORM set_config('request.jwt.claim.sub', staff_uid::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', staff_uid, 'app_metadata', json_build_object('role', 'staff'))::text, true);
  r := public.get_manikin_usage_conflicts();
  ASSERT jsonb_array_length(r) = 1 AND r->0->>'tracking_id' = 'T20-REQ' AND r->0->>'sap_id' = 'T20-M1'
         AND r->0->'dates' @> to_jsonb((today + 2)::text), '6: expected one clash for T20-REQ, got ' || r::text;

  -- 7) a past-only usage row (T20-S0) does not count, and a non-staff role is refused
  PERFORM set_config('request.jwt.claims', json_build_object('sub', staff_uid, 'app_metadata', json_build_object('role', 'borrower'))::text, true);
  BEGIN PERFORM public.get_manikin_usage_conflicts(); msg := NULL;
  EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
  ASSERT msg LIKE '%unauthorized%', '7: non-staff must be refused, got: ' || COALESCE(msg, 'no error');

  RAISE EXCEPTION 'T20_TESTS_PASS_ROLLED_BACK';
END
$t20$;
