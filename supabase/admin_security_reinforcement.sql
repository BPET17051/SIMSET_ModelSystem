-- ============================================================
-- SiMSET — Admin Security Reinforcement (Option A)
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================
-- 1. Adds internal role checks to RPCs
-- 2. Restricts Admin RLS policies to @simset.ac.th email domain
-- ============================================================

-- ============================================================
-- RPC: sync_manikin_capabilities (Reinforced)
-- ============================================================
CREATE OR REPLACE FUNCTION sync_manikin_capabilities(
    p_sap_id     text,
    p_cap_ids    uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    -- [SECURITY GUARD] Verify caller is truly an admin
    IF (auth.jwt() -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'unauthorized: admin role required';
    END IF;

    -- Step 1: Remove all existing capabilities
    DELETE FROM manikin_capabilities
    WHERE sap_id = p_sap_id;

    -- Step 2: Insert new capabilities
    IF array_length(p_cap_ids, 1) IS NOT NULL AND array_length(p_cap_ids, 1) > 0 THEN
        INSERT INTO manikin_capabilities (sap_id, capability_id)
        SELECT p_sap_id, unnest(p_cap_ids);
    END IF;
END;
$$;

-- ============================================================
-- RPC: delete_location_atomic (Reinforced)
-- ============================================================
CREATE OR REPLACE FUNCTION delete_location_atomic(
    p_location_id integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    -- [SECURITY GUARD] Verify caller is truly an admin
    IF (auth.jwt() -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'unauthorized: admin role required';
    END IF;

    -- Step 1: Unlink manikins
    UPDATE manikins
    SET location_id = NULL
    WHERE location_id = p_location_id;

    -- Step 2: Delete location
    DELETE FROM locations
    WHERE id = p_location_id;
END;
$$;


-- ============================================================
-- Modify RLS Policies to Enforce Domain Restriction
-- Requires both role='admin' AND email ends with '@simset.ac.th'
-- ============================================================

DROP POLICY IF EXISTS "admin_all_manikins" ON manikins;
CREATE POLICY "admin_all_manikins" ON manikins FOR ALL TO authenticated
USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    AND auth.jwt() ->> 'email' LIKE '%@simset.ac.th'
) WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    AND auth.jwt() ->> 'email' LIKE '%@simset.ac.th'
);

DROP POLICY IF EXISTS "admin_all_locations" ON locations;
CREATE POLICY "admin_all_locations" ON locations FOR ALL TO authenticated
USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    AND auth.jwt() ->> 'email' LIKE '%@simset.ac.th'
) WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    AND auth.jwt() ->> 'email' LIKE '%@simset.ac.th'
);

DROP POLICY IF EXISTS "admin_all_capabilities" ON capabilities;
CREATE POLICY "admin_all_capabilities" ON capabilities FOR ALL TO authenticated
USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    AND auth.jwt() ->> 'email' LIKE '%@simset.ac.th'
) WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    AND auth.jwt() ->> 'email' LIKE '%@simset.ac.th'
);

DROP POLICY IF EXISTS "admin_all_manikin_capabilities" ON manikin_capabilities;
CREATE POLICY "admin_all_manikin_capabilities" ON manikin_capabilities FOR ALL TO authenticated
USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    AND auth.jwt() ->> 'email' LIKE '%@simset.ac.th'
) WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    AND auth.jwt() ->> 'email' LIKE '%@simset.ac.th'
);

DROP POLICY IF EXISTS "admin_all_audit_logs" ON audit_logs;
CREATE POLICY "admin_all_audit_logs" ON audit_logs FOR ALL TO authenticated
USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    AND auth.jwt() ->> 'email' LIKE '%@simset.ac.th'
) WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    AND auth.jwt() ->> 'email' LIKE '%@simset.ac.th'
);
