-- ============================================================
-- SiMSET — Atomic Postgres RPC Functions
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================
-- These functions execute multi-step operations inside a single
-- database transaction. If any step fails, Postgres automatically
-- rolls back the entire operation — no partial state left behind.
-- ============================================================

-- ============================================================
-- Function 1: sync_manikin_capabilities
-- Atomically replaces all capabilities for a given manikin.
-- Replaces: client-side delete() + insert() pattern
-- ============================================================

CREATE OR REPLACE FUNCTION sync_manikin_capabilities(
    p_sap_id     text,
    p_cap_ids    uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER   -- runs as the calling user, so RLS still applies
AS $$
BEGIN
    -- Step 1: Remove all existing capabilities for this manikin
    DELETE FROM manikin_capabilities
    WHERE sap_id = p_sap_id;

    -- Step 2: Insert new capabilities (if any selected)
    IF array_length(p_cap_ids, 1) IS NOT NULL AND array_length(p_cap_ids, 1) > 0 THEN
        INSERT INTO manikin_capabilities (sap_id, capability_id)
        SELECT p_sap_id, unnest(p_cap_ids);
    END IF;
    -- Both steps run atomically. If INSERT fails, DELETE is rolled back too.
END;
$$;

-- Grant execute to authenticated role (admin gate via RLS on the tables)
GRANT EXECUTE ON FUNCTION sync_manikin_capabilities(text, uuid[]) TO authenticated;


-- ============================================================
-- Function 2: delete_location_atomic
-- Atomically unlinks all manikins from a location, then deletes it.
-- Replaces: client-side update() + delete() pattern
-- ============================================================

CREATE OR REPLACE FUNCTION delete_location_atomic(
    p_location_id integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER   -- runs as calling user, so admin RLS policies apply
AS $$
BEGIN
    -- Step 1: Unlink all manikins referencing this location
    UPDATE manikins
    SET location_id = NULL
    WHERE location_id = p_location_id;

    -- Step 2: Delete the location record
    DELETE FROM locations
    WHERE id = p_location_id;

    -- If either step fails (e.g. FK violation), Postgres rolls back both.
END;
$$;

-- Grant execute to authenticated role
GRANT EXECUTE ON FUNCTION delete_location_atomic(integer) TO authenticated;


-- ============================================================
-- Verify (run after applying):
-- ============================================================
-- SELECT proname, prosecdef, provolatile
-- FROM pg_proc
-- WHERE proname IN ('sync_manikin_capabilities', 'delete_location_atomic');
