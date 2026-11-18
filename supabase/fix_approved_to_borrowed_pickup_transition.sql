-- Allow Staff Confirm Pickup to move an approved request directly to borrowed.
-- The Staff Dashboard treats approved orders as "to prepare"; confirming pickup
-- is the actual checkout action, so approved -> borrowed is a valid transition.

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
        OR (p_current_status = 'overdue' AND p_next_status = 'returned');
$$;

SELECT
    simset_private.is_allowed_borrow_status_transition('approved', 'borrowed') AS approved_to_borrowed_allowed;
