-- ============================================================
-- SIMSET Borrow Phase 2: Authenticated Borrower Flow
-- Purpose:
-- - Require Supabase Auth Magic Link session for borrower submissions.
-- - Allow borrower emails only from @mahidol.ac.th.
-- - Store borrower_id = auth.uid() for history and cancellation.
-- - Keep submit-time availability validation as the database source of truth.
--
-- Apply after:
--   1. supabase/current_mvp_release.sql
--   2. supabase/phase1_domain_state_machine.sql
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.submit_borrow_request(
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
SET search_path = public, pg_temp
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
    v_email text := lower(COALESCE(auth.jwt() ->> 'email', ''));
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF right(v_email, length('@mahidol.ac.th')) <> '@mahidol.ac.th' THEN
        RAISE EXCEPTION 'Only Mahidol organization email is allowed';
    END IF;

    IF lower(trim(COALESCE(p_borrower_email, ''))) IS DISTINCT FROM v_email THEN
        RAISE EXCEPTION 'Borrower email must match authenticated email';
    END IF;

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
        auth.uid(),
        trim(p_borrower_name),
        v_email,
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

REVOKE ALL ON FUNCTION public.submit_borrow_request(text, text, text, date, date, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_borrow_request(text, text, text, date, date, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_borrow_request(text, text, text, date, date, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_borrow_requests()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    result jsonb;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', br.id,
            'tracking_id', br.tracking_id,
            'status', br.status,
            'created_at', br.created_at,
            'purpose', br.purpose,
            'can_cancel', br.status = 'pending',
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
        ORDER BY br.created_at DESC
    ), '[]'::jsonb)
    INTO result
    FROM public.borrow_requests br
    WHERE br.borrower_id = auth.uid();

    RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_borrow_requests() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_borrow_requests() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_borrow_requests() TO authenticated;

COMMENT ON FUNCTION public.submit_public_borrow_request(text, text, text, date, date, jsonb)
IS 'DEPRECATED after Phase 2: frontend must use authenticated submit_borrow_request so borrower_id = auth.uid().';

COMMIT;

-- Verification queries:
-- SELECT proname, prosecdef, proacl
-- FROM pg_proc
-- WHERE proname IN ('submit_borrow_request', 'get_my_borrow_requests')
-- ORDER BY proname;
--
-- SELECT obj_description('public.submit_public_borrow_request(text,text,text,date,date,jsonb)'::regprocedure);
