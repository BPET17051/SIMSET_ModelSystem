-- ============================================================
-- SIMSET Borrow current MVP release SQL
-- Purpose: canonical release script for the active MVP browser -> Worker -> Supabase flow.
-- Run first on preview Supabase, then production after verification passes.
-- ============================================================

BEGIN;

ALTER TABLE public.borrow_requests
    ADD COLUMN IF NOT EXISTS cancel_reason text,
    ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
    ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT timezone('utc', now()),
    ADD COLUMN IF NOT EXISTS expires_at timestamptz;

CREATE TABLE IF NOT EXISTS public.notification_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id uuid NOT NULL REFERENCES public.borrow_requests(id) ON DELETE CASCADE,
    recipient_email text,
    status text NOT NULL CHECK (status IN ('success', 'failed')),
    type text NOT NULL CHECK (type IN ('approved', 'rejected')),
    retry_count integer NOT NULL DEFAULT 0,
    sent_at timestamptz,
    error_message text,
    created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE UNIQUE INDEX IF NOT EXISTS notification_logs_one_success_per_type
ON public.notification_logs (request_id, type)
WHERE status = 'success';

ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read notification logs" ON public.notification_logs;
CREATE POLICY "Admins can read notification logs"
ON public.notification_logs FOR SELECT TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.generate_secure_tracking_id()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT 'SIM-' || upper(encode(extensions.gen_random_bytes(16), 'hex'));
$$;

REVOKE ALL ON FUNCTION public.generate_secure_tracking_id() FROM PUBLIC;

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
    normalized_email text := lower(NULLIF(trim(COALESCE(p_borrower_email, '')), ''));
    item jsonb;
    eq_id uuid;
    req_qty integer;
    requested_total_qty integer := 0;
    pending_request_count integer;
    pending_item_qty integer;
    locked_eq record;
    used_qty integer;
    available_qty integer;
BEGIN
    IF p_borrower_name IS NULL OR length(trim(p_borrower_name)) = 0 THEN
        RAISE EXCEPTION 'Borrower name is required';
    END IF;

    IF normalized_email IS NULL THEN
        RAISE EXCEPTION 'Borrower email is required';
    END IF;

    IF normalized_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' THEN
        RAISE EXCEPTION 'Invalid borrower email';
    END IF;

    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'At least one borrow item is required';
    END IF;

    IF p_start_date IS NULL OR p_end_date IS NULL OR p_end_date < p_start_date THEN
        RAISE EXCEPTION 'Invalid borrow date range';
    END IF;

    SELECT COUNT(DISTINCT br.id), COALESCE(SUM(bri.qty_borrowed), 0)
    INTO pending_request_count, pending_item_qty
    FROM public.borrow_requests br
    LEFT JOIN public.borrow_request_items bri ON bri.request_id = br.id
    WHERE lower(br.borrower_email) = normalized_email
      AND br.status = 'pending';

    IF pending_request_count >= 2 THEN
        RAISE EXCEPTION 'Too many pending requests for this email';
    END IF;

    SELECT COALESCE(SUM(COALESCE((value->>'qty')::integer, 0)), 0)
    INTO requested_total_qty
    FROM jsonb_array_elements(p_items);

    IF pending_item_qty + requested_total_qty > 5 THEN
        RAISE EXCEPTION 'Too many pending borrow items for this email';
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
        normalized_email,
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

