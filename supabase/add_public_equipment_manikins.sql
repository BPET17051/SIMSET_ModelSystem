BEGIN;

CREATE OR REPLACE FUNCTION public.get_public_equipment_manikins(
    p_equipment_id uuid
)
RETURNS TABLE(display_name text, count integer)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT
        COALESCE(NULLIF(trim(m.display_name), ''), NULLIF(trim(m.model_id), ''), e.name_th) AS display_name,
        count(*)::integer AS count
    FROM public.equipments e
    JOIN public.manikins m ON m.team_code = e.source_team_code
    WHERE e.id = p_equipment_id
      AND e.borrow_enabled = true
      AND COALESCE(e.inventory_mode, 'quantity_only') = 'manikin'
      AND m.is_active = true
      AND m.deleted_at IS NULL
    GROUP BY COALESCE(NULLIF(trim(m.display_name), ''), NULLIF(trim(m.model_id), ''), e.name_th)
    ORDER BY display_name;
$$;

REVOKE ALL ON FUNCTION public.get_public_equipment_manikins(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_equipment_manikins(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.get_public_equipment_manikins(uuid) IS
    'Public catalog helper that exposes only grouped manikin display names for an equipment item. It does not expose per-unit SAP IDs.';

COMMIT;
