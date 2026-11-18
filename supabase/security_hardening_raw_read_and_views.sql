-- ============================================================
-- SiMSET Borrow: close raw public borrow table reads and harden public tracking.
-- Run against Supabase project ifogcvymwhcfbfjzhwsl.
-- ============================================================

BEGIN;

-- Public users must not read borrow request tables directly.
DROP POLICY IF EXISTS "public_read_by_tracking_id" ON public.borrow_requests;
DROP POLICY IF EXISTS "anon_and_user_read_items" ON public.borrow_request_items;

-- Remove duplicate broad admin ALL policies. Explicit SELECT/UPDATE admin policies remain.
DROP POLICY IF EXISTS "admin_all_requests" ON public.borrow_requests;
DROP POLICY IF EXISTS "admin_all_items" ON public.borrow_request_items;

-- Reduce table grants. RPCs handle public submit/track; admin UI uses authenticated SELECT/UPDATE with RLS.
REVOKE ALL ON TABLE public.borrow_requests FROM anon;
REVOKE ALL ON TABLE public.borrow_request_items FROM anon;
REVOKE ALL ON TABLE public.borrow_requests FROM authenticated;
REVOKE ALL ON TABLE public.borrow_request_items FROM authenticated;
GRANT SELECT, UPDATE ON TABLE public.borrow_requests TO authenticated;
GRANT SELECT, UPDATE ON TABLE public.borrow_request_items TO authenticated;

-- Keep tracking public, but return only non-PII operational data.
CREATE OR REPLACE FUNCTION public.get_borrow_request_status(p_tracking_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result jsonb;
BEGIN
    SELECT jsonb_build_object(
        'tracking_id', br.tracking_id,
        'status', br.status,
        'created_at', br.created_at,
        'items', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'equipment_name', e.name_th,
                'start_date', bri.start_date,
                'end_date', bri.end_date,
                'qty_borrowed', bri.qty_borrowed
            )), '[]'::jsonb)
            FROM public.borrow_request_items bri
            JOIN public.equipments e ON e.id = bri.equipment_id
            WHERE bri.request_id = br.id
        )
    )
    INTO result
    FROM public.borrow_requests br
    WHERE br.tracking_id = p_tracking_id;

    IF result IS NULL THEN
        RAISE EXCEPTION 'Tracking ID not found';
    END IF;

    RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_borrow_request_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_borrow_request_status(text) TO anon, authenticated;

