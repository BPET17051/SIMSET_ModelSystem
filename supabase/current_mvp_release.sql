-- ============================================================
-- SIMSET Borrow current MVP release SQL
-- Purpose: one ordered release script for the active browser -> Worker -> Supabase flow.
--
-- This consolidates:
-- - Current MVP public tracking/admin RPC contracts
-- - Phase 1 domain state machine and status audit
-- - Phase 2 authenticated borrower submit/history contracts
-- - Wave 1 exact manikin assignment and automatic manikin status sync
--
-- Run first on preview Supabase, then production after verification passes.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE SCHEMA IF NOT EXISTS simset_private;
REVOKE ALL ON SCHEMA simset_private FROM PUBLIC;

-- ----------------------------------------------------------------
-- 1. Baseline borrow tables and domain columns
-- ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.equipments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name_th text
);

CREATE TABLE IF NOT EXISTS public.manikins (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sap_id text NOT NULL
);

ALTER TABLE public.equipments
    ADD COLUMN IF NOT EXISTS name_en text,
    ADD COLUMN IF NOT EXISTS type text,
    ADD COLUMN IF NOT EXISTS source_team_code text,
    ADD COLUMN IF NOT EXISTS inventory_mode text NOT NULL DEFAULT 'quantity_only',
    ADD COLUMN IF NOT EXISTS total_quantity integer NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS maintenance_quantity integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS allocation_type text NOT NULL DEFAULT 'rotating',
    ADD COLUMN IF NOT EXISTS borrow_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.equipments
    DROP CONSTRAINT IF EXISTS equipments_allocation_type_check,
    DROP CONSTRAINT IF EXISTS equipments_inventory_mode_check;

ALTER TABLE public.equipments
    ADD CONSTRAINT equipments_allocation_type_check
    CHECK (allocation_type IN ('rotating', 'room_dedicated', 'advance_course_dedicated')),
    ADD CONSTRAINT equipments_inventory_mode_check
    CHECK (inventory_mode IN ('manikin', 'tracked_unit', 'kit', 'quantity_only'));

UPDATE public.equipments
SET inventory_mode = 'manikin'
WHERE source_team_code IS NOT NULL
  AND inventory_mode = 'quantity_only';

ALTER TABLE public.manikins
    ADD COLUMN IF NOT EXISTS model_id text,
    ADD COLUMN IF NOT EXISTS team_code text,
    ADD COLUMN IF NOT EXISTS display_name text,
    ADD COLUMN IF NOT EXISTS asset_code text,
    ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ready',
    ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS notes text,
    ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.manikins
    DROP CONSTRAINT IF EXISTS manikins_status_check;

ALTER TABLE public.manikins
    ADD CONSTRAINT manikins_status_check
    CHECK (status IN ('ready', 'in_use', 'maintenance', 'retired'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_manikins_model_id_unique
ON public.manikins (model_id)
WHERE model_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.borrow_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tracking_id text NOT NULL UNIQUE,
    borrower_id uuid,
    borrower_name text NOT NULL,
    borrower_email text,
    purpose text,
    status text NOT NULL DEFAULT 'pending',
    expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

ALTER TABLE public.borrow_requests
    ADD COLUMN IF NOT EXISTS borrower_id uuid,
    ADD COLUMN IF NOT EXISTS borrower_name text,
    ADD COLUMN IF NOT EXISTS borrower_email text,
    ADD COLUMN IF NOT EXISTS borrower_position text,
    ADD COLUMN IF NOT EXISTS borrower_phone text,
    ADD COLUMN IF NOT EXISTS borrower_department text,
    ADD COLUMN IF NOT EXISTS borrow_purpose_owner text,
    ADD COLUMN IF NOT EXISTS work_purpose text,
    ADD COLUMN IF NOT EXISTS usage_location text,
    ADD COLUMN IF NOT EXISTS purpose text,
    ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS expires_at timestamptz,
    ADD COLUMN IF NOT EXISTS reject_reason text,
    ADD COLUMN IF NOT EXISTS cancel_reason text,
    ADD COLUMN IF NOT EXISTS return_note text,
    ADD COLUMN IF NOT EXISTS approved_by uuid,
    ADD COLUMN IF NOT EXISTS approved_at timestamptz,
    ADD COLUMN IF NOT EXISTS checked_out_at timestamptz,
    ADD COLUMN IF NOT EXISTS status_changed_at timestamptz,
    ADD COLUMN IF NOT EXISTS status_changed_by uuid,
    ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
    ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
    ADD COLUMN IF NOT EXISTS expired_at timestamptz,
    ADD COLUMN IF NOT EXISTS returned_at timestamptz,
    ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT timezone('utc', now());

ALTER TABLE public.borrow_requests
    DROP CONSTRAINT IF EXISTS valid_status,
    DROP CONSTRAINT IF EXISTS borrow_requests_status_check;

ALTER TABLE public.borrow_requests
    ADD CONSTRAINT borrow_requests_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'ready', 'borrowed', 'returned', 'inspection', 'completed', 'damaged', 'lost', 'cancelled', 'expired', 'overdue'));

CREATE TABLE IF NOT EXISTS public.borrow_request_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id uuid NOT NULL REFERENCES public.borrow_requests(id) ON DELETE CASCADE,
    equipment_id uuid NOT NULL REFERENCES public.equipments(id) ON DELETE RESTRICT,
    start_date date NOT NULL,
    end_date date NOT NULL,
    qty_borrowed integer NOT NULL CHECK (qty_borrowed > 0),
    qty_returned_ok integer NOT NULL DEFAULT 0,
    qty_returned_damaged integer NOT NULL DEFAULT 0,
    qty_returned_maintenance integer NOT NULL DEFAULT 0,
    CONSTRAINT borrow_request_items_valid_dates CHECK (end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS public.equipment_units (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    equipment_id uuid NOT NULL REFERENCES public.equipments(id) ON DELETE CASCADE,
    unit_code text NOT NULL,
    asset_code text,
    status text NOT NULL DEFAULT 'ready',
    requires_l1_approval boolean NOT NULL DEFAULT false,
    borrow_count integer NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    notes text,
    created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    UNIQUE (equipment_id, unit_code),
    CONSTRAINT equipment_units_status_check CHECK (status IN ('ready', 'in_use', 'maintenance', 'missing', 'retired'))
);

CREATE INDEX IF NOT EXISTS idx_equipment_units_equipment_status
ON public.equipment_units (equipment_id, status, is_active);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'manikins_sap_id_unique'
          AND conrelid = 'public.manikins'::regclass
    ) THEN
        ALTER TABLE public.manikins
            ADD CONSTRAINT manikins_sap_id_unique UNIQUE (sap_id);
    END IF;
END $$;

ALTER TABLE public.borrow_request_items
    ADD COLUMN IF NOT EXISTS manikin_sap_id text REFERENCES public.manikins(sap_id),
    ADD COLUMN IF NOT EXISTS equipment_unit_id uuid REFERENCES public.equipment_units(id),
    ADD COLUMN IF NOT EXISTS inventory_mode text NOT NULL DEFAULT 'quantity_only',
    ADD COLUMN IF NOT EXISTS requires_l1_approval boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS return_blocking boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS return_note text;

ALTER TABLE public.borrow_request_items
    DROP CONSTRAINT IF EXISTS borrow_request_items_inventory_mode_check;

ALTER TABLE public.borrow_request_items
    ADD CONSTRAINT borrow_request_items_inventory_mode_check
    CHECK (inventory_mode IN ('manikin', 'tracked_unit', 'kit', 'quantity_only'));

CREATE TABLE IF NOT EXISTS public.courses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    course_code text NOT NULL UNIQUE,
    course_name text NOT NULL,
    starts_on date NOT NULL,
    ends_on date NOT NULL,
    created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT courses_valid_dates CHECK (ends_on >= starts_on)
);

CREATE TABLE IF NOT EXISTS public.course_reserved_manikins (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    manikin_sap_id text NOT NULL REFERENCES public.manikins(sap_id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    UNIQUE (course_id, manikin_sap_id)
);

CREATE TABLE IF NOT EXISTS public.manikin_allocation_type_audit (
    id bigserial PRIMARY KEY,
    equipment_id uuid NOT NULL REFERENCES public.equipments(id) ON DELETE CASCADE,
    changed_by uuid,
    from_allocation_type text,
    to_allocation_type text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id bigserial PRIMARY KEY,
    action text NOT NULL,
    actor_email text NOT NULL,
    target_ids jsonb NOT NULL,
    note text,
    created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_course_reserved_manikins_sap_id
ON public.course_reserved_manikins (manikin_sap_id);

CREATE INDEX IF NOT EXISTS idx_courses_date_window
ON public.courses (starts_on, ends_on);

ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_reserved_manikins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manikin_allocation_type_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_units ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE public.equipments TO anon;
GRANT SELECT ON TABLE public.equipments TO authenticated;

DROP POLICY IF EXISTS "public_select_borrowable_equipments" ON public.equipments;
CREATE POLICY "public_select_borrowable_equipments"
ON public.equipments FOR SELECT
TO anon
USING (borrow_enabled = true);

DROP POLICY IF EXISTS "authenticated_select_equipments" ON public.equipments;
CREATE POLICY "authenticated_select_equipments"
ON public.equipments FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "staff_select_courses" ON public.courses;
CREATE POLICY "staff_select_courses"
ON public.courses FOR SELECT
TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'staff', 'approver_l1'));

DROP POLICY IF EXISTS "staff_select_course_reserved_manikins" ON public.course_reserved_manikins;
CREATE POLICY "staff_select_course_reserved_manikins"
ON public.course_reserved_manikins FOR SELECT
TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'staff', 'approver_l1'));

DROP POLICY IF EXISTS "admin_select_manikin_allocation_type_audit" ON public.manikin_allocation_type_audit;
CREATE POLICY "admin_select_manikin_allocation_type_audit"
ON public.manikin_allocation_type_audit FOR SELECT
TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "admin_select_audit_logs" ON public.audit_logs;
CREATE POLICY "admin_select_audit_logs"
ON public.audit_logs FOR SELECT
TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "admin_insert_audit_logs" ON public.audit_logs;
CREATE POLICY "admin_insert_audit_logs"
ON public.audit_logs FOR INSERT
TO authenticated
WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

