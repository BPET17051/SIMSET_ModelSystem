-- ============================================================
-- SiMSET — Audit Log + Soft Delete Migration
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- ============================================================
-- PART 1: Soft Delete — add deleted_at to manikins
-- ============================================================
-- Instead of hard DELETE, admin panel will set deleted_at to NOW()
-- Queries that fetch active manikins must include:
--   AND deleted_at IS NULL

ALTER TABLE manikins
    ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

-- Update anon SELECT policy to also exclude soft-deleted rows
DROP POLICY IF EXISTS "anon_select_manikins" ON manikins;
CREATE POLICY "anon_select_manikins"
ON manikins FOR SELECT TO anon
USING (
    is_active     = true
    AND needs_review  = false
    AND deleted_at    IS NULL
);

-- Update admin ALL policy to allow admin to see soft-deleted rows
-- (so they can audit / restore them if needed)
DROP POLICY IF EXISTS "admin_all_manikins" ON manikins;
CREATE POLICY "admin_all_manikins"
ON manikins FOR ALL
TO authenticated
USING     ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
WITH CHECK((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ============================================================
-- PART 2: Audit Log Table
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id          bigserial    PRIMARY KEY,
    action      text         NOT NULL,        -- 'approve_one' | 'reject_one' | 'bulk_approve' | 'bulk_reject' | 'edit_manikin' | 'delete_location'
    actor_email text         NOT NULL,
    target_ids  jsonb        NOT NULL,        -- array of sap_id / location id e.g. ["sap001","sap002"]
    note        text         DEFAULT NULL,    -- optional extra context
    created_at  timestamptz  NOT NULL DEFAULT now()
);

-- RLS: only admin can INSERT or SELECT audit_logs (no UPDATE/DELETE - immutable record)
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_insert_audit_logs" ON audit_logs;
DROP POLICY IF EXISTS "admin_select_audit_logs" ON audit_logs;

CREATE POLICY "admin_insert_audit_logs"
ON audit_logs FOR INSERT
TO authenticated
WITH CHECK((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "admin_select_audit_logs"
ON audit_logs FOR SELECT
TO authenticated
USING((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ============================================================
-- PART 3: Verify (run after migration)
-- ============================================================
-- Check soft-delete column exists:
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'manikins' AND column_name = 'deleted_at';

-- Check audit_logs table:
-- SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 10;

-- Check updated policies:
-- SELECT policyname, tablename, cmd, roles
-- FROM pg_policies WHERE schemaname = 'public'
--   AND tablename IN ('manikins', 'audit_logs');
