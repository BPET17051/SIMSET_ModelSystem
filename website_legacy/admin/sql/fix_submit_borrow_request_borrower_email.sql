-- ============================================================
-- fix_submit_borrow_request_borrower_email.sql
-- Purpose:
--   Repair production schema/function mismatch where
--   public.submit_borrow_request() inserts into
--   public.borrow_requests.borrower_email but the column
--   does not exist yet on the target database.
--
-- Safe to re-run:
--   - adds column with IF NOT EXISTS
--   - recreates function idempotently
-- ============================================================

ALTER TABLE public.borrow_requests
ADD COLUMN IF NOT EXISTS borrower_email TEXT;

CREATE OR REPLACE FUNCTION public.submit_borrow_request(
    p_borrower_id UUID,
    p_borrower_name TEXT,
    p_borrower_email TEXT,
    p_purpose TEXT,
    p_start_date DATE,
    p_end_date DATE,
    p_items JSONB
) RETURNS TEXT AS $$
DECLARE
    new_request_id UUID;
    new_tracking_id TEXT;
    item JSONB;
    eq_id UUID;
    req_qty INT;
    locked_eq RECORD;
    used_qty INT;
    available_qty INT;
    v_uid UUID := auth.uid();
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF p_borrower_id IS NOT NULL AND p_borrower_id <> v_uid THEN
        RAISE EXCEPTION 'Forbidden: borrower mismatch';
    END IF;

    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'At least one borrow item is required';
    END IF;

    IF p_start_date IS NULL OR p_end_date IS NULL THEN
        RAISE EXCEPTION 'Start date and end date are required';
    END IF;

    IF p_end_date < p_start_date THEN
        RAISE EXCEPTION 'End date cannot be before start date';
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
        v_uid,
        p_borrower_name,
        p_borrower_email,
        p_purpose,
        'pending',
        timezone('utc', now()) + INTERVAL '24 hours'
    ) RETURNING id INTO new_request_id;

    FOR item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        eq_id := (item->>'equipment_id')::UUID;
        req_qty := (item->>'qty')::INT;

        IF eq_id IS NULL THEN
            RAISE EXCEPTION 'equipment_id is required for every item';
        END IF;

        IF req_qty IS NULL OR req_qty <= 0 THEN
            RAISE EXCEPTION 'qty must be greater than 0 for equipment %', eq_id;
        END IF;

        SELECT *
        INTO locked_eq
        FROM public.equipments
        WHERE id = eq_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Equipment % not found', eq_id;
        END IF;

        SELECT COALESCE(SUM(bri.qty_borrowed), 0)
        INTO used_qty
        FROM public.borrow_request_items bri
        JOIN public.borrow_requests br ON br.id = bri.request_id
        WHERE bri.equipment_id = eq_id
          AND bri.start_date <= p_end_date
          AND bri.end_date >= p_start_date
          AND br.status IN ('pending', 'approved', 'returned_pending_inspection');

        available_qty := (locked_eq.total_quantity - locked_eq.maintenance_quantity) - used_qty;

        IF available_qty < req_qty THEN
            RAISE EXCEPTION 'Equipment "%" does not have enough stock. Requested: %, Available: %',
                locked_eq.name_th, req_qty, available_qty;
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.submit_borrow_request(UUID, TEXT, TEXT, TEXT, DATE, DATE, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_borrow_request(UUID, TEXT, TEXT, TEXT, DATE, DATE, JSONB) TO authenticated;

-- ============================================================
-- Verification
-- ============================================================
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'borrow_requests'
  AND column_name = 'borrower_email';