GRANT SELECT ON TABLE public.courses TO authenticated;
GRANT SELECT ON TABLE public.course_reserved_manikins TO authenticated;
GRANT SELECT ON TABLE public.manikin_allocation_type_audit TO authenticated;
GRANT SELECT, INSERT ON TABLE public.audit_logs TO authenticated;
REVOKE ALL ON TABLE public.equipment_units FROM PUBLIC;
REVOKE ALL ON TABLE public.equipment_units FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.equipment_units TO authenticated;

DROP POLICY IF EXISTS "staff_select_equipment_units" ON public.equipment_units;
CREATE POLICY "staff_select_equipment_units"
ON public.equipment_units FOR SELECT
TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'staff', 'approver_l1'));

DROP POLICY IF EXISTS "admin_write_equipment_units" ON public.equipment_units;
CREATE POLICY "admin_write_equipment_units"
ON public.equipment_units FOR ALL
TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'staff'))
WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'staff'));

CREATE INDEX IF NOT EXISTS idx_borrow_request_items_overlap
ON public.borrow_request_items (equipment_id, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_borrow_request_items_manikin_overlap
ON public.borrow_request_items (manikin_sap_id, start_date, end_date)
WHERE manikin_sap_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_borrow_request_items_unit_overlap
ON public.borrow_request_items (equipment_unit_id, start_date, end_date)
WHERE equipment_unit_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_borrow_requests_status
ON public.borrow_requests(status);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
       AND NOT EXISTS (
           SELECT 1
           FROM pg_publication_tables
           WHERE pubname = 'supabase_realtime'
             AND schemaname = 'public'
             AND tablename = 'borrow_requests'
       ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.borrow_requests;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.line_notification_outbox (
    id bigserial PRIMARY KEY,
    event_type text NOT NULL CHECK (event_type IN ('order_created', 'l1_approved', 'overdue', 'room_dedicated_review')),
    request_id uuid REFERENCES public.borrow_requests(id) ON DELETE SET NULL,
    recipient_group text NOT NULL DEFAULT 'staff',
    message text NOT NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    send_status text NOT NULL DEFAULT 'pending' CHECK (send_status IN ('pending', 'sent', 'failed', 'skipped')),
    error_message text,
    sent_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

ALTER TABLE public.line_notification_outbox
    DROP CONSTRAINT IF EXISTS line_notification_outbox_event_type_check;

ALTER TABLE public.line_notification_outbox
    ADD CONSTRAINT line_notification_outbox_event_type_check
    CHECK (event_type IN ('order_created', 'l1_approved', 'overdue', 'room_dedicated_review'));

CREATE INDEX IF NOT EXISTS idx_line_notification_outbox_status_created_at
ON public.line_notification_outbox (send_status, created_at);

ALTER TABLE public.line_notification_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_select_line_notification_outbox" ON public.line_notification_outbox;
CREATE POLICY "admin_select_line_notification_outbox"
ON public.line_notification_outbox FOR SELECT
TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'approver_l1'));

REVOKE ALL ON TABLE public.line_notification_outbox FROM PUBLIC;
REVOKE ALL ON TABLE public.line_notification_outbox FROM anon;
GRANT SELECT ON TABLE public.line_notification_outbox TO authenticated;

CREATE TABLE IF NOT EXISTS public.staff_alerts (
    id bigserial PRIMARY KEY,
    alert_type text NOT NULL CHECK (alert_type IN ('return_abnormal')),
    request_id uuid REFERENCES public.borrow_requests(id) ON DELETE CASCADE,
    message text NOT NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    acknowledged_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_staff_alerts_created_at
ON public.staff_alerts (created_at DESC);

ALTER TABLE public.staff_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_select_staff_alerts" ON public.staff_alerts;
CREATE POLICY "staff_select_staff_alerts"
ON public.staff_alerts FOR SELECT
TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'staff', 'approver_l1'));

REVOKE ALL ON TABLE public.staff_alerts FROM PUBLIC;
REVOKE ALL ON TABLE public.staff_alerts FROM anon;
GRANT SELECT ON TABLE public.staff_alerts TO authenticated;

CREATE TABLE IF NOT EXISTS public.condition_snapshots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id uuid NOT NULL REFERENCES public.borrow_requests(id) ON DELETE CASCADE,
    snapshot_type text NOT NULL CHECK (snapshot_type IN ('pre_checkout', 'post_return')),
    condition_status text NOT NULL CHECK (condition_status IN ('normal', 'damaged', 'maintenance', 'missing')),
    note text NOT NULL,
    image_urls text[] NOT NULL CHECK (array_length(image_urls, 1) >= 1),
    created_by uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_condition_snapshots_request_type
ON public.condition_snapshots (request_id, snapshot_type, created_at DESC);

CREATE TABLE IF NOT EXISTS public.kit_refill_tasks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id uuid REFERENCES public.borrow_requests(id) ON DELETE SET NULL,
    borrow_request_item_id uuid REFERENCES public.borrow_request_items(id) ON DELETE SET NULL,
    equipment_unit_id uuid REFERENCES public.equipment_units(id) ON DELETE SET NULL,
    condition_snapshot_id uuid REFERENCES public.condition_snapshots(id) ON DELETE SET NULL,
    note text NOT NULL,
    status text NOT NULL DEFAULT 'open',
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    resolved_at timestamptz,
    CONSTRAINT kit_refill_tasks_status_check CHECK (status IN ('open', 'resolved', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_kit_refill_tasks_status_created_at
ON public.kit_refill_tasks (status, created_at DESC);

ALTER TABLE public.condition_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kit_refill_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_select_condition_snapshots" ON public.condition_snapshots;
CREATE POLICY "staff_select_condition_snapshots"
ON public.condition_snapshots FOR SELECT
TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'staff', 'approver_l1'));

REVOKE ALL ON TABLE public.condition_snapshots FROM PUBLIC;
REVOKE ALL ON TABLE public.condition_snapshots FROM anon;
GRANT SELECT ON TABLE public.condition_snapshots TO authenticated;
REVOKE ALL ON TABLE public.kit_refill_tasks FROM PUBLIC;
REVOKE ALL ON TABLE public.kit_refill_tasks FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.kit_refill_tasks TO authenticated;

DROP POLICY IF EXISTS "staff_select_kit_refill_tasks" ON public.kit_refill_tasks;
CREATE POLICY "staff_select_kit_refill_tasks"
ON public.kit_refill_tasks FOR SELECT
TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'staff', 'approver_l1'));

DROP POLICY IF EXISTS "staff_write_kit_refill_tasks" ON public.kit_refill_tasks;
CREATE POLICY "staff_write_kit_refill_tasks"
ON public.kit_refill_tasks FOR ALL
TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'staff'))
WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'staff'));

INSERT INTO storage.buckets (id, name, public)
VALUES ('condition-snapshots', 'condition-snapshots', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "staff_upload_condition_snapshots" ON storage.objects;
CREATE POLICY "staff_upload_condition_snapshots"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'condition-snapshots'
    AND (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'staff')
);

DROP POLICY IF EXISTS "staff_read_condition_snapshots" ON storage.objects;
CREATE POLICY "staff_read_condition_snapshots"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'condition-snapshots'
    AND (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'staff', 'approver_l1')
);

