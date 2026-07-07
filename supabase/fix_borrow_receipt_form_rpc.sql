-- Patch: enrich tracking/receipt payload for the printable borrow form.
-- Run this on an existing Supabase project after current_mvp_release.sql.

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
