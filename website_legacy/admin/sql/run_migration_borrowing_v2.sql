-- Migration Script: Borrowing System Redesign (Quantity-Only MVP)
-- Target: Supabase PostgreSQL
-- Timezone Policy: Assumes UTC+7 logic (using DATE types)

-------------------------------------------------------------------------------
-- 1. EQUIPMENTS TABLE REVISION (Quantity-only tracking)
-------------------------------------------------------------------------------
-- Assuming 'equipments' table already exists. We ensure it has the correct columns.
-- If starting fresh, uncomment the CREATE TABLE block below:
/*
CREATE TABLE public.equipments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name_th TEXT NOT NULL,
    total_quantity INT NOT NULL DEFAULT 1,
    maintenance_quantity INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
*/

-- Ensure correct columns exist (in case of an upgrade)
ALTER TABLE public.equipments ADD COLUMN IF NOT EXISTS total_quantity INT NOT NULL DEFAULT 1;
ALTER TABLE public.equipments ADD COLUMN IF NOT EXISTS maintenance_quantity INT NOT NULL DEFAULT 0;

-------------------------------------------------------------------------------
-- 2. CREATE TRANSACTIONS TABLES
-------------------------------------------------------------------------------
-- 2.1 borrow_requests (Header)
CREATE TABLE IF NOT EXISTS public.borrow_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tracking_id TEXT NOT NULL UNIQUE, -- 128-bit secure token (Base62/Hex format generated in DB)
    borrower_id UUID NOT NULL, -- References auth.users(id)
    borrower_name TEXT NOT NULL,
    borrower_email TEXT,
    purpose TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'cancelled', 'returned_pending_inspection', 'returned', 'expired'
    cancel_reason TEXT,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE, -- When the pending request expires if not approved
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    
    CONSTRAINT valid_status CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'returned_pending_inspection', 'returned', 'expired'))
);

-- 2.2 borrow_request_items (Details)
CREATE TABLE IF NOT EXISTS public.borrow_request_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id UUID NOT NULL REFERENCES public.borrow_requests(id) ON DELETE CASCADE,
    equipment_id UUID NOT NULL REFERENCES public.equipments(id) ON DELETE RESTRICT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    qty_borrowed INT NOT NULL CHECK (qty_borrowed > 0),
    qty_returned_ok INT NOT NULL DEFAULT 0,
    qty_returned_damaged INT NOT NULL DEFAULT 0,
    qty_returned_maintenance INT NOT NULL DEFAULT 0,
    
    CONSTRAINT valid_dates CHECK (end_date >= start_date)
);