-- The static MVP uses no-login request submission. Keep this public RPC as the only public write entry.
CREATE OR REPLACE FUNCTION public.submit_public_borrow_request(
    p_borrower_name text,
    p_borrower_email text,
    p_purpose text,
    p_start_date date,
    p_end_date date,
    p_items jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_request_id uuid;
    new_tracking_id text;
    item jsonb;
    eq_id uuid;
    req_qty integer;
    locked_eq record;
    used_qty integer;
    available_qty integer;
BEGIN
    IF p_borrower_name IS NULL OR length(trim(p_borrower_name)) = 0 THEN
        RAISE EXCEPTION 'Borrower name is required';
    END IF;

    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'At least one borrow item is required';
    END IF;

    IF p_start_date IS NULL OR p_end_date IS NULL OR p_end_date < p_start_date THEN
        RAISE EXCEPTION 'Invalid borrow date range';
    END IF;

    new_tracking_id := public.generate_secure_tracking_id();

    INSERT INTO public.borrow_requests (
        tracking_id,
        borrower_id,
        borrower_name,
        borrower_email,
        purpose,
        status,
        expires_at
    ) VALUES (
        new_tracking_id,
        NULL,
        trim(p_borrower_name),
        NULLIF(trim(COALESCE(p_borrower_email, '')), ''),
        NULLIF(trim(COALESCE(p_purpose, '')), ''),
        'pending',
        timezone('utc', now()) + interval '24 hours'
    )
    RETURNING id INTO new_request_id;

    FOR item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        eq_id := (item->>'equipment_id')::uuid;
        req_qty := COALESCE((item->>'qty')::integer, 0);

        IF eq_id IS NULL OR req_qty <= 0 THEN
            RAISE EXCEPTION 'Invalid borrow item';
        END IF;

        SELECT *
        INTO locked_eq
        FROM public.equipments
        WHERE id = eq_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Equipment not found';
        END IF;

        SELECT COALESCE(SUM(bri.qty_borrowed), 0)
        INTO used_qty
        FROM public.borrow_request_items bri
        JOIN public.borrow_requests br ON br.id = bri.request_id
        WHERE bri.equipment_id = eq_id
          AND bri.start_date <= p_end_date
          AND bri.end_date >= p_start_date
          AND br.status IN ('pending', 'approved', 'ready', 'borrowed');

        available_qty := (locked_eq.total_quantity - locked_eq.maintenance_quantity) - used_qty;

        IF available_qty < req_qty THEN
            RAISE EXCEPTION 'Equipment does not have enough stock';
        END IF;

        INSERT INTO public.borrow_request_items (
            request_id,
            equipment_id,
            start_date,
            end_date,
            qty_borrowed
        ) VALUES (
            new_request_id,
            eq_id,
            p_start_date,
            p_end_date,
            req_qty
        );
    END LOOP;

    RETURN new_tracking_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_public_borrow_request(text, text, text, date, date, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_public_borrow_request(text, text, text, date, date, jsonb) TO anon, authenticated;

-- Make existing views obey caller permissions/RLS instead of owner permissions.
ALTER VIEW IF EXISTS public.public_manikins SET (security_invoker = true);
ALTER VIEW IF EXISTS public.vw_active_borrow_items SET (security_invoker = true);

COMMIT;

-- Follow-up hardening, 2026-05-03:
-- 1. Keep mutable search_path warnings closed on existing functions.
-- 2. Remove broad listing policy from public team-images storage bucket.
-- 3. Add DB-side rate limiting for intentionally public RPCs so direct Supabase
--    RPC calls are throttled even when the static site is bypassed.

BEGIN;

ALTER FUNCTION public.generate_secure_tracking_id() SET search_path = public, pg_temp;
ALTER FUNCTION public.sync_manikin_capabilities(text, uuid[]) SET search_path = public, pg_temp;
ALTER FUNCTION public.delete_location_atomic(integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.expire_pending_requests() SET search_path = public, pg_temp;
ALTER FUNCTION public.get_next_available_date(uuid, date, date, integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_new_user() SET search_path = public, pg_temp;
ALTER FUNCTION public.process_equipment_return(uuid, jsonb) SET search_path = public, pg_temp;

DROP POLICY IF EXISTS "public_read_team_images_storage" ON storage.objects;

CREATE SCHEMA IF NOT EXISTS simset_private;
REVOKE ALL ON SCHEMA simset_private FROM PUBLIC;

CREATE TABLE IF NOT EXISTS simset_private.rpc_rate_limits (
    action text NOT NULL,
    actor_hash text NOT NULL,
    window_start timestamptz NOT NULL,
    request_count integer NOT NULL DEFAULT 0,
    PRIMARY KEY (action, actor_hash)
);

REVOKE ALL ON TABLE simset_private.rpc_rate_limits FROM PUBLIC;

CREATE OR REPLACE FUNCTION simset_private.check_rpc_rate_limit(
    p_action text,
    p_limit integer,
    p_window interval
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = simset_private, public, pg_temp
AS $$
DECLARE
    headers jsonb;
    actor_key text;
    v_actor_hash text;
    existing simset_private.rpc_rate_limits%ROWTYPE;
BEGIN
    headers := COALESCE(NULLIF(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
    actor_key := COALESCE(
        NULLIF(headers->>'cf-connecting-ip', ''),
        NULLIF(split_part(COALESCE(headers->>'x-forwarded-for', ''), ',', 1), ''),
        NULLIF(headers->>'x-real-ip', ''),
        NULLIF(headers->>'user-agent', ''),
        'unknown'
    );
    v_actor_hash := md5(p_action || ':' || actor_key);

    SELECT *
    INTO existing
    FROM simset_private.rpc_rate_limits
    WHERE action = p_action
      AND actor_hash = v_actor_hash
    FOR UPDATE;

    IF NOT FOUND OR existing.window_start <= timezone('utc', now()) - p_window THEN
        INSERT INTO simset_private.rpc_rate_limits(action, actor_hash, window_start, request_count)
        VALUES (p_action, v_actor_hash, timezone('utc', now()), 1)
        ON CONFLICT (action, actor_hash)
        DO UPDATE SET window_start = EXCLUDED.window_start, request_count = 1;
        RETURN;
    END IF;

    IF existing.request_count >= p_limit THEN
        RAISE EXCEPTION 'Rate limit exceeded';
    END IF;

    UPDATE simset_private.rpc_rate_limits
    SET request_count = request_count + 1
    WHERE action = p_action
      AND actor_hash = v_actor_hash;
END;
$$;

REVOKE ALL ON FUNCTION simset_private.check_rpc_rate_limit(text, integer, interval) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.get_borrow_request_status(p_tracking_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, simset_private, pg_temp
AS $$
DECLARE
    result jsonb;
BEGIN
    PERFORM simset_private.check_rpc_rate_limit('track_status', 30, interval '1 minute');

    SELECT jsonb_build_object(
        'tracking_id', br.tracking_id,
        'status', br.status,
        'created_at', br.created_at,
        'items', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'equipment_name', e.name_th,
                'start_date', bri.start_date,
                'end_date', bri.end_date,
                'qty_borrowed', bri.qty_borrowed
            )), '[]'::jsonb)
            FROM public.borrow_request_items bri
            JOIN public.equipments e ON e.id = bri.equipment_id
            WHERE bri.request_id = br.id
        )
    )
    INTO result
    FROM public.borrow_requests br
    WHERE br.tracking_id = p_tracking_id;

    IF result IS NULL THEN
        RAISE EXCEPTION 'Tracking ID not found';
    END IF;

    RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_public_borrow_request(
    p_borrower_name text,
    p_borrower_email text,
    p_purpose text,
    p_start_date date,
    p_end_date date,
    p_items jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, simset_private, pg_temp
AS $$
DECLARE
    new_request_id uuid;
    new_tracking_id text;
    item jsonb;
    eq_id uuid;
    req_qty integer;
    locked_eq record;
    used_qty integer;
    available_qty integer;
BEGIN
    PERFORM simset_private.check_rpc_rate_limit('submit_borrow', 5, interval '10 minutes');

    IF p_borrower_name IS NULL OR length(trim(p_borrower_name)) = 0 THEN
        RAISE EXCEPTION 'Borrower name is required';
    END IF;

    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'At least one borrow item is required';
    END IF;

    IF p_start_date IS NULL OR p_end_date IS NULL OR p_end_date < p_start_date THEN
        RAISE EXCEPTION 'Invalid borrow date range';
    END IF;

    new_tracking_id := public.generate_secure_tracking_id();

    INSERT INTO public.borrow_requests (
        tracking_id,
        borrower_id,
        borrower_name,
        borrower_email,
        purpose,
        status,
        expires_at
    ) VALUES (
        new_tracking_id,
        NULL,
        trim(p_borrower_name),
        NULLIF(trim(COALESCE(p_borrower_email, '')), ''),
        NULLIF(trim(COALESCE(p_purpose, '')), ''),
        'pending',
        timezone('utc', now()) + interval '24 hours'
    )
    RETURNING id INTO new_request_id;

    FOR item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        eq_id := (item->>'equipment_id')::uuid;
        req_qty := COALESCE((item->>'qty')::integer, 0);

        IF eq_id IS NULL OR req_qty <= 0 THEN
            RAISE EXCEPTION 'Invalid borrow item';
        END IF;

        SELECT *
        INTO locked_eq
        FROM public.equipments
        WHERE id = eq_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Equipment not found';
        END IF;

        SELECT COALESCE(SUM(bri.qty_borrowed), 0)
        INTO used_qty
        FROM public.borrow_request_items bri
        JOIN public.borrow_requests br ON br.id = bri.request_id
        WHERE bri.equipment_id = eq_id
          AND bri.start_date <= p_end_date
          AND bri.end_date >= p_start_date
          AND br.status IN ('pending', 'approved', 'ready', 'borrowed');

        available_qty := (locked_eq.total_quantity - locked_eq.maintenance_quantity) - used_qty;

        IF available_qty < req_qty THEN
            RAISE EXCEPTION 'Equipment does not have enough stock';
        END IF;

        INSERT INTO public.borrow_request_items (
            request_id,
            equipment_id,
            start_date,
            end_date,
            qty_borrowed
        ) VALUES (
            new_request_id,
            eq_id,
            p_start_date,
            p_end_date,
            req_qty
        );
    END LOOP;

    RETURN new_tracking_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_borrow_request_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_borrow_request_status(text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.submit_public_borrow_request(text, text, text, date, date, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_public_borrow_request(text, text, text, date, date, jsonb) TO anon, authenticated;

COMMIT;
