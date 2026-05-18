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
-- Function 3: cancel_borrow_request
-- Borrower can cancel only while request is still pending.
-- ============================================================

CREATE OR REPLACE FUNCTION cancel_borrow_request(
    p_tracking_id text,
    p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_request_id uuid;
    v_borrower_id uuid;
    v_status text;
    v_reason text := COALESCE(NULLIF(trim(p_reason), ''), 'Cancelled by borrower');
    v_min_start date;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT br.id, br.borrower_id, br.status
    INTO v_request_id, v_borrower_id, v_status
    FROM public.borrow_requests br
    WHERE br.tracking_id = p_tracking_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tracking ID not found';
    END IF;

    IF v_borrower_id <> auth.uid() THEN
        RAISE EXCEPTION 'Forbidden: not request owner';
    END IF;

    IF v_status <> 'pending' THEN
        RAISE EXCEPTION 'Request is not cancellable in status: %', v_status;
    END IF;

    SELECT MIN(start_date)
    INTO v_min_start
    FROM public.borrow_request_items
    WHERE request_id = v_request_id;

    IF v_min_start <= CURRENT_DATE + INTERVAL '1 day' THEN
        RAISE EXCEPTION 'Cannot cancel within 1 day of start date. Contact staff.';
    END IF;

    UPDATE public.borrow_requests
    SET
        status = 'cancelled',
        cancel_reason = v_reason,
        cancelled_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
    WHERE id = v_request_id
      AND status = 'pending';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Request state changed, please retry';
    END IF;

    RETURN jsonb_build_object(
        'tracking_id', p_tracking_id,
        'status', 'cancelled'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_borrow_request(text, text) TO authenticated;


-- ============================================================
-- Function 4: admin_receive_return_detailed
-- Records per-item return condition and routes damaged stock to maintenance.
-- ============================================================

CREATE OR REPLACE FUNCTION admin_receive_return_detailed(
    p_request_id uuid,
    p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_item jsonb;
    v_total int;
    v_has_rows boolean := false;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.borrow_requests
        WHERE id = p_request_id
          AND status IN ('approved', 'returned_pending_inspection')
    ) THEN
        RAISE EXCEPTION 'Request not found or not in receivable status';
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb))
    LOOP
        v_has_rows := true;
        v_total :=
            COALESCE((v_item->>'qty_ok')::int, 0) +
            COALESCE((v_item->>'qty_damaged')::int, 0) +
            COALESCE((v_item->>'qty_maintenance')::int, 0);

        IF v_total <> COALESCE((
            SELECT qty_borrowed
            FROM public.borrow_request_items
            WHERE id = (v_item->>'item_id')::uuid
              AND request_id = p_request_id
        ), -1) THEN
            RAISE EXCEPTION 'Return totals must match borrowed quantity for item %', v_item->>'item_id';
        END IF;

        UPDATE public.borrow_request_items
        SET
            qty_returned_ok = COALESCE((v_item->>'qty_ok')::int, 0),
            qty_returned_damaged = COALESCE((v_item->>'qty_damaged')::int, 0),
            qty_returned_maintenance = COALESCE((v_item->>'qty_maintenance')::int, 0)
        WHERE id = (v_item->>'item_id')::uuid
          AND request_id = p_request_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Borrow request item not found for item %', v_item->>'item_id';
        END IF;

        UPDATE public.equipments e
        SET maintenance_quantity = GREATEST(
            0,
            maintenance_quantity + COALESCE((v_item->>'qty_damaged')::int, 0) + COALESCE((v_item->>'qty_maintenance')::int, 0)
        )
        FROM public.borrow_request_items bri
        WHERE bri.id = (v_item->>'item_id')::uuid
          AND bri.request_id = p_request_id
          AND e.id = bri.equipment_id;
    END LOOP;

    IF NOT v_has_rows THEN
        RAISE EXCEPTION 'No return items provided';
    END IF;

    UPDATE public.borrow_requests
    SET status = 'returned',
        updated_at = timezone('utc', now())
    WHERE id = p_request_id
      AND status IN ('approved', 'returned_pending_inspection');

    RETURN jsonb_build_object(
        'request_id', p_request_id,
        'status', 'returned'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_receive_return_detailed(uuid, jsonb) TO authenticated;

-- ============================================================
-- Function 5: admin_update_borrow_request_status
-- Moves a borrow request through the approved -> ready -> borrowed -> returned flow.
-- Replaces client-side borrow_requests.update() for the MVP admin page.
-- ============================================================

CREATE OR REPLACE FUNCTION admin_update_borrow_request_status(
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

REVOKE ALL ON FUNCTION admin_update_borrow_request_status(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_update_borrow_request_status(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION admin_update_borrow_request_status(uuid, text, text) TO authenticated;


-- ============================================================
-- Verify (run after applying):
-- ============================================================
-- SELECT proname, prosecdef, provolatile
-- FROM pg_proc
-- WHERE proname IN ('sync_manikin_capabilities', 'delete_location_atomic');