-- Index for fast overlap checking
CREATE INDEX IF NOT EXISTS idx_borrow_request_items_overlap 
ON public.borrow_request_items (equipment_id, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_borrow_requests_status 
ON public.borrow_requests(status);

-------------------------------------------------------------------------------
-- 3. UTILITY FUNCTIONS
-------------------------------------------------------------------------------
-- Generate a secure random token for Tracking ID
CREATE OR REPLACE FUNCTION public.generate_secure_tracking_id() RETURNS TEXT AS $$
DECLARE
    chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    result TEXT := '';
    i INTEGER := 0;
BEGIN
    -- Format: SIM-YYYYMMDD-XXXXXXXX
    FOR i IN 1..8 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;
    RETURN 'SIM-' || to_char(timezone('utc', now()), 'YYYYMMDD') || '-' || result;
END;
$$ LANGUAGE plpgsql VOLATILE;

-------------------------------------------------------------------------------
-- 4. PESSIMISTIC LOCKING RPC FOR SUBMISSION (Transaction)
-------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_borrow_request(
    p_borrower_id UUID,
    p_borrower_name TEXT,
    p_borrower_email TEXT,
    p_purpose TEXT,
    p_start_date DATE,
    p_end_date DATE,
    p_items JSONB -- Array of { "equipment_id": "uuid", "qty": int }
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
    -- 1. Basic Validation
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- Backward-compatible guard: client may still pass p_borrower_id, but it must match auth.uid().
    IF p_borrower_id IS NOT NULL AND p_borrower_id <> v_uid THEN
        RAISE EXCEPTION 'Forbidden: borrower mismatch';
    END IF;

    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'At least one borrow item is required';
    END IF;

    IF p_end_date < p_start_date THEN
        RAISE EXCEPTION 'End date cannot be before start date';
    END IF;

    -- 2. Open header record
    new_tracking_id := public.generate_secure_tracking_id();
    
    INSERT INTO public.borrow_requests (
        tracking_id, borrower_id, borrower_name, borrower_email, purpose, status, expires_at
    ) VALUES (
        new_tracking_id, v_uid, p_borrower_name, p_borrower_email, p_purpose, 'pending', timezone('utc', now()) + INTERVAL '24 hours'
    ) RETURNING id INTO new_request_id;

    -- 3. Loop through items, lock, check availability, and insert
    FOR item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        eq_id := (item->>'equipment_id')::UUID;
        req_qty := (item->>'qty')::INT;

        IF eq_id IS NULL THEN
            RAISE EXCEPTION 'equipment_id is required for every item';
        END IF;

        IF req_qty IS NULL OR req_qty <= 0 THEN
            RAISE EXCEPTION 'qty must be greater than 0 for equipment %', eq_id;
        END IF;

        -- Pessimistic Lock on the equipment row (prevents concurrent identical checks)
        SELECT * INTO locked_eq FROM public.equipments WHERE id = eq_id FOR UPDATE;
        
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Equipment % not found', eq_id;
        END IF;

        -- Calculate usage for the given date range (including buffer of 1 day if required, but logic says exact date overlap for now)
        -- Overlap logic: existing.start_date <= requested.end_date AND existing.end_date >= requested.start_date
        SELECT COALESCE(SUM(qty_borrowed), 0) INTO used_qty
        FROM public.borrow_request_items bri
        JOIN public.borrow_requests br ON br.id = bri.request_id
        WHERE bri.equipment_id = eq_id
          AND bri.start_date <= p_end_date
          AND bri.end_date >= p_start_date
          AND br.status IN ('pending', 'approved', 'returned_pending_inspection'); -- Items locking stock

        available_qty := (locked_eq.total_quantity - locked_eq.maintenance_quantity) - used_qty;

        IF available_qty < req_qty THEN
            -- Exception automatically rolls back the entire transaction!
            RAISE EXCEPTION 'Equipment "%" does not have enough stock. Requested: %, Available: %', locked_eq.name_th, req_qty, available_qty;
        END IF;

        -- Insert detail
        INSERT INTO public.borrow_request_items (
            request_id, equipment_id, start_date, end_date, qty_borrowed
        ) VALUES (
            new_request_id, eq_id, p_start_date, p_end_date, req_qty
        );
    END LOOP;

    RETURN new_tracking_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
-- SECURITY DEFINER allows the function to bypass RLS internally to lock equipments and insert rows


-------------------------------------------------------------------------------
-- 5. PUBLIC RPC FOR TRACKING
-------------------------------------------------------------------------------
-- Allows checking status without authenticating, but strictly hides PII.
CREATE OR REPLACE FUNCTION public.get_borrow_request_status(p_tracking_id TEXT)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'tracking_id', br.tracking_id,
        'status', br.status,
        'purpose', br.purpose,
        'created_at', br.created_at,
        'items', (
            SELECT jsonb_agg(jsonb_build_object(
                'equipment_name', e.name_th,
                'start_date', bri.start_date,
                'end_date', bri.end_date,
                'qty_borrowed', bri.qty_borrowed
            ))
            FROM public.borrow_request_items bri
            JOIN public.equipments e ON e.id = bri.equipment_id
            WHERE bri.request_id = br.id
        )
    ) INTO result
    FROM public.borrow_requests br
    WHERE br.tracking_id = p_tracking_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tracking ID not found';
    END IF;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-------------------------------------------------------------------------------
-- 6. ADMIN RPCs
-------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_borrow_admin(p_uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
DECLARE
    v_is_admin BOOLEAN := FALSE;
    jwt_role TEXT;
BEGIN
    IF p_uid IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Primary path: Supabase app_metadata role in JWT.
    IF p_uid = auth.uid() THEN
        jwt_role := (auth.jwt() -> 'app_metadata'::text) ->> 'role'::text;
        IF jwt_role IN ('admin', 'super_admin') THEN
            RETURN TRUE;
        END IF;
    END IF;

    -- Backward-compatible fallback for environments that still keep a role table.
    IF to_regclass('public.user_roles') IS NULL THEN
        RETURN FALSE;
    END IF;

    EXECUTE $q$
        SELECT EXISTS (
            SELECT 1
            FROM public.user_roles ur
            WHERE ur.user_id = $1
              AND ur.role IN ('admin', 'super_admin')
        )
    $q$
    INTO v_is_admin
    USING p_uid;

    RETURN COALESCE(v_is_admin, FALSE);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.assert_borrow_admin()
RETURNS VOID AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF NOT public.is_borrow_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Forbidden: admin only';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.admin_approve_request(p_request_id UUID) RETURNS VOID AS $$
BEGIN
    PERFORM public.assert_borrow_admin();

    UPDATE public.borrow_requests
    SET status = 'approved', updated_at = timezone('utc', now())
    WHERE id = p_request_id AND status = 'pending';
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Request not found or not in pending status';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.admin_reject_request(p_request_id UUID, p_reason TEXT) RETURNS VOID AS $$
BEGIN
    PERFORM public.assert_borrow_admin();

    UPDATE public.borrow_requests
    SET status = 'rejected', cancel_reason = p_reason, updated_at = timezone('utc', now())
    WHERE id = p_request_id AND status = 'pending';
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Request not found or not in pending status';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.admin_receive_return(p_request_id UUID) RETURNS VOID AS $$
BEGIN
    PERFORM public.assert_borrow_admin();

    -- MVP: Fast return all items as OK
    UPDATE public.borrow_request_items
    SET qty_returned_ok = qty_borrowed
    WHERE request_id = p_request_id;

    UPDATE public.borrow_requests
    SET status = 'returned', updated_at = timezone('utc', now())
    WHERE id = p_request_id AND status IN ('approved', 'returned_pending_inspection');
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Request not found or not in approved status';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Lock down RPC execution surface.
REVOKE ALL ON FUNCTION public.submit_borrow_request(UUID, TEXT, TEXT, TEXT, DATE, DATE, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_borrow_request(UUID, TEXT, TEXT, TEXT, DATE, DATE, JSONB) TO authenticated;

REVOKE ALL ON FUNCTION public.get_borrow_request_status(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_borrow_request_status(TEXT) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.admin_approve_request(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_approve_request(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_reject_request(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reject_request(UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_receive_return(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_receive_return(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.is_borrow_admin(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_borrow_admin(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.assert_borrow_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_borrow_admin() TO authenticated;


-------------------------------------------------------------------------------
-- 7. ROW LEVEL SECURITY (RLS)
-------------------------------------------------------------------------------
ALTER TABLE public.borrow_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.borrow_request_items ENABLE ROW LEVEL SECURITY;

-- Block raw client INSERTs entirely
-- Allow SELECT for the owner
DROP POLICY IF EXISTS "Borrowers can view their own requests" ON public.borrow_requests;
CREATE POLICY "Borrowers can view their own requests"
ON public.borrow_requests FOR SELECT
USING (borrower_id = auth.uid());

DROP POLICY IF EXISTS "Borrowers can view their own request items" ON public.borrow_request_items;
CREATE POLICY "Borrowers can view their own request items"
ON public.borrow_request_items FOR SELECT
USING (request_id IN (SELECT id FROM public.borrow_requests WHERE borrower_id = auth.uid()));

DROP POLICY IF EXISTS "Admins can view all borrow requests" ON public.borrow_requests;
CREATE POLICY "Admins can view all borrow requests"
ON public.borrow_requests FOR SELECT
USING (public.is_borrow_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can update all borrow requests" ON public.borrow_requests;
CREATE POLICY "Admins can update all borrow requests"
ON public.borrow_requests FOR UPDATE
USING (public.is_borrow_admin(auth.uid()))
WITH CHECK (public.is_borrow_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can view all borrow request items" ON public.borrow_request_items;
CREATE POLICY "Admins can view all borrow request items"
ON public.borrow_request_items FOR SELECT
USING (public.is_borrow_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can update all borrow request items" ON public.borrow_request_items;
CREATE POLICY "Admins can update all borrow request items"
ON public.borrow_request_items FOR UPDATE
USING (public.is_borrow_admin(auth.uid()))
WITH CHECK (public.is_borrow_admin(auth.uid()));
