-- ============================================================
-- SIMSET Borrow current MVP release SQL
-- Purpose: canonical release script for the active MVP browser -> Worker -> Supabase flow.
-- Run first on preview Supabase, then production after verification passes.
-- ============================================================

BEGIN;

-- Public tracking: return operational request status without exposing borrower PII.
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
        'purpose', br.purpose,
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

-- Public no-login borrow request submission for the static MVP.
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

-- Admin status transition RPC used by website/js/admin.js.
CREATE OR REPLACE FUNCTION public.admin_update_borrow_request_status(
    p_request_id uuid,
    p_current_status text,
    p_next_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_allowed_next text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF (auth.jwt() -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'unauthorized: admin role required';
    END IF;

    v_allowed_next := CASE p_current_status
        WHEN 'pending' THEN 'approved'
        WHEN 'approved' THEN 'ready'
        WHEN 'ready' THEN 'borrowed'
        WHEN 'borrowed' THEN 'returned'
        ELSE NULL
    END;

    IF v_allowed_next IS NULL OR v_allowed_next <> p_next_status THEN
        RAISE EXCEPTION 'Invalid status transition: % to %', p_current_status, p_next_status;
    END IF;

    UPDATE public.borrow_requests
    SET
        status = p_next_status,
        updated_at = timezone('utc', now())
    WHERE id = p_request_id
      AND status = p_current_status;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    RETURN jsonb_build_object(
        'request_id', p_request_id,
        'status', p_next_status
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_borrow_request_status(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_borrow_request_status(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_update_borrow_request_status(uuid, text, text) TO authenticated;

COMMIT;

-- Verification queries:
-- SELECT n.nspname, p.proname, p.prosecdef, p.proacl
-- FROM pg_proc p
-- JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND p.proname IN (
--     'get_borrow_request_status',
--     'submit_public_borrow_request',
--     'admin_update_borrow_request_status'
--   )
-- ORDER BY p.proname;
