-- ============================================================
-- SIMSET Borrow Phase 1: Domain Model & State Machine
-- Purpose:
-- - Centralize borrow request status transitions in database RPCs.
-- - Require an actor/user id for every transition.
-- - Audit every status transition with from/to status, actor, reason, and timestamp.
-- - Expire stale pending requests through Supabase Cron / pg_cron.
--
-- Apply after: supabase/current_mvp_release.sql
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

BEGIN;

CREATE SCHEMA IF NOT EXISTS simset_private;
REVOKE ALL ON SCHEMA simset_private FROM PUBLIC;

-- ----------------------------------------------------------------
-- 1. Domain columns and canonical statuses
-- ----------------------------------------------------------------

ALTER TABLE public.borrow_requests
    ADD COLUMN IF NOT EXISTS reject_reason text,
    ADD COLUMN IF NOT EXISTS cancel_reason text,
    ADD COLUMN IF NOT EXISTS return_note text,
    ADD COLUMN IF NOT EXISTS status_changed_at timestamptz,
    ADD COLUMN IF NOT EXISTS status_changed_by uuid,
    ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
    ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
    ADD COLUMN IF NOT EXISTS expired_at timestamptz,
    ADD COLUMN IF NOT EXISTS returned_at timestamptz;

ALTER TABLE public.borrow_requests
    DROP CONSTRAINT IF EXISTS valid_status,
    DROP CONSTRAINT IF EXISTS borrow_requests_status_check;

ALTER TABLE public.borrow_requests
    ADD CONSTRAINT borrow_requests_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'ready', 'borrowed', 'returned', 'cancelled', 'expired'));