-- ----------------------------------------------------------------
-- 2. Status-transition audit log
-- ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.borrow_request_status_audit (
    id bigserial PRIMARY KEY,
    request_id uuid NOT NULL REFERENCES public.borrow_requests(id) ON DELETE CASCADE,
    from_status text NOT NULL,
    to_status text NOT NULL,
    actor_user_id uuid NOT NULL,
    actor_type text NOT NULL CHECK (actor_type IN ('admin', 'staff', 'approver_l1', 'borrower', 'system')),
    reason text,
    created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

ALTER TABLE public.borrow_request_status_audit
    DROP CONSTRAINT IF EXISTS borrow_request_status_audit_actor_type_check;

ALTER TABLE public.borrow_request_status_audit
    ADD CONSTRAINT borrow_request_status_audit_actor_type_check
    CHECK (actor_type IN ('admin', 'staff', 'approver_l1', 'borrower', 'system'));

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

CREATE TABLE IF NOT EXISTS public.identity_claim (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id uuid NOT NULL REFERENCES public.borrow_requests(id) ON DELETE CASCADE,
    claimant_user_id uuid NOT NULL,
    claimant_email text NOT NULL,
    claim_method text NOT NULL DEFAULT 'email_match',
    created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT identity_claim_method_check CHECK (claim_method IN ('email_match')),
    UNIQUE (request_id, claimant_user_id)
);

CREATE INDEX IF NOT EXISTS idx_identity_claim_user_created_at
ON public.identity_claim (claimant_user_id, created_at DESC);

ALTER TABLE public.identity_claim ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "claimant_select_identity_claim" ON public.identity_claim;
CREATE POLICY "claimant_select_identity_claim"
ON public.identity_claim FOR SELECT
TO authenticated
USING (
    claimant_user_id = auth.uid()
    OR (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'staff', 'approver_l1')
);

REVOKE ALL ON TABLE public.identity_claim FROM PUBLIC;
REVOKE ALL ON TABLE public.identity_claim FROM anon;
GRANT SELECT ON TABLE public.identity_claim TO authenticated;

-- ----------------------------------------------------------------
-- 3. Shared helpers
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.generate_secure_tracking_id()
RETURNS text
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
    chars text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    result text := '';
    i integer;
BEGIN
    FOR i IN 1..8 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;

    RETURN 'SIM-' || to_char(timezone('utc', now()), 'YYYYMMDD') || '-' || result;
END;
$$;

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
        OR (p_current_status = 'approved' AND p_next_status IN ('ready', 'borrowed'))
        OR (p_current_status = 'ready' AND p_next_status = 'borrowed')
        OR (p_current_status = 'borrowed' AND p_next_status IN ('returned', 'overdue'))
        OR (p_current_status = 'overdue' AND p_next_status = 'returned')
        OR (p_current_status = 'returned' AND p_next_status = 'inspection')
        OR (p_current_status = 'inspection' AND p_next_status IN ('completed', 'damaged', 'lost'));
$$;

CREATE OR REPLACE FUNCTION simset_private.enforce_borrow_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, simset_private, pg_temp
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status NOT IN ('pending', 'approved', 'rejected', 'ready', 'borrowed', 'returned', 'inspection', 'completed', 'damaged', 'lost', 'cancelled', 'expired', 'overdue') THEN
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

CREATE OR REPLACE FUNCTION simset_private.manikin_has_other_active_assignment(
    p_sap_id text,
    p_request_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.borrow_request_items bri
        JOIN public.borrow_requests br ON br.id = bri.request_id
        WHERE bri.manikin_sap_id = p_sap_id
          AND br.id <> p_request_id
          AND br.status IN ('pending', 'approved', 'ready', 'borrowed', 'overdue')
    );
$$;

CREATE OR REPLACE FUNCTION simset_private.unit_has_other_active_assignment(
    p_unit_id uuid,
    p_request_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.borrow_request_items bri
        JOIN public.borrow_requests br ON br.id = bri.request_id
        WHERE bri.equipment_unit_id = p_unit_id
          AND br.id <> p_request_id
          AND br.status IN ('pending', 'approved', 'ready', 'borrowed', 'overdue')
    );
$$;

-- ----------------------------------------------------------------
-- 4. Manikin status sync from order status
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION simset_private.sync_manikin_status_from_borrow_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, simset_private, pg_temp
AS $$
BEGIN
    IF TG_OP <> 'UPDATE' OR NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NEW;
    END IF;

    IF NEW.status = 'borrowed' THEN
        UPDATE public.manikins m
        SET status = 'in_use'
        FROM public.borrow_request_items bri
        WHERE bri.request_id = NEW.id
          AND bri.manikin_sap_id = m.sap_id
          AND m.status = 'ready';

        UPDATE public.equipment_units eu
        SET status = 'in_use',
            borrow_count = borrow_count + 1
        FROM public.borrow_request_items bri
        WHERE bri.request_id = NEW.id
          AND bri.equipment_unit_id = eu.id
          AND eu.status = 'ready';
    ELSIF NEW.status IN ('completed', 'cancelled', 'rejected', 'expired') THEN
        UPDATE public.manikins m
        SET status = 'ready'
        FROM public.borrow_request_items bri
        WHERE bri.request_id = NEW.id
          AND bri.manikin_sap_id = m.sap_id
          AND m.status IN ('in_use', 'ready')
          AND NOT simset_private.manikin_has_other_active_assignment(m.sap_id, NEW.id);

        UPDATE public.equipment_units eu
        SET status = 'ready'
        FROM public.borrow_request_items bri
        WHERE bri.request_id = NEW.id
          AND bri.equipment_unit_id = eu.id
          AND eu.status IN ('in_use', 'ready')
          AND NOT simset_private.unit_has_other_active_assignment(eu.id, NEW.id);
    ELSIF NEW.status = 'damaged' THEN
        UPDATE public.manikins m
        SET status = 'maintenance'
        FROM public.borrow_request_items bri
        WHERE bri.request_id = NEW.id
          AND bri.manikin_sap_id = m.sap_id
          AND m.status IN ('in_use', 'ready');

        UPDATE public.equipment_units eu
        SET status = 'maintenance'
        FROM public.borrow_request_items bri
        WHERE bri.request_id = NEW.id
          AND bri.equipment_unit_id = eu.id
          AND eu.status IN ('in_use', 'ready');
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_manikin_status_from_borrow_request ON public.borrow_requests;
CREATE TRIGGER trg_sync_manikin_status_from_borrow_request
AFTER UPDATE OF status ON public.borrow_requests
FOR EACH ROW
EXECUTE FUNCTION simset_private.sync_manikin_status_from_borrow_request();

CREATE OR REPLACE FUNCTION simset_private.enqueue_line_notification(
    p_event_type text,
    p_request_id uuid,
    p_recipient_group text,
    p_message text,
    p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_id bigint;
BEGIN
    IF p_event_type NOT IN ('order_created', 'l1_approved', 'overdue', 'room_dedicated_review') THEN
        RAISE EXCEPTION 'Unsupported LINE event type: %', p_event_type;
    END IF;

    INSERT INTO public.line_notification_outbox (
        event_type,
        request_id,
        recipient_group,
        message,
        payload
    ) VALUES (
        p_event_type,
        p_request_id,
        COALESCE(NULLIF(trim(p_recipient_group), ''), 'staff'),
        p_message,
        COALESCE(p_payload, '{}'::jsonb)
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION simset_private.department_from_purpose(p_purpose text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT COALESCE(
        NULLIF(trim(substring(COALESCE(p_purpose, '') from 'หน่วยงาน:\s*([^|]+)')), ''),
        NULLIF(trim(substring(COALESCE(p_purpose, '') from 'Department:\s*([^|]+)')), ''),
        '-'
    );
$$;

CREATE OR REPLACE FUNCTION simset_private.business_days_between(p_from date, p_to date)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(count(*)::integer, 0)
    FROM generate_series(p_from, p_to - 1, interval '1 day') AS day(value)
    WHERE EXTRACT(ISODOW FROM day.value) < 6;
$$;

CREATE OR REPLACE FUNCTION simset_private.advance_course_conflicts(
    p_equipment_id uuid,
    p_start_date date,
    p_end_date date,
    p_manikin_sap_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'course_id', c.id,
        'course_code', c.course_code,
        'course_name', c.course_name,
        'starts_on', c.starts_on,
        'ends_on', c.ends_on,
        'manikin_sap_id', crm.manikin_sap_id
    ) ORDER BY c.starts_on, c.course_code, crm.manikin_sap_id), '[]'::jsonb)
    FROM public.equipments e
    JOIN public.manikins m ON m.team_code = e.source_team_code
    JOIN public.course_reserved_manikins crm ON crm.manikin_sap_id = m.sap_id
    JOIN public.courses c ON c.id = crm.course_id
    WHERE e.id = p_equipment_id
      AND e.allocation_type = 'advance_course_dedicated'
      AND (p_manikin_sap_id IS NULL OR crm.manikin_sap_id = p_manikin_sap_id)
      AND c.starts_on <= p_end_date
      AND c.ends_on >= p_start_date;
$$;

CREATE OR REPLACE FUNCTION simset_private.audit_equipment_allocation_type()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF OLD.allocation_type IS DISTINCT FROM NEW.allocation_type THEN
        INSERT INTO public.manikin_allocation_type_audit (
            equipment_id,
            changed_by,
            from_allocation_type,
            to_allocation_type
        ) VALUES (
            NEW.id,
            auth.uid(),
            OLD.allocation_type,
            NEW.allocation_type
        );

        INSERT INTO public.audit_logs (
            action,
            actor_email,
            target_ids,
            note
        ) VALUES (
            'change_allocation_type',
            COALESCE(auth.jwt() ->> 'email', 'system'),
            jsonb_build_array(NEW.id),
            'allocation_type: ' || COALESCE(OLD.allocation_type, '-') || ' -> ' || NEW.allocation_type
        );
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_equipment_allocation_type ON public.equipments;
CREATE TRIGGER trg_audit_equipment_allocation_type
AFTER UPDATE OF allocation_type ON public.equipments
FOR EACH ROW
EXECUTE FUNCTION simset_private.audit_equipment_allocation_type();

-- ----------------------------------------------------------------
-- 5. Central status transition implementation and public RPCs
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

    IF p_actor_type NOT IN ('admin', 'staff', 'approver_l1', 'borrower', 'system') THEN
        RAISE EXCEPTION 'Invalid actor_type: %', p_actor_type;
    END IF;

    IF p_next_status NOT IN ('pending', 'approved', 'rejected', 'ready', 'borrowed', 'returned', 'inspection', 'completed', 'damaged', 'lost', 'cancelled', 'expired', 'overdue') THEN
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
        return_note = CASE WHEN p_next_status IN ('returned', 'completed', 'damaged', 'lost') THEN v_reason ELSE return_note END,
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
    ELSIF p_actor_type = 'staff' THEN
        IF (auth.jwt() -> 'app_metadata' ->> 'role') NOT IN ('admin', 'staff') THEN
            RAISE EXCEPTION 'unauthorized: staff role required';
        END IF;
    ELSIF p_actor_type = 'approver_l1' THEN
        IF (auth.jwt() -> 'app_metadata' ->> 'role') NOT IN ('approver_l1', 'admin') THEN
            RAISE EXCEPTION 'unauthorized: approver_l1 role required';
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
-- 6. Borrower submit/history and public tracking
-- ----------------------------------------------------------------

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
    selected_sap_id text;
    selected_unit_id uuid;
    v_inventory_mode text;
    course_conflicts jsonb;
    v_email text := lower(COALESCE(auth.jwt() ->> 'email', ''));
    i integer;
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

    PERFORM simset_private.enqueue_line_notification(
        'order_created',
        new_request_id,
        'staff',
        'New borrow order ' || new_tracking_id || ' from ' || simset_private.department_from_purpose(p_purpose),
        jsonb_build_object(
            'tracking_id', new_tracking_id,
            'department', simset_private.department_from_purpose(p_purpose),
            'borrower_name', trim(p_borrower_name)
        )
    );

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
          AND borrow_enabled = true
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Equipment not found';
        END IF;

        IF locked_eq.allocation_type = 'room_dedicated' THEN
            PERFORM simset_private.enqueue_line_notification(
                'room_dedicated_review',
                new_request_id,
                'staff_and_head',
                'Room-dedicated order ' || new_tracking_id || ' needs special review before approval.',
                jsonb_build_object(
                    'tracking_id', new_tracking_id,
                    'equipment_id', eq_id,
                    'required_notice_business_days', 7,
                    'start_date', p_start_date
                )
            );
        END IF;

        IF locked_eq.allocation_type = 'advance_course_dedicated' THEN
            course_conflicts := simset_private.advance_course_conflicts(eq_id, p_start_date, p_end_date);
            IF jsonb_array_length(course_conflicts) > 0 THEN
                RAISE EXCEPTION 'Advance course dedicated equipment is reserved by course: %', course_conflicts->0->>'course_name';
            END IF;
        END IF;

        v_inventory_mode := COALESCE(locked_eq.inventory_mode, CASE WHEN locked_eq.source_team_code IS NULL THEN 'quantity_only' ELSE 'manikin' END);

        IF v_inventory_mode IN ('tracked_unit', 'kit') THEN
            SELECT count(*)::integer
            INTO available_qty
            FROM public.equipment_units eu
            WHERE eu.equipment_id = eq_id
              AND eu.status = 'ready'
              AND eu.is_active = true
              AND NOT EXISTS (
                  SELECT 1
                  FROM public.borrow_request_items existing_bri
                  JOIN public.borrow_requests existing_br ON existing_br.id = existing_bri.request_id
                  WHERE existing_bri.equipment_unit_id = eu.id
                    AND existing_bri.start_date <= p_end_date
                    AND existing_bri.end_date >= p_start_date
                    AND existing_br.status IN ('pending', 'approved', 'ready', 'borrowed')
              );
        ELSE
            SELECT COALESCE(SUM(bri.qty_borrowed), 0)
            INTO used_qty
            FROM public.borrow_request_items bri
            JOIN public.borrow_requests br ON br.id = bri.request_id
            WHERE bri.equipment_id = eq_id
              AND bri.start_date <= p_end_date
              AND bri.end_date >= p_start_date
              AND br.status IN ('pending', 'approved', 'ready', 'borrowed');

            available_qty := (locked_eq.total_quantity - locked_eq.maintenance_quantity) - used_qty;
        END IF;

        IF available_qty < req_qty THEN
            RAISE EXCEPTION 'Equipment does not have enough stock';
        END IF;

        IF v_inventory_mode = 'quantity_only' THEN
            INSERT INTO public.borrow_request_items (
                request_id,
                equipment_id,
                inventory_mode,
                start_date,
                end_date,
                qty_borrowed
            ) VALUES (
                new_request_id,
                eq_id,
                v_inventory_mode,
                p_start_date,
                p_end_date,
                req_qty
            );
        ELSIF v_inventory_mode = 'manikin' THEN
            FOR i IN 1..req_qty LOOP
                SELECT m.sap_id
                INTO selected_sap_id
                FROM public.manikins m
                WHERE m.team_code = locked_eq.source_team_code
                  AND m.status = 'ready'
                  AND m.is_active = true
                  AND COALESCE(m.needs_review, false) = false
                  AND m.deleted_at IS NULL
                  AND NOT EXISTS (
                      SELECT 1
                      FROM public.borrow_request_items existing_bri
                      JOIN public.borrow_requests existing_br ON existing_br.id = existing_bri.request_id
                      WHERE existing_bri.manikin_sap_id = m.sap_id
                        AND existing_bri.start_date <= p_end_date
                        AND existing_bri.end_date >= p_start_date
                        AND existing_br.status IN ('pending', 'approved', 'ready', 'borrowed')
                  )
                ORDER BY m.sap_id
                FOR UPDATE SKIP LOCKED
                LIMIT 1;

                IF selected_sap_id IS NULL THEN
                    RAISE EXCEPTION 'Equipment does not have enough assignable manikins';
                END IF;

                INSERT INTO public.borrow_request_items (
                    request_id,
                    equipment_id,
                    manikin_sap_id,
                    inventory_mode,
                    start_date,
                    end_date,
                    qty_borrowed
                ) VALUES (
                    new_request_id,
                    eq_id,
                    selected_sap_id,
                    v_inventory_mode,
                    p_start_date,
                    p_end_date,
                    1
                );

                selected_sap_id := NULL;
            END LOOP;
        ELSE
            FOR i IN 1..req_qty LOOP
                SELECT eu.id
                INTO selected_unit_id
                FROM public.equipment_units eu
                WHERE eu.equipment_id = eq_id
                  AND eu.status = 'ready'
                  AND eu.is_active = true
                  AND NOT EXISTS (
                      SELECT 1
                      FROM public.borrow_request_items existing_bri
                      JOIN public.borrow_requests existing_br ON existing_br.id = existing_bri.request_id
                      WHERE existing_bri.equipment_unit_id = eu.id
                        AND existing_bri.start_date <= p_end_date
                        AND existing_bri.end_date >= p_start_date
                        AND existing_br.status IN ('pending', 'approved', 'ready', 'borrowed')
                  )
                ORDER BY eu.requires_l1_approval ASC, eu.borrow_count ASC, eu.unit_code
                FOR UPDATE SKIP LOCKED
                LIMIT 1;

                IF selected_unit_id IS NULL THEN
                    RAISE EXCEPTION 'Equipment does not have enough assignable units';
                END IF;

                INSERT INTO public.borrow_request_items (
                    request_id,
                    equipment_id,
                    equipment_unit_id,
                    inventory_mode,
                    start_date,
                    end_date,
                    qty_borrowed,
                    requires_l1_approval,
                    return_blocking
                )
                SELECT
                    new_request_id,
                    eq_id,
                    eu.id,
                    v_inventory_mode,
                    p_start_date,
                    p_end_date,
                    1,
                    eu.requires_l1_approval,
                    true
                FROM public.equipment_units eu
                WHERE eu.id = selected_unit_id;

                selected_unit_id := NULL;
            END LOOP;
        END IF;
    END LOOP;

    RETURN new_tracking_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_borrow_request(text, text, text, date, date, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_borrow_request(text, text, text, date, date, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_borrow_request(text, text, text, date, date, jsonb) TO authenticated;

DROP FUNCTION IF EXISTS public.submit_public_borrow_request_v2(text, text, text, text, text, text, text, date, date, jsonb);

CREATE OR REPLACE FUNCTION public.submit_public_borrow_request_v2(
    p_borrower_name text,
    p_borrower_position text,
    p_department text,
    p_phone text,
    p_borrow_purpose_owner text,
    p_work_purpose text,
    p_usage_location text,
    p_start_date date,
    p_end_date date,
    p_items jsonb,
    p_borrower_email text DEFAULT NULL
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
    selected_sap_id text;
    selected_unit_id uuid;
    v_inventory_mode text;
    course_conflicts jsonb;
    normalized_phone text := regexp_replace(COALESCE(p_phone, ''), '[^0-9+]', '', 'g');
    normalized_email text := lower(NULLIF(trim(COALESCE(p_borrower_email, '')), ''));
    normalized_purpose text;
    i integer;
BEGIN
    IF length(trim(COALESCE(p_borrower_name, ''))) = 0 THEN
        RAISE EXCEPTION 'Borrower name is required';
    END IF;

    IF length(trim(COALESCE(p_department, ''))) = 0 THEN
        RAISE EXCEPTION 'Department is required';
    END IF;

    IF length(normalized_phone) < 9 THEN
        RAISE EXCEPTION 'Phone number is required';
    END IF;

    IF length(trim(COALESCE(p_borrow_purpose_owner, ''))) = 0 THEN
        RAISE EXCEPTION 'Borrow purpose owner is required';
    END IF;

    IF length(trim(COALESCE(p_work_purpose, ''))) = 0 THEN
        RAISE EXCEPTION 'Work purpose is required';
    END IF;

    IF length(trim(COALESCE(p_usage_location, ''))) = 0 THEN
        RAISE EXCEPTION 'Usage location is required';
    END IF;

    IF p_start_date IS NULL OR p_end_date IS NULL OR p_end_date < p_start_date THEN
        RAISE EXCEPTION 'Invalid borrow date range';
    END IF;

    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'At least one borrow item is required';
    END IF;

    new_tracking_id := public.generate_secure_tracking_id();
    normalized_purpose :=
        'ยืมพัสดุของ: ' || trim(p_borrow_purpose_owner) ||
        ' | เพื่อใช้ในงาน: ' || trim(p_work_purpose) ||
        ' | สถานที่ใช้งาน: ' || trim(p_usage_location) ||
        ' | Department: ' || trim(p_department) ||
        ' | Phone: ' || normalized_phone;

    INSERT INTO public.borrow_requests (
        tracking_id,
        borrower_id,
        borrower_name,
        borrower_email,
        borrower_position,
        borrower_phone,
        borrower_department,
        borrow_purpose_owner,
        work_purpose,
        usage_location,
        purpose,
        status,
        expires_at
    ) VALUES (
        new_tracking_id,
        NULL,
        trim(p_borrower_name),
        normalized_email,
        NULLIF(trim(COALESCE(p_borrower_position, '')), ''),
        normalized_phone,
        trim(p_department),
        trim(p_borrow_purpose_owner),
        trim(p_work_purpose),
        trim(p_usage_location),
        normalized_purpose,
        'pending',
        timezone('utc', now()) + interval '24 hours'
    )
    RETURNING id INTO new_request_id;

    PERFORM simset_private.enqueue_line_notification(
        'order_created',
        new_request_id,
        'staff',
        'New borrow order ' || new_tracking_id || ' from ' || trim(p_department),
        jsonb_build_object(
            'tracking_id', new_tracking_id,
            'department', trim(p_department),
            'borrower_name', trim(p_borrower_name),
            'phone', normalized_phone
        )
    );

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
          AND borrow_enabled = true
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Equipment not found';
        END IF;

        IF locked_eq.allocation_type = 'room_dedicated' THEN
            PERFORM simset_private.enqueue_line_notification(
                'room_dedicated_review',
                new_request_id,
                'staff_and_head',
                'Room-dedicated order ' || new_tracking_id || ' needs special review before approval.',
                jsonb_build_object(
                    'tracking_id', new_tracking_id,
                    'equipment_id', eq_id,
                    'required_notice_business_days', 7,
                    'start_date', p_start_date
                )
            );
        END IF;

        IF locked_eq.allocation_type = 'advance_course_dedicated' THEN
            course_conflicts := simset_private.advance_course_conflicts(eq_id, p_start_date, p_end_date);
            IF jsonb_array_length(course_conflicts) > 0 THEN
                RAISE EXCEPTION 'Advance course dedicated equipment is reserved by course: %', course_conflicts->0->>'course_name';
            END IF;
        END IF;

        v_inventory_mode := COALESCE(locked_eq.inventory_mode, CASE WHEN locked_eq.source_team_code IS NULL THEN 'quantity_only' ELSE 'manikin' END);

        IF v_inventory_mode IN ('tracked_unit', 'kit') THEN
            SELECT count(*)::integer
            INTO available_qty
            FROM public.equipment_units eu
            WHERE eu.equipment_id = eq_id
              AND eu.status = 'ready'
              AND eu.is_active = true
              AND NOT EXISTS (
                  SELECT 1
                  FROM public.borrow_request_items existing_bri
                  JOIN public.borrow_requests existing_br ON existing_br.id = existing_bri.request_id
                  WHERE existing_bri.equipment_unit_id = eu.id
                    AND existing_bri.start_date <= p_end_date
                    AND existing_bri.end_date >= p_start_date
                    AND existing_br.status IN ('pending', 'approved', 'ready', 'borrowed')
              );
        ELSE
            SELECT COALESCE(SUM(bri.qty_borrowed), 0)
            INTO used_qty
            FROM public.borrow_request_items bri
            JOIN public.borrow_requests br ON br.id = bri.request_id
            WHERE bri.equipment_id = eq_id
              AND bri.start_date <= p_end_date
              AND bri.end_date >= p_start_date
              AND br.status IN ('pending', 'approved', 'ready', 'borrowed');

            available_qty := (locked_eq.total_quantity - locked_eq.maintenance_quantity) - used_qty;
        END IF;

        IF available_qty < req_qty THEN
            RAISE EXCEPTION 'Equipment does not have enough stock';
        END IF;

        IF v_inventory_mode = 'quantity_only' THEN
            INSERT INTO public.borrow_request_items (
                request_id,
                equipment_id,
                inventory_mode,
                start_date,
                end_date,
                qty_borrowed
            ) VALUES (
                new_request_id,
                eq_id,
                v_inventory_mode,
                p_start_date,
                p_end_date,
                req_qty
            );
        ELSIF v_inventory_mode = 'manikin' THEN
            FOR i IN 1..req_qty LOOP
                SELECT m.sap_id
                INTO selected_sap_id
                FROM public.manikins m
                WHERE m.team_code = locked_eq.source_team_code
                  AND m.status = 'ready'
                  AND m.is_active = true
                  AND COALESCE(m.needs_review, false) = false
                  AND m.deleted_at IS NULL
                  AND NOT EXISTS (
                      SELECT 1
                      FROM public.borrow_request_items existing_bri
                      JOIN public.borrow_requests existing_br ON existing_br.id = existing_bri.request_id
                      WHERE existing_bri.manikin_sap_id = m.sap_id
                        AND existing_bri.start_date <= p_end_date
                        AND existing_bri.end_date >= p_start_date
                        AND existing_br.status IN ('pending', 'approved', 'ready', 'borrowed')
                  )
                ORDER BY m.sap_id
                FOR UPDATE SKIP LOCKED
                LIMIT 1;

                IF selected_sap_id IS NULL THEN
                    RAISE EXCEPTION 'Equipment does not have enough assignable manikins';
                END IF;

                INSERT INTO public.borrow_request_items (
                    request_id,
                    equipment_id,
                    manikin_sap_id,
                    inventory_mode,
                    start_date,
                    end_date,
                    qty_borrowed
                ) VALUES (
                    new_request_id,
                    eq_id,
                    selected_sap_id,
                    v_inventory_mode,
                    p_start_date,
                    p_end_date,
                    1
                );

                selected_sap_id := NULL;
            END LOOP;
        ELSE
            FOR i IN 1..req_qty LOOP
                SELECT eu.id
                INTO selected_unit_id
                FROM public.equipment_units eu
                WHERE eu.equipment_id = eq_id
                  AND eu.status = 'ready'
                  AND eu.is_active = true
                  AND NOT EXISTS (
                      SELECT 1
                      FROM public.borrow_request_items existing_bri
                      JOIN public.borrow_requests existing_br ON existing_br.id = existing_bri.request_id
                      WHERE existing_bri.equipment_unit_id = eu.id
                        AND existing_bri.start_date <= p_end_date
                        AND existing_bri.end_date >= p_start_date
                        AND existing_br.status IN ('pending', 'approved', 'ready', 'borrowed')
                  )
                ORDER BY eu.requires_l1_approval ASC, eu.borrow_count ASC, eu.unit_code
                FOR UPDATE SKIP LOCKED
                LIMIT 1;

                IF selected_unit_id IS NULL THEN
                    RAISE EXCEPTION 'Equipment does not have enough assignable units';
                END IF;

                INSERT INTO public.borrow_request_items (
                    request_id,
                    equipment_id,
                    equipment_unit_id,
                    inventory_mode,
                    start_date,
                    end_date,
                    qty_borrowed,
                    requires_l1_approval,
                    return_blocking
                )
                SELECT
                    new_request_id,
                    eq_id,
                    eu.id,
                    v_inventory_mode,
                    p_start_date,
                    p_end_date,
                    1,
                    eu.requires_l1_approval,
                    true
                FROM public.equipment_units eu
                WHERE eu.id = selected_unit_id;

                selected_unit_id := NULL;
            END LOOP;
        END IF;
    END LOOP;

    RETURN new_tracking_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_public_borrow_request_v2(text, text, text, text, text, text, text, date, date, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_public_borrow_request_v2(text, text, text, text, text, text, text, date, date, jsonb, text) TO anon, authenticated;

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
                    'item_id', bri.id,
                    'equipment_id', e.id,
                    'equipment_name', e.name_th,
                    'allocation_type', e.allocation_type,
                    'manikin_sap_id', bri.manikin_sap_id,
                    'start_date', bri.start_date,
                    'end_date', bri.end_date,
                    'qty_borrowed', bri.qty_borrowed
                ) ORDER BY e.name_th, bri.manikin_sap_id), '[]'::jsonb)
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

CREATE OR REPLACE FUNCTION public.claim_borrow_request_identity(p_tracking_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_request public.borrow_requests%ROWTYPE;
    v_email text := lower(NULLIF(trim(COALESCE(auth.jwt() ->> 'email', '')), ''));
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF v_email IS NULL THEN
        RAISE EXCEPTION 'authenticated email is required';
    END IF;

    SELECT *
    INTO v_request
    FROM public.borrow_requests
    WHERE tracking_id = trim(p_tracking_id)
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    IF lower(COALESCE(v_request.borrower_email, '')) IS DISTINCT FROM v_email THEN
        RAISE EXCEPTION 'Forbidden: borrower email does not match authenticated user';
    END IF;

    INSERT INTO public.identity_claim (
        request_id,
        claimant_user_id,
        claimant_email,
        claim_method
    ) VALUES (
        v_request.id,
        auth.uid(),
        v_email,
        'email_match'
    )
    ON CONFLICT (request_id, claimant_user_id) DO NOTHING;

    UPDATE public.borrow_requests
    SET
        borrower_id = COALESCE(borrower_id, auth.uid()),
        updated_at = timezone('utc', now())
    WHERE id = v_request.id
      AND borrower_id IS NULL;

    RETURN jsonb_build_object(
        'request_id', v_request.id,
        'tracking_id', v_request.tracking_id,
        'claimed', true
    );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_borrow_request_identity(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_borrow_request_identity(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.claim_borrow_request_identity(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_borrow_request_status(p_tracking_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    result jsonb;
BEGIN
    SELECT jsonb_build_object(
        'tracking_id', br.tracking_id,
        'status', br.status,
        'created_at', br.created_at,
        'borrower_name', br.borrower_name,
        'borrower_position', br.borrower_position,
        'borrower_phone', br.borrower_phone,
        'borrower_department', br.borrower_department,
        'borrow_purpose_owner', br.borrow_purpose_owner,
        'work_purpose', br.work_purpose,
        'usage_location', br.usage_location,
        'purpose', br.purpose,
        'items', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'item_id', bri.id,
                'equipment_id', e.id,
                'equipment_name', e.name_th,
                'unit_code', eu.unit_code,
                'asset_code', eu.asset_code,
                'allocation_type', e.allocation_type,
                'manikin_sap_id', bri.manikin_sap_id,
                'start_date', bri.start_date,
                'end_date', bri.end_date,
                'qty_borrowed', bri.qty_borrowed
            ) ORDER BY e.name_th, COALESCE(bri.manikin_sap_id, eu.unit_code)), '[]'::jsonb)
            FROM public.borrow_request_items bri
            JOIN public.equipments e ON e.id = bri.equipment_id
            LEFT JOIN public.equipment_units eu ON eu.id = bri.equipment_unit_id
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

CREATE OR REPLACE FUNCTION public.get_borrow_availability(
    p_start_date date,
    p_end_date date,
    p_equipment_ids jsonb DEFAULT NULL
)
RETURNS TABLE (
    equipment_id uuid,
    total_qty integer,
    maintenance_qty integer,
    used_qty integer,
    available_qty integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF p_start_date IS NULL OR p_end_date IS NULL THEN
        RAISE EXCEPTION 'Start date and end date are required';
    END IF;

    IF p_end_date < p_start_date THEN
        RAISE EXCEPTION 'End date cannot be before start date';
    END IF;

    RETURN QUERY
    WITH requested_ids AS (
        SELECT value::uuid AS requested_equipment_id
        FROM jsonb_array_elements_text(COALESCE(p_equipment_ids, '[]'::jsonb))
    ),
    base AS (
        SELECT
            e.id AS base_equipment_id,
            e.total_quantity,
            e.maintenance_quantity
        FROM public.equipments e
        WHERE e.borrow_enabled = true
          AND (
              p_equipment_ids IS NULL
              OR e.id IN (SELECT r.requested_equipment_id FROM requested_ids r)
          )
    ),
    used AS (
        SELECT
            bri.equipment_id AS used_equipment_id,
            COALESCE(SUM(bri.qty_borrowed), 0)::integer AS used_qty
        FROM public.borrow_request_items bri
        JOIN public.borrow_requests br ON br.id = bri.request_id
        WHERE bri.start_date <= p_end_date
          AND bri.end_date >= p_start_date
          AND br.status IN ('pending', 'approved', 'ready', 'borrowed')
          AND (
              p_equipment_ids IS NULL
              OR bri.equipment_id IN (SELECT r.requested_equipment_id FROM requested_ids r)
          )
        GROUP BY bri.equipment_id
    )
    SELECT
        b.base_equipment_id AS equipment_id,
        b.total_quantity::integer AS total_qty,
        b.maintenance_quantity::integer AS maintenance_qty,
        COALESCE(u.used_qty, 0)::integer AS used_qty,
        GREATEST((b.total_quantity - b.maintenance_quantity) - COALESCE(u.used_qty, 0), 0)::integer AS available_qty
    FROM base b
    LEFT JOIN used u ON u.used_equipment_id = b.base_equipment_id
    ORDER BY b.base_equipment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_borrow_availability(date, date, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_borrow_availability(date, date, jsonb) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_equipment_borrow_rules(
    p_equipment_ids jsonb,
    p_start_date date,
    p_end_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    result jsonb;
BEGIN
    IF p_start_date IS NULL OR p_end_date IS NULL OR p_end_date < p_start_date THEN
        RAISE EXCEPTION 'Invalid borrow date range';
    END IF;

    WITH requested AS (
        SELECT value::uuid AS equipment_id
        FROM jsonb_array_elements_text(COALESCE(p_equipment_ids, '[]'::jsonb))
    ),
    rules AS (
        SELECT
            e.id,
            e.name_th,
            e.allocation_type,
            simset_private.business_days_between(current_date, p_start_date) AS notice_business_days,
            simset_private.advance_course_conflicts(e.id, p_start_date, p_end_date) AS course_conflicts
        FROM public.equipments e
        JOIN requested r ON r.equipment_id = e.id
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'equipment_id', id,
        'equipment_name', name_th,
        'allocation_type', allocation_type,
        'blocked', allocation_type = 'advance_course_dedicated' AND jsonb_array_length(course_conflicts) > 0,
        'warning', CASE
            WHEN allocation_type = 'room_dedicated' AND notice_business_days < 7
                THEN 'ต้องแจ้งล่วงหน้าอย่างน้อย 7 วันทำการ และหัวหน้าศูนย์ต้องพิจารณาเป็นพิเศษ'
            WHEN allocation_type = 'room_dedicated'
                THEN 'หุ่นประจำห้อง ต้องให้หัวหน้าศูนย์พิจารณาเป็นพิเศษก่อนอนุมัติ'
            WHEN allocation_type = 'advance_course_dedicated' AND jsonb_array_length(course_conflicts) > 0
                THEN 'หุ่น Advance ถูกจองโดยคอร์สในวันที่เลือก'
            WHEN allocation_type = 'advance_course_dedicated'
                THEN 'หุ่น Advance ประจำคอร์ส ออกนอกศูนย์ได้จำกัด'
            ELSE NULL
        END,
        'notice_business_days', notice_business_days,
        'course_conflicts', course_conflicts
    ) ORDER BY name_th), '[]'::jsonb)
    INTO result
    FROM rules;

    RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_equipment_borrow_rules(jsonb, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_equipment_borrow_rules(jsonb, date, date) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.staff_assign_manikin_to_item(
    p_item_id uuid,
    p_manikin_sap_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_item record;
    v_manikin record;
    v_conflicts jsonb;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF (auth.jwt() -> 'app_metadata' ->> 'role') NOT IN ('admin', 'staff') THEN
        RAISE EXCEPTION 'unauthorized: staff role required';
    END IF;

    SELECT bri.*, br.status AS request_status, e.source_team_code, e.allocation_type
    INTO v_item
    FROM public.borrow_request_items bri
    JOIN public.borrow_requests br ON br.id = bri.request_id
    JOIN public.equipments e ON e.id = bri.equipment_id
    WHERE bri.id = p_item_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Borrow item not found';
    END IF;

    IF v_item.request_status NOT IN ('approved', 'ready') THEN
        RAISE EXCEPTION 'Manikin can only be assigned before pickup';
    END IF;

    SELECT *
    INTO v_manikin
    FROM public.manikins
    WHERE sap_id = p_manikin_sap_id
      AND is_active = true
      AND COALESCE(needs_review, false) = false
      AND deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Manikin not found or unavailable';
    END IF;

    IF v_item.source_team_code IS NOT NULL AND v_manikin.team_code IS DISTINCT FROM v_item.source_team_code THEN
        RAISE EXCEPTION 'Manikin is not in the requested equipment team';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.borrow_request_items bri
        JOIN public.borrow_requests br ON br.id = bri.request_id
        WHERE bri.id <> p_item_id
          AND bri.manikin_sap_id = p_manikin_sap_id
          AND bri.start_date <= v_item.end_date
          AND bri.end_date >= v_item.start_date
          AND br.status IN ('pending', 'approved', 'ready', 'borrowed', 'overdue')
    ) THEN
        RAISE EXCEPTION 'Manikin is already assigned in this date range';
    END IF;

    IF v_item.allocation_type = 'advance_course_dedicated' THEN
        v_conflicts := simset_private.advance_course_conflicts(v_item.equipment_id, v_item.start_date, v_item.end_date, p_manikin_sap_id);
        IF jsonb_array_length(v_conflicts) > 0 THEN
            RAISE EXCEPTION 'Selected manikin is reserved by course: %', v_conflicts->0->>'course_name';
        END IF;
    END IF;

    UPDATE public.borrow_request_items
    SET manikin_sap_id = p_manikin_sap_id,
        qty_borrowed = 1
    WHERE id = p_item_id;

    RETURN jsonb_build_object(
        'item_id', p_item_id,
        'manikin_sap_id', p_manikin_sap_id,
        'status', 'assigned'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.staff_assign_manikin_to_item(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_assign_manikin_to_item(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.staff_assign_manikin_to_item(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.staff_assign_inventory_unit_to_item(
    p_item_id uuid,
    p_equipment_unit_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_item record;
    v_unit record;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF (auth.jwt() -> 'app_metadata' ->> 'role') NOT IN ('admin', 'staff') THEN
        RAISE EXCEPTION 'unauthorized: staff role required';
    END IF;

    SELECT bri.*, br.status AS request_status, e.inventory_mode
    INTO v_item
    FROM public.borrow_request_items bri
    JOIN public.borrow_requests br ON br.id = bri.request_id
    JOIN public.equipments e ON e.id = bri.equipment_id
    WHERE bri.id = p_item_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Borrow item not found';
    END IF;

    IF v_item.request_status NOT IN ('approved', 'ready') THEN
        RAISE EXCEPTION 'Inventory unit can only be assigned before pickup';
    END IF;

    SELECT *
    INTO v_unit
    FROM public.equipment_units
    WHERE id = p_equipment_unit_id
      AND equipment_id = v_item.equipment_id
      AND status = 'ready'
      AND is_active = true
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Inventory unit not found or unavailable';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.borrow_request_items bri
        JOIN public.borrow_requests br ON br.id = bri.request_id
        WHERE bri.id <> p_item_id
          AND bri.equipment_unit_id = p_equipment_unit_id
          AND bri.start_date <= v_item.end_date
          AND bri.end_date >= v_item.start_date
          AND br.status IN ('pending', 'approved', 'ready', 'borrowed', 'overdue')
    ) THEN
        RAISE EXCEPTION 'Inventory unit is already assigned in this date range';
    END IF;

    UPDATE public.borrow_request_items
    SET equipment_unit_id = p_equipment_unit_id,
        inventory_mode = CASE
            WHEN v_item.inventory_mode IN ('tracked_unit', 'kit') THEN v_item.inventory_mode
            ELSE 'tracked_unit'
        END,
        qty_borrowed = 1,
        requires_l1_approval = v_unit.requires_l1_approval,
        return_blocking = true
    WHERE id = p_item_id;

    RETURN jsonb_build_object(
        'item_id', p_item_id,
        'equipment_unit_id', p_equipment_unit_id,
        'unit_code', v_unit.unit_code,
        'requires_l1_approval', v_unit.requires_l1_approval,
        'status', 'assigned'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.staff_assign_inventory_unit_to_item(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_assign_inventory_unit_to_item(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.staff_assign_inventory_unit_to_item(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_rotation_suggestions(
    p_equipment_id uuid,
    p_selected_manikin_sap_id text DEFAULT NULL
)
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

    IF (auth.jwt() -> 'app_metadata' ->> 'role') NOT IN ('admin', 'staff', 'approver_l1') THEN
        RAISE EXCEPTION 'unauthorized: staff role required';
    END IF;

    WITH pool AS (
        SELECT m.sap_id
        FROM public.equipments e
        JOIN public.manikins m ON m.team_code = e.source_team_code
        WHERE e.id = p_equipment_id
          AND m.is_active = true
          AND COALESCE(m.needs_review, false) = false
          AND m.deleted_at IS NULL
    ),
    usage AS (
        SELECT
            p.sap_id,
            COALESCE(count(bri.id), 0)::integer AS borrow_count
        FROM pool p
        LEFT JOIN public.borrow_request_items bri ON bri.manikin_sap_id = p.sap_id
        GROUP BY p.sap_id
    ),
    selected AS (
        SELECT borrow_count
        FROM usage
        WHERE sap_id = p_selected_manikin_sap_id
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'manikin_sap_id', u.sap_id,
        'borrow_count', u.borrow_count,
        'message', 'หุ่นตัวนี้ถูกยืมบ่อยกว่าตัวอื่น พิจารณาใช้ ' || u.sap_id || ' แทนไหม'
    ) ORDER BY u.borrow_count ASC, u.sap_id) FILTER (
        WHERE p_selected_manikin_sap_id IS NOT NULL
          AND u.sap_id <> p_selected_manikin_sap_id
          AND u.borrow_count < COALESCE((SELECT borrow_count FROM selected), 2147483647)
    ), '[]'::jsonb)
    INTO result
    FROM usage u;

    RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_rotation_suggestions(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_rotation_suggestions(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_rotation_suggestions(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.approver_l1_decide_request(
    p_request_id uuid,
    p_decision text,
    p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, simset_private, pg_temp
AS $$
DECLARE
    v_decision text := lower(trim(COALESCE(p_decision, '')));
    v_next_status text;
    v_result jsonb;
    v_tracking_id text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF (auth.jwt() -> 'app_metadata' ->> 'role') NOT IN ('approver_l1', 'admin') THEN
        RAISE EXCEPTION 'unauthorized: approver_l1 role required';
    END IF;

    IF v_decision = 'approve' THEN
        v_next_status := 'approved';
    ELSIF v_decision = 'reject' THEN
        v_next_status := 'rejected';
        IF NULLIF(trim(COALESCE(p_reason, '')), '') IS NULL THEN
            RAISE EXCEPTION 'reject reason is required';
        END IF;
    ELSE
        RAISE EXCEPTION 'decision must be approve or reject';
    END IF;

    v_result := simset_private.apply_borrow_request_status_transition(
        p_request_id,
        'pending',
        v_next_status,
        auth.uid(),
        'approver_l1',
        p_reason
    );

    IF v_result IS NULL THEN
        RETURN NULL;
    END IF;

    UPDATE public.borrow_requests
    SET approved_by = CASE WHEN v_next_status = 'approved' THEN auth.uid() ELSE approved_by END,
        approved_at = CASE WHEN v_next_status = 'approved' THEN timezone('utc', now()) ELSE approved_at END
    WHERE id = p_request_id
    RETURNING tracking_id INTO v_tracking_id;

    IF v_next_status = 'approved' THEN
        PERFORM simset_private.enqueue_line_notification(
            'l1_approved',
            p_request_id,
            'staff',
            'L1 approved order ' || COALESCE(v_tracking_id, p_request_id::text) || '. Prepare equipment.',
            jsonb_build_object('tracking_id', v_tracking_id)
        );
    END IF;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.approver_l1_decide_request(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approver_l1_decide_request(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.approver_l1_decide_request(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_l1_approval_queue()
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

    IF (auth.jwt() -> 'app_metadata' ->> 'role') NOT IN ('approver_l1', 'admin') THEN
        RAISE EXCEPTION 'unauthorized: approver_l1 role required';
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', br.id,
        'tracking_id', br.tracking_id,
        'borrower_name', br.borrower_name,
        'department', simset_private.department_from_purpose(br.purpose),
        'purpose', br.purpose,
        'created_at', br.created_at,
        'items', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'item_id', bri.id,
                'equipment_id', e.id,
                'equipment_name', e.name_th,
                'allocation_type', e.allocation_type,
                'manikin_sap_id', bri.manikin_sap_id,
                'start_date', bri.start_date,
                'end_date', bri.end_date,
                'qty_borrowed', bri.qty_borrowed
            ) ORDER BY e.name_th, bri.manikin_sap_id), '[]'::jsonb)
            FROM public.borrow_request_items bri
            JOIN public.equipments e ON e.id = bri.equipment_id
            WHERE bri.request_id = br.id
        )
    ) ORDER BY br.created_at ASC), '[]'::jsonb)
    INTO result
    FROM public.borrow_requests br
    WHERE br.status = 'pending';

    RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_l1_approval_queue() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_l1_approval_queue() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_l1_approval_queue() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_staff_dashboard_orders()
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

    IF (auth.jwt() -> 'app_metadata' ->> 'role') NOT IN ('admin', 'staff', 'approver_l1') THEN
        RAISE EXCEPTION 'unauthorized: staff role required';
    END IF;

    SELECT jsonb_build_object(
        'to_prepare', COALESCE(jsonb_agg(
            jsonb_build_object(
                'id', br.id,
                'tracking_id', br.tracking_id,
                'borrower_name', br.borrower_name,
                'department', simset_private.department_from_purpose(br.purpose),
                'status', br.status,
                'return_date', (
                    SELECT max(bri.end_date)
                    FROM public.borrow_request_items bri
                    WHERE bri.request_id = br.id
                ),
                'items', (
                    SELECT COALESCE(jsonb_agg(jsonb_build_object(
                        'item_id', bri.id,
                        'equipment_id', e.id,
                        'equipment_name', e.name_th,
                        'allocation_type', e.allocation_type,
                        'manikin_sap_id', bri.manikin_sap_id,
                        'equipment_unit_id', bri.equipment_unit_id,
                        'unit_code', eu.unit_code,
                        'inventory_mode', bri.inventory_mode,
                        'requires_l1_approval', bri.requires_l1_approval,
                        'qty_borrowed', bri.qty_borrowed
                    ) ORDER BY e.name_th, COALESCE(bri.manikin_sap_id, eu.unit_code)), '[]'::jsonb)
                    FROM public.borrow_request_items bri
                    JOIN public.equipments e ON e.id = bri.equipment_id
                    LEFT JOIN public.equipment_units eu ON eu.id = bri.equipment_unit_id
                    WHERE bri.request_id = br.id
                )
            )
        ) FILTER (WHERE br.status = 'approved'), '[]'::jsonb),
        'checked_out', COALESCE(jsonb_agg(
            jsonb_build_object(
                'id', br.id,
                'tracking_id', br.tracking_id,
                'borrower_name', br.borrower_name,
                'department', simset_private.department_from_purpose(br.purpose),
                'status', br.status,
                'return_date', (
                    SELECT max(bri.end_date)
                    FROM public.borrow_request_items bri
                    WHERE bri.request_id = br.id
                ),
                'items', (
                    SELECT COALESCE(jsonb_agg(jsonb_build_object(
                        'item_id', bri.id,
                        'equipment_id', e.id,
                        'equipment_name', e.name_th,
                        'allocation_type', e.allocation_type,
                        'manikin_sap_id', bri.manikin_sap_id,
                        'equipment_unit_id', bri.equipment_unit_id,
                        'unit_code', eu.unit_code,
                        'inventory_mode', bri.inventory_mode,
                        'requires_l1_approval', bri.requires_l1_approval,
                        'qty_borrowed', bri.qty_borrowed
                    ) ORDER BY e.name_th, COALESCE(bri.manikin_sap_id, eu.unit_code)), '[]'::jsonb)
                    FROM public.borrow_request_items bri
                    JOIN public.equipments e ON e.id = bri.equipment_id
                    LEFT JOIN public.equipment_units eu ON eu.id = bri.equipment_unit_id
                    WHERE bri.request_id = br.id
                )
            )
        ) FILTER (WHERE br.status IN ('borrowed', 'overdue')), '[]'::jsonb),
        'returned_today', COALESCE(jsonb_agg(
            jsonb_build_object(
                'id', br.id,
                'tracking_id', br.tracking_id,
                'borrower_name', br.borrower_name,
                'department', simset_private.department_from_purpose(br.purpose),
                'status', br.status,
                'returned_at', br.returned_at,
                'items', (
                    SELECT COALESCE(jsonb_agg(jsonb_build_object(
                        'item_id', bri.id,
                        'equipment_id', e.id,
                        'equipment_name', e.name_th,
                        'allocation_type', e.allocation_type,
                        'manikin_sap_id', bri.manikin_sap_id,
                        'equipment_unit_id', bri.equipment_unit_id,
                        'unit_code', eu.unit_code,
                        'inventory_mode', bri.inventory_mode,
                        'requires_l1_approval', bri.requires_l1_approval,
                        'qty_borrowed', bri.qty_borrowed
                    ) ORDER BY e.name_th, COALESCE(bri.manikin_sap_id, eu.unit_code)), '[]'::jsonb)
                    FROM public.borrow_request_items bri
                    JOIN public.equipments e ON e.id = bri.equipment_id
                    LEFT JOIN public.equipment_units eu ON eu.id = bri.equipment_unit_id
                    WHERE bri.request_id = br.id
                )
            )
        ) FILTER (
            WHERE br.status IN ('returned', 'inspection', 'completed', 'damaged', 'lost')
              AND br.returned_at >= timezone('utc', now()) - interval '24 hours'
        ), '[]'::jsonb),
        'alerts', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'id', sa.id,
                'alert_type', sa.alert_type,
                'message', sa.message,
                'created_at', sa.created_at
            ) ORDER BY sa.created_at DESC), '[]'::jsonb)
            FROM public.staff_alerts sa
            WHERE sa.acknowledged_at IS NULL
        )
    )
    INTO result
    FROM public.borrow_requests br
    WHERE br.status IN ('approved', 'borrowed', 'overdue', 'returned', 'inspection', 'completed', 'damaged', 'lost');

    RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_staff_dashboard_orders() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_staff_dashboard_orders() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_staff_dashboard_orders() TO authenticated;

CREATE OR REPLACE FUNCTION simset_private.insert_condition_snapshot(
    p_request_id uuid,
    p_snapshot_type text,
    p_condition_status text,
    p_note text,
    p_image_urls text[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_snapshot_id uuid;
BEGIN
    IF NULLIF(trim(COALESCE(p_note, '')), '') IS NULL THEN
        RAISE EXCEPTION 'condition note is required';
    END IF;

    IF p_image_urls IS NULL OR array_length(p_image_urls, 1) IS NULL OR array_length(p_image_urls, 1) < 1 THEN
        RAISE EXCEPTION 'at least one condition image is required';
    END IF;

    INSERT INTO public.condition_snapshots (
        request_id,
        snapshot_type,
        condition_status,
        note,
        image_urls,
        created_by
    ) VALUES (
        p_request_id,
        p_snapshot_type,
        p_condition_status,
        trim(p_note),
        p_image_urls,
        auth.uid()
    )
    RETURNING id INTO v_snapshot_id;

    RETURN v_snapshot_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_pickup_with_snapshot(
    p_request_id uuid,
    p_condition_status text,
    p_note text,
    p_image_urls text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, simset_private, pg_temp
AS $$
DECLARE
    v_result jsonb;
    v_actor_type text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF (auth.jwt() -> 'app_metadata' ->> 'role') NOT IN ('admin', 'staff') THEN
        RAISE EXCEPTION 'unauthorized: staff role required';
    END IF;

    v_actor_type := CASE
        WHEN (auth.jwt() -> 'app_metadata' ->> 'role') = 'staff' THEN 'staff'
        ELSE 'admin'
    END;

    PERFORM simset_private.insert_condition_snapshot(
        p_request_id,
        'pre_checkout',
        p_condition_status,
        p_note,
        p_image_urls
    );

    v_result := simset_private.apply_borrow_request_status_transition(
        p_request_id,
        'approved',
        'borrowed',
        auth.uid(),
        v_actor_type,
        'Confirmed pickup with pre-checkout condition snapshot'
    );

    UPDATE public.borrow_requests
    SET checked_out_at = timezone('utc', now())
    WHERE id = p_request_id
      AND v_result IS NOT NULL;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_pickup_with_snapshot(uuid, text, text, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_pickup_with_snapshot(uuid, text, text, text[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.confirm_pickup_with_snapshot(uuid, text, text, text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.confirm_return_with_snapshot(
    p_request_id uuid,
    p_condition_status text,
    p_note text,
    p_image_urls text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, simset_private, pg_temp
AS $$
DECLARE
    v_result jsonb;
    v_tracking_id text;
    v_snapshot_id uuid;
    v_actor_type text;
    v_final_status text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF (auth.jwt() -> 'app_metadata' ->> 'role') NOT IN ('admin', 'staff') THEN
        RAISE EXCEPTION 'unauthorized: staff role required';
    END IF;

    v_actor_type := CASE
        WHEN (auth.jwt() -> 'app_metadata' ->> 'role') = 'staff' THEN 'staff'
        ELSE 'admin'
    END;

    v_final_status := CASE
        WHEN p_condition_status = 'normal' THEN 'completed'
        WHEN p_condition_status IN ('damaged', 'maintenance') THEN 'damaged'
        WHEN p_condition_status = 'missing' THEN 'lost'
        ELSE 'damaged'
    END;

    v_snapshot_id := simset_private.insert_condition_snapshot(
        p_request_id,
        'post_return',
        p_condition_status,
        p_note,
        p_image_urls
    );

    SELECT tracking_id INTO v_tracking_id
    FROM public.borrow_requests
    WHERE id = p_request_id;

    v_result := simset_private.apply_borrow_request_status_transition(
        p_request_id,
        NULL,
        'returned',
        auth.uid(),
        v_actor_type,
        'Confirmed return with post-return condition snapshot'
    );

    IF v_result IS NULL THEN
        RETURN NULL;
    END IF;

    PERFORM simset_private.apply_borrow_request_status_transition(
        p_request_id,
        'returned',
        'inspection',
        auth.uid(),
        v_actor_type,
        'Return moved to inspection'
    );

    v_result := simset_private.apply_borrow_request_status_transition(
        p_request_id,
        'inspection',
        v_final_status,
        auth.uid(),
        v_actor_type,
        trim(p_note)
    );

    IF p_condition_status <> 'normal' THEN
        INSERT INTO public.kit_refill_tasks (
            request_id,
            borrow_request_item_id,
            equipment_unit_id,
            condition_snapshot_id,
            note,
            created_by
        )
        SELECT
            bri.request_id,
            bri.id,
            bri.equipment_unit_id,
            v_snapshot_id,
            trim(p_note),
            auth.uid()
        FROM public.borrow_request_items bri
        WHERE bri.request_id = p_request_id
          AND bri.inventory_mode = 'kit'
          AND bri.equipment_unit_id IS NOT NULL;

        INSERT INTO public.staff_alerts (
            alert_type,
            request_id,
            message,
            payload
        ) VALUES (
            'return_abnormal',
            p_request_id,
            'Abnormal return condition for order ' || COALESCE(v_tracking_id, p_request_id::text),
            jsonb_build_object('tracking_id', v_tracking_id, 'condition_status', p_condition_status)
        );
    END IF;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_return_with_snapshot(uuid, text, text, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_return_with_snapshot(uuid, text, text, text[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.confirm_return_with_snapshot(uuid, text, text, text[]) TO authenticated;

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
        SELECT id
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

SELECT cron.schedule(
    'simset-expire-pending-borrow-requests',
    '*/5 * * * *',
    $$SELECT public.expire_pending_borrow_requests('00000000-0000-0000-0000-000000000001'::uuid);$$
)
WHERE NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'simset-expire-pending-borrow-requests'
);

CREATE OR REPLACE FUNCTION public.mark_overdue_borrow_requests()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, simset_private, pg_temp
AS $$
DECLARE
    v_request record;
    v_count integer := 0;
BEGIN
    FOR v_request IN
        SELECT br.id, br.tracking_id, br.status
        FROM public.borrow_requests br
        WHERE br.status = 'borrowed'
          AND EXISTS (
              SELECT 1
              FROM public.borrow_request_items bri
              WHERE bri.request_id = br.id
                AND bri.end_date < current_date
          )
        FOR UPDATE SKIP LOCKED
    LOOP
        PERFORM simset_private.apply_borrow_request_status_transition(
            v_request.id,
            'borrowed',
            'overdue',
            '00000000-0000-0000-0000-000000000001'::uuid,
            'system',
            'Marked overdue by daily 08:00 job'
        );

        PERFORM simset_private.enqueue_line_notification(
            'overdue',
            v_request.id,
            'staff_and_head',
            'OVERDUE order ' || v_request.tracking_id || ' is past return date',
            jsonb_build_object('tracking_id', v_request.tracking_id)
        );

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_overdue_borrow_requests() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_overdue_borrow_requests() FROM anon;
REVOKE ALL ON FUNCTION public.mark_overdue_borrow_requests() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.mark_overdue_borrow_requests() TO postgres, service_role;

SELECT cron.schedule(
    'simset-mark-overdue-borrow-requests-0800',
    '0 8 * * *',
    $$SELECT public.mark_overdue_borrow_requests();$$
)
WHERE NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'simset-mark-overdue-borrow-requests-0800'
);

CREATE OR REPLACE FUNCTION public.get_kpi_report()
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

    IF (auth.jwt() -> 'app_metadata' ->> 'role') NOT IN ('admin', 'approver_l1') THEN
        RAISE EXCEPTION 'unauthorized: report role required';
    END IF;

    SELECT jsonb_build_object(
        'pending_approval_count', (
            SELECT count(*) FROM public.borrow_requests WHERE status = 'pending'
        ),
        'overdue_count', (
            SELECT count(*) FROM public.borrow_requests WHERE status = 'overdue'
        ),
        'on_time_return_rate', (
            SELECT COALESCE(round(
                100.0 * count(*) FILTER (
                    WHERE br.returned_at::date <= due_dates.due_date
                ) / NULLIF(count(*), 0),
                1
            ), 0)
            FROM public.borrow_requests br
            JOIN (
                SELECT request_id, max(end_date) AS due_date
                FROM public.borrow_request_items
                GROUP BY request_id
            ) due_dates ON due_dates.request_id = br.id
            WHERE br.status IN ('returned', 'completed', 'damaged', 'lost')
        ),
        'ready_manikin_count', (
            SELECT count(*)
            FROM public.manikins
            WHERE status = 'ready'
              AND is_active = true
              AND COALESCE(needs_review, false) = false
              AND deleted_at IS NULL
        ),
        'orders_by_month', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'month', month_key,
                'order_count', order_count
            ) ORDER BY month_key), '[]'::jsonb)
            FROM (
                SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month_key,
                       count(*) AS order_count
                FROM public.borrow_requests
                GROUP BY 1
                ORDER BY 1
            ) monthly
        ),
        'top_departments', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'department', department,
                'order_count', order_count
            ) ORDER BY order_count DESC, department), '[]'::jsonb)
            FROM (
                SELECT simset_private.department_from_purpose(purpose) AS department,
                       count(*) AS order_count
                FROM public.borrow_requests
                GROUP BY 1
                ORDER BY 2 DESC, 1
                LIMIT 5
            ) departments
        )
    )
    INTO result;

    RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_kpi_report() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_kpi_report() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_kpi_report() TO authenticated;

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
SET search_path = public, pg_temp
AS $$
BEGIN
    RAISE EXCEPTION 'submit_public_borrow_request is deprecated; use authenticated submit_borrow_request';
END;
$$;

COMMENT ON FUNCTION public.submit_public_borrow_request(text, text, text, date, date, jsonb)
IS 'DEPRECATED after Phase 2: frontend must use authenticated submit_borrow_request so borrower_id = auth.uid() and line items can link to exact manikins.';

REVOKE ALL ON FUNCTION public.submit_public_borrow_request(text, text, text, date, date, jsonb) FROM PUBLIC;

COMMIT;

-- ----------------------------------------------------------------
-- Verification queries:
-- SELECT proname, prosecdef, proacl
-- FROM pg_proc
-- WHERE proname IN (
--   'submit_borrow_request',
--   'get_my_borrow_requests',
--   'transition_borrow_request_status',
--   'get_borrow_request_status',
--   'get_borrow_availability'
-- )
-- ORDER BY proname;
--
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name = 'borrow_request_items'
--   AND column_name = 'manikin_sap_id';
--
-- SELECT tgname
-- FROM pg_trigger
-- WHERE tgname IN (
--   'trg_enforce_borrow_status_transition',
--   'trg_sync_manikin_status_from_borrow_request'
-- );
