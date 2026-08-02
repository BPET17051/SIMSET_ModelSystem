-- Attach the public catalog photo for the adult BLS / RA QCPR manikin group.
-- Run after supabase/add_equipment_image_url.sql or supabase/current_mvp_release.sql.

BEGIN;

UPDATE public.equipments
SET image_url = 'https://simset-showroom.pages.dev/assets/equipment/ra-qcpr.webp'
WHERE source_team_code = 'BLS_ADULT_QCPR'
   OR name_th = 'หุ่นฝึกช่วยชีวิตผู้ใหญ่ BLS';

COMMIT;
