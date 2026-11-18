-- STEP 3: Lock Status Flow.
-- Run this in Supabase SQL Editor after confirming existing rows can be normalized.

UPDATE public.borrow_requests
SET status = CASE status
    WHEN 'cancelled' THEN 'rejected'
    WHEN 'expired' THEN 'rejected'
    WHEN 'returned_pending_inspection' THEN 'returned'
    ELSE status
END
WHERE status IN ('cancelled', 'expired', 'returned_pending_inspection');

ALTER TABLE public.borrow_requests
DROP CONSTRAINT IF EXISTS valid_status;

ALTER TABLE public.borrow_requests
ADD CONSTRAINT valid_status
CHECK (status IN ('pending', 'approved', 'ready', 'borrowed', 'returned', 'rejected'));

CREATE OR REPLACE FUNCTION public.enforce_borrow_status_flow()
RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status NOT IN ('pending', 'approved', 'ready', 'borrowed', 'returned', 'rejected') THEN
            RAISE EXCEPTION 'Invalid borrow status: %', NEW.status;
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.status = OLD.status THEN
        RETURN NEW;
    END IF;

    IF OLD.status = 'pending' AND NEW.status IN ('approved', 'rejected') THEN
        RETURN NEW;
    ELSIF OLD.status = 'approved' AND NEW.status = 'ready' THEN
        RETURN NEW;
    ELSIF OLD.status = 'ready' AND NEW.status = 'borrowed' THEN
        RETURN NEW;
    ELSIF OLD.status = 'borrowed' AND NEW.status = 'returned' THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Invalid borrow status transition: % -> %', OLD.status, NEW.status;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_borrow_status_flow ON public.borrow_requests;

CREATE TRIGGER trg_enforce_borrow_status_flow
BEFORE INSERT OR UPDATE OF status ON public.borrow_requests
FOR EACH ROW
EXECUTE FUNCTION public.enforce_borrow_status_flow();
