-- ============================================================
-- SiMSET Borrow MVP security hardening
-- Run in Supabase SQL Editor for project ifogcvymwhcfbfjzhwsl.
-- Purpose:
-- 1. Remove public/anon execution from admin RPCs.
-- 2. Replace broad full-access policies reported by Supabase Advisor.
-- 3. Keep public read policies only where the current MVP needs them.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Lock admin RPC execution surface.
-- ------------------------------------------------------------
DO $$
DECLARE
  fn regprocedure;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'admin_approve_request',
        'admin_reject_request',
        'admin_receive_return',
        'admin_receive_return_detailed',
        'admin_update_borrow_request_status',
        'process_equipment_return',
        'assert_borrow_admin',
        'is_borrow_admin',
        'expire_pending_requests',
        'cancel_borrow_request',
        'get_borrow_availability',
        'get_next_available_date',
        'handle_new_user'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
  END LOOP;
END $$;

-- Public borrower RPCs: keep only the intentionally public functions.
DO $$
DECLARE
  fn regprocedure;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'submit_borrow_request'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
  END LOOP;

  FOR fn IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('submit_public_borrow_request', 'get_borrow_request_status')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', fn);
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 2. Replace broad policies on public catalog/legacy tables.
-- ------------------------------------------------------------
ALTER TABLE IF EXISTS public.manikins ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.manikin_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.course_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.team_capabilities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable full access for all users" ON public.manikins;
DROP POLICY IF EXISTS "Enable full access for all users" ON public.locations;
DROP POLICY IF EXISTS "Enable full access for all users" ON public.capabilities;
DROP POLICY IF EXISTS "Enable full access for all users" ON public.manikin_capabilities;
DROP POLICY IF EXISTS "Enable full access for all users" ON public.courses;
DROP POLICY IF EXISTS "Enable full access for all users" ON public.course_logs;
DROP POLICY IF EXISTS "Admin can manage team_capabilities" ON public.team_capabilities;

DROP POLICY IF EXISTS "anon_select_manikins" ON public.manikins;
CREATE POLICY "anon_select_manikins"
ON public.manikins
FOR SELECT TO anon
USING (is_active = true AND COALESCE(needs_review, false) = false);

DROP POLICY IF EXISTS "anon_select_locations" ON public.locations;
CREATE POLICY "anon_select_locations"
ON public.locations
FOR SELECT TO anon
USING (true);

DROP POLICY IF EXISTS "anon_select_capabilities" ON public.capabilities;
CREATE POLICY "anon_select_capabilities"
ON public.capabilities
FOR SELECT TO anon
USING (COALESCE(active, true) = true);

DROP POLICY IF EXISTS "anon_select_manikin_capabilities" ON public.manikin_capabilities;
CREATE POLICY "anon_select_manikin_capabilities"
ON public.manikin_capabilities
FOR SELECT TO anon
USING (true);

DROP POLICY IF EXISTS "admin_all_manikins" ON public.manikins;
CREATE POLICY "admin_all_manikins"
ON public.manikins FOR ALL TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "admin_all_locations" ON public.locations;
CREATE POLICY "admin_all_locations"
ON public.locations FOR ALL TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "admin_all_capabilities" ON public.capabilities;
CREATE POLICY "admin_all_capabilities"
ON public.capabilities FOR ALL TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "admin_all_manikin_capabilities" ON public.manikin_capabilities;
CREATE POLICY "admin_all_manikin_capabilities"
ON public.manikin_capabilities FOR ALL TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "admin_all_courses" ON public.courses;
CREATE POLICY "admin_all_courses"
ON public.courses FOR ALL TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "admin_all_course_logs" ON public.course_logs;
CREATE POLICY "admin_all_course_logs"
ON public.course_logs FOR ALL TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "admin_all_team_capabilities" ON public.team_capabilities;
CREATE POLICY "admin_all_team_capabilities"
ON public.team_capabilities FOR ALL TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ------------------------------------------------------------
-- 3. MVP borrow tables: RLS must be DB-level source of truth.
-- ------------------------------------------------------------
ALTER TABLE IF EXISTS public.borrow_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.borrow_request_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view all borrow requests" ON public.borrow_requests;
CREATE POLICY "Admins can view all borrow requests"
ON public.borrow_requests FOR SELECT TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "Admins can update all borrow requests" ON public.borrow_requests;
CREATE POLICY "Admins can update all borrow requests"
ON public.borrow_requests FOR UPDATE TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "Admins can view all borrow request items" ON public.borrow_request_items;
CREATE POLICY "Admins can view all borrow request items"
ON public.borrow_request_items FOR SELECT TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "Admins can update all borrow request items" ON public.borrow_request_items;
CREATE POLICY "Admins can update all borrow request items"
ON public.borrow_request_items FOR UPDATE TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

COMMIT;

-- Verify after running:
-- SELECT policyname, tablename, cmd, roles, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND (
--     policyname ILIKE '%full access%'
--     OR policyname ILIKE 'admin%'
--     OR tablename IN ('borrow_requests','borrow_request_items')
--   )
-- ORDER BY tablename, policyname;
