-- Phase 1 Migration: secure borrower cancellation via RPC
-- This migration introduces an authenticated RPC for borrower self-cancel.

CREATE OR REPLACE FUNCTION public.cancel_borrow_request(
    p_tracking_id TEXT,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_request_id UUID;
    v_borrower_id UUID;
    v_status TEXT;
    v_earliest_start DATE;
    v_now_utc TIMESTAMPTZ := timezone('utc', now());
    v_reason TEXT := COALESCE(NULLIF(trim(p_reason), ''), 'Cancelled by borrower');
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT
        br.id,
        br.borrower_id,
        br.status,
        MIN(bri.start_date)
    INTO
        v_request_id,
        v_borrower_id,
        v_status,
        v_earliest_start
    FROM public.borrow_requests br
    LEFT JOIN public.borrow_request_items bri ON bri.request_id = br.id
    WHERE br.tracking_id = p_tracking_id
    GROUP BY br.id, br.borrower_id, br.status;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tracking ID not found';
    END IF;

    IF v_borrower_id <> auth.uid() THEN
        RAISE EXCEPTION 'Forbidden: not request owner';
    END IF;

    IF v_status NOT IN ('pending', 'approved') THEN
        RAISE EXCEPTION 'Request is not cancellable in status: %', v_status;
    END IF;

    IF v_earliest_start IS NULL THEN
        RAISE EXCEPTION 'Request has no borrow items';
    END IF;

    -- Enforce 24h cutoff at server side.
    IF (v_earliest_start::timestamp - v_now_utc) < INTERVAL '24 hours' THEN
        RAISE EXCEPTION 'Cancellation window closed (less than 24 hours before pickup)';
    END IF;

    UPDATE public.borrow_requests
    SET
        status = 'cancelled',
        cancel_reason = v_reason,
        cancelled_at = v_now_utc,
        updated_at = v_now_utc
    WHERE id = v_request_id
      AND status IN ('pending', 'approved');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Request state changed, please retry';
    END IF;

    RETURN jsonb_build_object(
        'tracking_id', p_tracking_id,
        'status', 'cancelled'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_borrow_request(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_borrow_request(TEXT, TEXT) TO authenticated;

