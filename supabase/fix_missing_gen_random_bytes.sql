-- Fix submit_public_borrow_request_v2 failing with:
-- function gen_random_bytes(integer) does not exist
--
-- Supabase may install pgcrypto functions under the extensions schema while
-- SECURITY DEFINER functions run with search_path = public, pg_temp.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.gen_random_bytes(byte_count integer)
RETURNS bytea
LANGUAGE sql
VOLATILE
SET search_path = extensions, public, pg_temp
AS $$
    SELECT extensions.gen_random_bytes(byte_count);
$$;

COMMIT;

-- Verification:
-- SELECT encode(public.gen_random_bytes(4), 'hex');
