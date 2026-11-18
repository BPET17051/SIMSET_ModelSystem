-- Allow the public catalog to read borrowable equipment rows.
-- Run once if the website shows 0 catalog items while equipments has rows.

BEGIN;

ALTER TABLE public.equipments ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE public.equipments TO anon;
GRANT SELECT ON TABLE public.equipments TO authenticated;

DROP POLICY IF EXISTS "public_select_borrowable_equipments" ON public.equipments;
CREATE POLICY "public_select_borrowable_equipments"
ON public.equipments
FOR SELECT
TO anon
USING (borrow_enabled = true);

DROP POLICY IF EXISTS "authenticated_select_equipments" ON public.equipments;
CREATE POLICY "authenticated_select_equipments"
ON public.equipments
FOR SELECT
TO authenticated
USING (true);

COMMIT;

-- Verification:
-- SELECT id, name_th, inventory_mode, borrow_enabled
-- FROM public.equipments
-- WHERE borrow_enabled = true
-- ORDER BY name_th;
