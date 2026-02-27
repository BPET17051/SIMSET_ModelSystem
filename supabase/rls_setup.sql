-- ============================================================
-- SiMSET Showroom — Supabase RLS Security Setup
-- Run ONCE in: Supabase Dashboard → SQL Editor
-- ============================================================

-- ============================================================
-- PART 1: Enable Row Level Security on all public tables
-- ============================================================

ALTER TABLE manikins             ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations            ENABLE ROW LEVEL SECURITY;
ALTER TABLE capabilities         ENABLE ROW LEVEL SECURITY;
ALTER TABLE manikin_capabilities ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- PART 2: Drop old policies if re-running (idempotent)
-- ============================================================

DROP POLICY IF EXISTS "anon_select_manikins"             ON manikins;
DROP POLICY IF EXISTS "anon_select_locations"            ON locations;
DROP POLICY IF EXISTS "anon_select_capabilities"         ON capabilities;
DROP POLICY IF EXISTS "anon_select_manikin_capabilities" ON manikin_capabilities;

-- ============================================================
-- PART 3: SELECT-only policies for anon role
-- ============================================================

-- manikins: only active + reviewed units (matches app.js filter)
CREATE POLICY "anon_select_manikins"
ON manikins
FOR SELECT
TO anon
USING (is_active = true AND needs_review = false);

-- locations: all locations visible (no sensitive data)
CREATE POLICY "anon_select_locations"
ON locations
FOR SELECT
TO anon
USING (true);

-- capabilities: only active ones
CREATE POLICY "anon_select_capabilities"
ON capabilities
FOR SELECT
TO anon
USING (active = true);

-- manikin_capabilities: all visible (FK-only table)
CREATE POLICY "anon_select_manikin_capabilities"
ON manikin_capabilities
FOR SELECT
TO anon
USING (true);

-- ============================================================
-- PART 4: Public View — strips sensitive columns from manikins
-- Exposes: sap_id, asset_name, asset_code, status,
--          location_id, manikin_type
-- Hides:   note, created_at, updated_at, internal fields
-- ============================================================

CREATE OR REPLACE VIEW public_manikins AS
SELECT
    sap_id,
    asset_name,
    asset_code,
    status,
    location_id,
    manikin_type
FROM manikins
WHERE is_active = true
  AND needs_review = false;

-- Grant anon access to the view
GRANT SELECT ON public_manikins TO anon;

-- ============================================================
-- PART 5: Verify (run these SELECT checks after the above)
-- ============================================================

-- Check RLS is enabled:
-- SELECT tablename, rowsecurity FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename IN ('manikins','locations','capabilities','manikin_capabilities');

-- Check policies created:
-- SELECT policyname, tablename, cmd, roles
-- FROM pg_policies
-- WHERE schemaname = 'public';

-- Test as anon (should NOT see note column or inactive rows):
-- SET LOCAL ROLE anon;
-- SELECT * FROM public_manikins LIMIT 5;
-- SELECT * FROM manikins WHERE is_active = false; -- should return 0 rows

-- ============================================================
-- PART 6: Realtime Publication Security
-- ============================================================
-- Enable Realtime for the manikins table to ensure broadcast events
-- are generated. Because RLS is enabled on the table (PART 1),
-- Realtime will respect the RLS policies and ONLY broadcast rows
-- that the 'anon' role has access to via the "anon_select_manikins" policy.
--
-- Note: Depending on your Supabase project settings, you may need
-- to run this explicitly if you haven't enabled Realtime via the UI.
--
-- ALTER PUBLICATION supabase_realtime ADD TABLE manikins;

-- ============================================================
-- PART 7: Admin Write Policies (app_metadata.role = 'admin')
-- ============================================================
-- Set role in Supabase Dashboard: Authentication → Users → [user]
-- → Edit Raw app_metadata → { "role": "admin" }
--
-- These policies enforce the DB-level admin gate. Even if the
-- client-side check in admin.js is bypassed, the DB will reject
-- any write from a non-admin authenticated user.
-- ============================================================

DROP POLICY IF EXISTS "admin_all_manikins"             ON manikins;
DROP POLICY IF EXISTS "admin_all_locations"            ON locations;
DROP POLICY IF EXISTS "admin_all_capabilities"         ON capabilities;
DROP POLICY IF EXISTS "admin_all_manikin_capabilities" ON manikin_capabilities;

-- manikins: admin can read all rows (including inactive/review) and write
CREATE POLICY "admin_all_manikins"
ON manikins FOR ALL
TO authenticated
USING     ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
WITH CHECK((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- locations: admin full CRUD
CREATE POLICY "admin_all_locations"
ON locations FOR ALL
TO authenticated
USING     ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
WITH CHECK((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- capabilities: admin full CRUD
CREATE POLICY "admin_all_capabilities"
ON capabilities FOR ALL
TO authenticated
USING     ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
WITH CHECK((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- manikin_capabilities: admin full CRUD
CREATE POLICY "admin_all_manikin_capabilities"
ON manikin_capabilities FOR ALL
TO authenticated
USING     ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
WITH CHECK((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- =============================================
-- Verify admin policies (run after applying):
-- =============================================
-- SELECT policyname, tablename, cmd, roles, qual
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND policyname LIKE 'admin%';

