-- Phase 2 Migration: centralized availability RPC for UI/DB consistency
-- Final version: avoids PL/pgSQL namespace collisions with OUT parameters.

CREATE OR REPLACE FUNCTION public.get_borrow_availability(
    p_start_date DATE,
    p_end_date DATE,
    p_equipment_ids JSONB DEFAULT NULL
)
RETURNS TABLE (
    equipment_id UUID,
    total_qty INT,
    maintenance_qty INT,
    used_qty INT,
    available_qty INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
        SELECT value::UUID AS requested_equipment_id
        FROM jsonb_array_elements_text(COALESCE(p_equipment_ids, '[]'::jsonb))
    ),
    base AS (
        SELECT
            e.id AS base_equipment_id,
            e.total_quantity,
            e.maintenance_quantity
        FROM public.equipments e
        WHERE p_equipment_ids IS NULL
           OR e.id IN (
                SELECT r.requested_equipment_id
                FROM requested_ids r
           )
    ),
    used AS (
        SELECT
            bri.equipment_id AS used_equipment_id,
            COALESCE(SUM(bri.qty_borrowed), 0)::INT AS used_qty
        FROM public.borrow_request_items bri
        JOIN public.borrow_requests br ON br.id = bri.request_id
        WHERE bri.start_date <= p_end_date
          AND bri.end_date >= p_start_date
          AND br.status IN ('pending', 'approved', 'returned_pending_inspection')
          AND (
                p_equipment_ids IS NULL
                OR bri.equipment_id IN (
                    SELECT r.requested_equipment_id
                    FROM requested_ids r
                )
          )
        GROUP BY bri.equipment_id
    )
    SELECT
        b.base_equipment_id AS equipment_id,
        b.total_quantity::INT AS total_qty,
        b.maintenance_quantity::INT AS maintenance_qty,
        COALESCE(u.used_qty, 0)::INT AS used_qty,
        GREATEST(
            (b.total_quantity - b.maintenance_quantity) - COALESCE(u.used_qty, 0),
            0
        )::INT AS available_qty
    FROM base b
    LEFT JOIN used u ON u.used_equipment_id = b.base_equipment_id
    ORDER BY b.base_equipment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_borrow_availability(DATE, DATE, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_borrow_availability(DATE, DATE, JSONB) TO anon, authenticated;