-- Admin KPI summary in one database round-trip.
CREATE OR REPLACE FUNCTION public.get_admin_kpis(
    p_month_start date DEFAULT date_trunc('month', CURRENT_DATE)::date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_pending_all integer := 0;
    v_total_month integer := 0;
    v_approved_month integer := 0;
    v_negative_month integer := 0;
    v_avg_lead_time numeric := 0;
    v_top_equipment_name text;
    v_top_equipment_qty integer := 0;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF (auth.jwt() -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'unauthorized: admin role required';
    END IF;

    SELECT COUNT(*)
    INTO v_pending_all
    FROM public.borrow_requests
    WHERE status = 'pending';

    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE status IN ('approved', 'ready', 'borrowed', 'returned')),
        COUNT(*) FILTER (WHERE status IN ('cancelled', 'rejected'))
    INTO v_total_month, v_approved_month, v_negative_month
    FROM public.borrow_requests
    WHERE created_at >= p_month_start
      AND created_at < (p_month_start + INTERVAL '1 month');

    WITH first_items AS (
        SELECT
            br.id,
            br.created_at::date AS created_date,
            MIN(bri.start_date) AS first_start_date
        FROM public.borrow_requests br
        JOIN public.borrow_request_items bri ON bri.request_id = br.id
        WHERE br.created_at >= p_month_start
          AND br.created_at < (p_month_start + INTERVAL '1 month')
        GROUP BY br.id, br.created_at
    )
    SELECT COALESCE(ROUND(AVG(GREATEST(first_start_date - created_date, 0))::numeric, 1), 0)
    INTO v_avg_lead_time
    FROM first_items;

    SELECT e.name_th, COALESCE(SUM(bri.qty_borrowed), 0)::integer
    INTO v_top_equipment_name, v_top_equipment_qty
    FROM public.borrow_request_items bri
    JOIN public.borrow_requests br ON br.id = bri.request_id
    JOIN public.equipments e ON e.id = bri.equipment_id
    WHERE bri.start_date >= p_month_start
      AND bri.start_date < (p_month_start + INTERVAL '1 month')
      AND br.status NOT IN ('cancelled', 'rejected', 'expired')
    GROUP BY e.id, e.name_th
    ORDER BY SUM(bri.qty_borrowed) DESC, e.name_th ASC
    LIMIT 1;

    RETURN jsonb_build_object(
        'pending_all', v_pending_all,
        'approved_rate', CASE WHEN v_total_month = 0 THEN 0 ELSE ROUND((v_approved_month::numeric / v_total_month) * 100)::integer END,
        'closed_negative_rate', CASE WHEN v_total_month = 0 THEN 0 ELSE ROUND((v_negative_month::numeric / v_total_month) * 100)::integer END,
        'avg_lead_time_days', v_avg_lead_time,
        'top_equipment_name', v_top_equipment_name,
        'top_equipment_qty', COALESCE(v_top_equipment_qty, 0)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_kpis(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_kpis(date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_admin_kpis(date) TO authenticated;

-- Public cancellation by tracking ID for no-login borrower flow.
CREATE OR REPLACE FUNCTION public.cancel_borrow_request_public(
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
    v_status text;
    v_min_start date;
    v_reason text := COALESCE(NULLIF(trim(p_reason), ''), 'Cancelled by borrower');
BEGIN
    SELECT br.id, br.status
    INTO v_request_id, v_status
    FROM public.borrow_requests br
    WHERE br.tracking_id = p_tracking_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tracking ID not found';
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

REVOKE ALL ON FUNCTION public.cancel_borrow_request_public(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_borrow_request_public(text, text) TO anon, authenticated;

-- Admin approval with late-start protection.
CREATE OR REPLACE FUNCTION public.admin_approve_request(
    p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_min_start date;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF (auth.jwt() -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'unauthorized: admin role required';
    END IF;

    SELECT MIN(start_date)
    INTO v_min_start
    FROM public.borrow_request_items
    WHERE request_id = p_request_id;

    IF v_min_start IS NULL THEN
        RAISE EXCEPTION 'Borrow request has no items';
    END IF;

    IF v_min_start < CURRENT_DATE THEN
        RAISE EXCEPTION 'Cannot approve. Start date has already passed.';
    END IF;

    UPDATE public.borrow_requests
    SET
        status = 'approved',
        updated_at = timezone('utc', now())
    WHERE id = p_request_id
      AND status = 'pending';

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    RETURN jsonb_build_object(
        'request_id', p_request_id,
        'status', 'approved'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_approve_request(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_approve_request(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_approve_request(uuid) TO authenticated;

-- Admin rejection with required reason for borrower notification.
CREATE OR REPLACE FUNCTION public.admin_reject_request(
    p_request_id uuid,
    p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_reason text := NULLIF(trim(COALESCE(p_reason, '')), '');
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF (auth.jwt() -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'unauthorized: admin role required';
    END IF;

    IF v_reason IS NULL THEN
        RAISE EXCEPTION 'Reject reason is required';
    END IF;

    UPDATE public.borrow_requests
    SET
        status = 'rejected',
        cancel_reason = v_reason,
        cancelled_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
    WHERE id = p_request_id
      AND status = 'pending';

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    RETURN jsonb_build_object(
        'request_id', p_request_id,
        'status', 'rejected'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reject_request(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_reject_request(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_reject_request(uuid, text) TO authenticated;

-- Admin cancellation for requests that should be stopped outside the reject flow.
CREATE OR REPLACE FUNCTION public.admin_cancel_request(
    p_request_id uuid,
    p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_reason text := COALESCE(NULLIF(trim(p_reason), ''), 'Cancelled by admin');
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF (auth.jwt() -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'unauthorized: admin role required';
    END IF;

    UPDATE public.borrow_requests
    SET
        status = 'cancelled',
        cancel_reason = v_reason,
        cancelled_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
    WHERE id = p_request_id
      AND status IN ('pending', 'approved', 'ready', 'borrowed');

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    RETURN jsonb_build_object(
        'request_id', p_request_id,
        'status', 'cancelled'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_cancel_request(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_cancel_request(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_cancel_request(uuid, text) TO authenticated;

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

-- Supabase pg_cron backup job for pending request expiration.
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
EXCEPTION
    WHEN insufficient_privilege OR undefined_file THEN
        RAISE NOTICE 'pg_cron extension is not available in this environment; skipping cron setup.';
END;
$$;

DO $$
BEGIN
    IF to_regclass('cron.job') IS NOT NULL THEN
        PERFORM cron.unschedule(jobid)
        FROM cron.job
        WHERE jobname = 'expire-pending-requests';

        PERFORM cron.schedule(
            'expire-pending-requests',
            '*/15 * * * *',
            $job$
            UPDATE public.borrow_requests
            SET status = 'expired',
                updated_at = timezone('utc', now())
            WHERE status = 'pending'
              AND expires_at < timezone('utc', now());
            $job$
        );
    END IF;
END;
$$;

-- Verification queries:
-- SELECT n.nspname, p.proname, p.prosecdef, p.proacl
-- FROM pg_proc p
-- JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND p.proname IN (
--     'get_borrow_request_status',
--     'get_admin_kpis',
--     'submit_public_borrow_request',
--     'cancel_borrow_request_public',
--     'admin_approve_request',
--     'admin_reject_request',
--     'admin_cancel_request',
--     'admin_update_borrow_request_status'
--   )
-- ORDER BY p.proname;
