-- ============================================================
-- SiMSET Borrow: remaining Supabase Advisor hardening.
-- Run against Supabase project ifogcvymwhcfbfjzhwsl.
-- ============================================================

BEGIN;

-- The lms schema is outside the borrow MVP. Keep it closed to API roles and
-- add explicit deny policies so RLS intent is visible to Supabase Advisor.
REVOKE ALL ON TABLE lms.answers FROM anon, authenticated;
REVOKE ALL ON TABLE lms.attempts FROM anon, authenticated;
REVOKE ALL ON TABLE lms.options FROM anon, authenticated;
REVOKE ALL ON TABLE lms.questions FROM anon, authenticated;
REVOKE ALL ON TABLE lms.quizzes FROM anon, authenticated;

DROP POLICY IF EXISTS "deny_api_access" ON lms.answers;
CREATE POLICY "deny_api_access"
ON lms.answers
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS "deny_api_access" ON lms.attempts;
CREATE POLICY "deny_api_access"
ON lms.attempts
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS "deny_api_access" ON lms.options;
CREATE POLICY "deny_api_access"
ON lms.options
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS "deny_api_access" ON lms.questions;
CREATE POLICY "deny_api_access"
ON lms.questions
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS "deny_api_access" ON lms.quizzes;
CREATE POLICY "deny_api_access"
ON lms.quizzes
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

COMMIT;
