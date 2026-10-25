-- T17 DRAFT: equipment_tags table and public read-only RPC.
-- Status: prepared for review. Do not run without approval.
-- Adds one table and one function. Does not change equipments, manikins, or any existing RLS policy.

BEGIN;

CREATE TABLE IF NOT EXISTS public.equipment_tags (
    equipment_id uuid NOT NULL REFERENCES public.equipments(id) ON DELETE CASCADE,
    tag_group text NOT NULL CHECK (tag_group IN ('patient_group', 'skill')),
    tag_value text NOT NULL CHECK (tag_value IN ('Adult', 'Pediatric', 'Infant', 'Obstetric', 'CPR', 'Airway', 'IV', 'Assessment')),
    evidence text NOT NULL CHECK (evidence IN ('sheet_category', 'owner_confirmed')),
    PRIMARY KEY (equipment_id, tag_group, tag_value)
);

COMMENT ON TABLE public.equipment_tags IS
    'Patient group and skill tags per equipment item. Multiple values allowed. Neonatal is folded into Infant until the owner decides.';

ALTER TABLE public.equipment_tags ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.equipment_tags FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_public_equipment_tags()
RETURNS TABLE(equipment_id uuid, tag_group text, tag_value text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT t.equipment_id, t.tag_group, t.tag_value
    FROM public.equipment_tags t
    JOIN public.equipments e ON e.id = t.equipment_id
    WHERE e.borrow_enabled = true;
$$;

REVOKE ALL ON FUNCTION public.get_public_equipment_tags() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_equipment_tags() TO anon, authenticated;

COMMENT ON FUNCTION public.get_public_equipment_tags() IS
    'Public catalog helper: patient group and skill tags per equipment. Exposes no SAP IDs and no unit-level data.';

COMMIT;