-- ----------------------------------------------------------------
-- 2. Status-transition audit log
-- ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.borrow_request_status_audit (
    id bigserial PRIMARY KEY,
    request_id uuid NOT NULL REFERENCES public.borrow_requests(id) ON DELETE CASCADE,
    from_status text NOT NULL,
    to_status text NOT NULL,
    actor_user_id uuid NOT NULL,
    actor_type text NOT NULL CHECK (actor_type IN ('admin', 'borrower', 'system')),
    reason text,
    created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_borrow_request_status_audit_request_id_created_at
ON public.borrow_request_status_audit (request_id, created_at DESC);

ALTER TABLE public.borrow_request_status_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_select_borrow_request_status_audit" ON public.borrow_request_status_audit;
CREATE POLICY "admin_select_borrow_request_status_audit"
ON public.borrow_request_status_audit FOR SELECT
TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

REVOKE ALL ON TABLE public.borrow_request_status_audit FROM PUBLIC;
REVOKE ALL ON TABLE public.borrow_request_status_audit FROM anon;
GRANT SELECT ON TABLE public.borrow_request_status_audit TO authenticated;

-- ----------------------------------------------------------------
-- 3. Transition guard: direct status updates are rejected.
--    Only the central transition implementation sets this local flag.
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION simset_private.is_allowed_borrow_status_transition(
    p_current_status text,
    p_next_status text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT
        (p_current_status = 'pending' AND p_next_status IN ('approved', 'rejected', 'cancelled', 'expired'))
        OR (p_current_status = 'approved' AND p_next_status = 'ready')
        OR (p_current_status = 'ready' AND p_next_status = 'borrowed')
        OR (p_current_status = 'borrowed' AND p_next_status = 'returned');
$$;

CREATE OR REPLACE FUNCTION simset_private.enforce_borrow_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, simset_private, pg_temp
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status NOT IN ('pending', 'approved', 'rejected', 'ready', 'borrowed', 'returned', 'cancelled', 'expired') THEN
            RAISE EXCEPTION 'Invalid borrow status: %', NEW.status;
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NEW;
    END IF;

    IF current_setting('app.borrow_status_transition', true) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'Use transition_borrow_request_status RPC for status transitions';
    END IF;

    IF NOT simset_private.is_allowed_borrow_status_transition(OLD.status, NEW.status) THEN
        RAISE EXCEPTION 'Invalid borrow status transition: % -> %', OLD.status, NEW.status;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_borrow_status_transition ON public.borrow_requests;
CREATE TRIGGER trg_enforce_borrow_status_transition
BEFORE INSERT OR UPDATE OF status ON public.borrow_requests
FOR EACH ROW
EXECUTE FUNCTION simset_private.enforce_borrow_status_transition();

-- ----------------------------------------------------------------
-- 4. Central private implementation shared by public RPCs and cron.
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION simset_private.apply_borrow_request_status_transition(
    p_request_id uuid,
    p_current_status text,
    p_next_status text,
    p_actor_user_id uuid,
    p_actor_type text,
    p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, simset_private, pg_temp
AS $$
DECLARE
    v_request public.borrow_requests%ROWTYPE;
    v_reason text := NULLIF(trim(COALESCE(p_reason, '')), '');
    v_now timestamptz := timezone('utc', now());
BEGIN
    IF p_actor_user_id IS NULL THEN
        RAISE EXCEPTION 'actor_user_id is required';
    END IF;

    IF p_actor_type NOT IN ('admin', 'borrower', 'system') THEN
        RAISE EXCEPTION 'Invalid actor_type: %', p_actor_type;
    END IF;

    IF p_next_status NOT IN ('pending', 'approved', 'rejected', 'ready', 'borrowed', 'returned', 'cancelled', 'expired') THEN
        RAISE EXCEPTION 'Invalid next status: %', p_next_status;
    END IF;

    SELECT *
    INTO v_request
    FROM public.borrow_requests
    WHERE id = p_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    IF p_current_status IS NOT NULL AND v_request.status <> p_current_status THEN
        RETURN NULL;
    END IF;

    IF NOT simset_private.is_allowed_borrow_status_transition(v_request.status, p_next_status) THEN
        RAISE EXCEPTION 'Invalid borrow status transition: % -> %', v_request.status, p_next_status;
    END IF;

    IF p_next_status = 'rejected' AND v_reason IS NULL THEN
        RAISE EXCEPTION 'reject reason is required';
    END IF;

    IF p_next_status = 'cancelled' AND v_reason IS NULL THEN
        RAISE EXCEPTION 'cancel reason is required';
    END IF;

    PERFORM set_config('app.borrow_status_transition', 'on', true);

    UPDATE public.borrow_requests
    SET
        status = p_next_status,
        updated_at = v_now,
        status_changed_at = v_now,
        status_changed_by = p_actor_user_id,
        reject_reason = CASE WHEN p_next_status = 'rejected' THEN v_reason ELSE reject_reason END,
        cancel_reason = CASE WHEN p_next_status = 'cancelled' THEN v_reason ELSE cancel_reason END,
        return_note = CASE WHEN p_next_status = 'returned' THEN v_reason ELSE return_note END,
        rejected_at = CASE WHEN p_next_status = 'rejected' THEN v_now ELSE rejected_at END,
        cancelled_at = CASE WHEN p_next_status = 'cancelled' THEN v_now ELSE cancelled_at END,
        expired_at = CASE WHEN p_next_status = 'expired' THEN v_now ELSE expired_at END,
        returned_at = CASE WHEN p_next_status = 'returned' THEN v_now ELSE returned_at END
    WHERE id = p_request_id
      AND status = v_request.status;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    INSERT INTO public.borrow_request_status_audit (
        request_id,
        from_status,
        to_status,
        actor_user_id,
        actor_type,
        reason,
        created_at
    ) VALUES (
        p_request_id,
        v_request.status,
        p_next_status,
        p_actor_user_id,
        p_actor_type,
        v_reason,
        v_now
    );

    RETURN jsonb_build_object(
        'request_id', p_request_id,
        'from_status', v_request.status,
        'status', p_next_status,
        'actor_user_id', p_actor_user_id,
        'actor_type', p_actor_type
    );
END;
$$;

REVOKE ALL ON FUNCTION simset_private.apply_borrow_request_status_transition(uuid, text, text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simset_private.apply_borrow_request_status_transition(uuid, text, text, uuid, text, text) TO postgres, service_role;

-- ----------------------------------------------------------------
-- 5. Public RPC: callers must pass actor_user_id every time.
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.transition_borrow_request_status(
    p_request_id uuid,
    p_current_status text,
    p_next_status text,
    p_actor_user_id uuid,
    p_actor_type text DEFAULT 'admin',
    p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, simset_private, pg_temp
AS $$
DECLARE
    v_borrower_id uuid;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF p_actor_user_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'actor_user_id must match authenticated user';
    END IF;

    IF p_actor_type = 'admin' THEN
        IF (auth.jwt() -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN
            RAISE EXCEPTION 'unauthorized: admin role required';
        END IF;
    ELSIF p_actor_type = 'borrower' THEN
        IF NOT (p_current_status = 'pending' AND p_next_status = 'cancelled') THEN
            RAISE EXCEPTION 'borrower can only cancel pending requests';
        END IF;

        SELECT borrower_id
        INTO v_borrower_id
        FROM public.borrow_requests
        WHERE id = p_request_id;

        IF v_borrower_id IS DISTINCT FROM p_actor_user_id THEN
            RAISE EXCEPTION 'Forbidden: not request owner';
        END IF;
    ELSE
        RAISE EXCEPTION 'system transitions must use expire_pending_borrow_requests';
    END IF;

    RETURN simset_private.apply_borrow_request_status_transition(
        p_request_id,
        p_current_status,
        p_next_status,
        p_actor_user_id,
        p_actor_type,
        p_reason
    );
END;
$$;

REVOKE ALL ON FUNCTION public.transition_borrow_request_status(uuid, text, text, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transition_borrow_request_status(uuid, text, text, uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.transition_borrow_request_status(uuid, text, text, uuid, text, text) TO authenticated;

-- Backward-compatible admin RPC. New callers should use transition_borrow_request_status
-- and pass p_actor_user_id explicitly.
CREATE OR REPLACE FUNCTION public.admin_update_borrow_request_status(
    p_request_id uuid,
    p_current_status text,
    p_next_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, simset_private, pg_temp
AS $$
BEGIN
    RETURN public.transition_borrow_request_status(
        p_request_id,
        p_current_status,
        p_next_status,
        auth.uid(),
        'admin',
        NULL
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_borrow_request_status(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_borrow_request_status(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_update_borrow_request_status(uuid, text, text) TO authenticated;

-- ----------------------------------------------------------------
-- 6. Cron target: expire stale pending requests.
--    The system actor id must be stable so every cron transition is auditable.
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.expire_pending_borrow_requests(
    p_system_actor_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, simset_private, pg_temp
AS $$
DECLARE
    v_request record;
    v_expired_count integer := 0;
BEGIN
    IF p_system_actor_id IS NULL THEN
        RAISE EXCEPTION 'system_actor_id is required';
    END IF;

    FOR v_request IN
        SELECT id, status
        FROM public.borrow_requests
        WHERE status = 'pending'
          AND expires_at IS NOT NULL
          AND expires_at <= timezone('utc', now())
        ORDER BY expires_at ASC
        FOR UPDATE SKIP LOCKED
    LOOP
        PERFORM simset_private.apply_borrow_request_status_transition(
            v_request.id,
            'pending',
            'expired',
            p_system_actor_id,
            'system',
            'Pending request expired by scheduled job'
        );
        v_expired_count := v_expired_count + 1;
    END LOOP;

    RETURN v_expired_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_pending_borrow_requests(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expire_pending_borrow_requests(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.expire_pending_borrow_requests(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.expire_pending_borrow_requests(uuid) TO postgres, service_role;

COMMIT;

-- ----------------------------------------------------------------
-- 7. Supabase Cron / pg_cron schedule
-- ----------------------------------------------------------------
-- Supabase Cron uses pg_cron and can run a database function directly.
-- Enable Supabase Cron in the Dashboard first if pg_cron is not enabled yet.
-- The reserved UUID below is the system actor id for scheduled expirations.
-- It is intentionally outside the normal Supabase Auth v4 UUID shape.

SELECT cron.schedule(
    'simset-expire-pending-borrow-requests',
    '*/5 * * * *',
    $$SELECT public.expire_pending_borrow_requests('00000000-0000-0000-0000-000000000001'::uuid);$$
);

-- ----------------------------------------------------------------
-- Verification queries:
-- SELECT proname, prosecdef, proacl
-- FROM pg_proc
-- WHERE proname IN ('transition_borrow_request_status', 'expire_pending_borrow_requests', 'admin_update_borrow_request_status')
-- ORDER BY proname;
--
-- SELECT *
-- FROM cron.job
-- WHERE jobname = 'simset-expire-pending-borrow-requests';
--
-- SELECT request_id, from_status, to_status, actor_user_id, actor_type, reason, created_at
-- FROM public.borrow_request_status_audit
-- ORDER BY created_at DESC
-- LIMIT 20;
