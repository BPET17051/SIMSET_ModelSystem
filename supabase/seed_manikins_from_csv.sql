-- Seed generated from: C:\Users\Apisit Tangla\Downloads\ฐานข้อมูลสำหรับระบบยืม-คืน - manikins.csv
-- Purpose: add/import manikin unit rows for the SIMSET borrow/return system.
-- Safe to rerun: rows are upserted by sap_id.

BEGIN;

ALTER TABLE public.manikins
    ADD COLUMN IF NOT EXISTS model_id text,
    ADD COLUMN IF NOT EXISTS display_name text,
    ADD COLUMN IF NOT EXISTS asset_code text,
    ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE public.manikins
    DROP CONSTRAINT IF EXISTS manikins_status_check;

ALTER TABLE public.manikins
    ADD CONSTRAINT manikins_status_check
    CHECK (status IN ('ready', 'in_use', 'maintenance', 'retired'));

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

CREATE UNIQUE INDEX IF NOT EXISTS idx_manikins_model_id_unique
ON public.manikins (model_id)
WHERE model_id IS NOT NULL;

WITH desired_equipment AS (
    SELECT
        'หุ่นฝึกช่วยชีวิตผู้ใหญ่ BLS'::text AS name_th,
        'Adult BLS CPR training manikin'::text AS name_en,
        'manikin'::text AS type,
        'BLS_ADULT_QCPR'::text AS source_team_code,
        'manikin'::text AS inventory_mode,
        15::integer AS total_quantity,
        3::integer AS maintenance_quantity,
        'rotating'::text AS allocation_type,
        true AS borrow_enabled
),
existing_equipment AS (
    SELECT e.id
    FROM public.equipments e
    WHERE e.source_team_code = 'BLS_ADULT_QCPR'
       OR e.name_th = 'หุ่นฝึกช่วยชีวิตผู้ใหญ่ BLS'
    ORDER BY e.id
    LIMIT 1
),
inserted_equipment AS (
    INSERT INTO public.equipments (
        name_th,
        name_en,
        type,
        source_team_code,
        inventory_mode,
        total_quantity,
        maintenance_quantity,
        allocation_type,
        borrow_enabled
    )
    SELECT
        d.name_th,
        d.name_en,
        d.type,
        d.source_team_code,
        d.inventory_mode,
        d.total_quantity,
        d.maintenance_quantity,
        d.allocation_type,
        d.borrow_enabled
    FROM desired_equipment d
    WHERE NOT EXISTS (SELECT 1 FROM existing_equipment)
    RETURNING id
),
target_equipment AS (
    SELECT id FROM existing_equipment
    UNION ALL
    SELECT id FROM inserted_equipment
)
UPDATE public.equipments e
SET
    name_th = d.name_th,
    name_en = d.name_en,
    type = d.type,
    source_team_code = d.source_team_code,
    inventory_mode = d.inventory_mode,
    total_quantity = d.total_quantity,
    maintenance_quantity = d.maintenance_quantity,
    allocation_type = d.allocation_type,
    borrow_enabled = d.borrow_enabled
FROM desired_equipment d, target_equipment t
WHERE e.id = t.id;

INSERT INTO public.manikins (
    sap_id,
    model_id,
    team_code,
    display_name,
    asset_code,
    status,
    is_active,
    needs_review,
    notes
) VALUES
    ('131200000516', 'RA1', 'BLS_ADULT_QCPR', 'หุ่นผู้ใหญ่สำหรับฝึกช่วยชีวิตขั้นพื้นฐาน Resusci Anne QCPR', '11001800-S-69100040010/58', 'maintenance', false, true, 'รอซ่อม'),
    ('131200000517', 'RA2', 'BLS_ADULT_QCPR', 'หุ่นผู้ใหญ่สำหรับฝึกช่วยชีวิตขั้นพื้นฐาน Resusci Anne QCPR', '11001800-S-69100040010/58', 'ready', true, false, NULL),
    ('131200000518', 'RA3', 'BLS_ADULT_QCPR', 'หุ่นผู้ใหญ่สำหรับฝึกช่วยชีวิตขั้นพื้นฐาน Resusci Anne QCPR', '11001800-S-69100040010/58', 'ready', true, false, NULL),
    ('131200000519', 'RA4', 'BLS_ADULT_QCPR', 'หุ่นผู้ใหญ่สำหรับฝึกช่วยชีวิตขั้นพื้นฐาน Resusci Anne QCPR', '11001800-S-69100040010/58', 'maintenance', false, true, 'รอซ่อม'),
    ('131200000520', 'RA5', 'BLS_ADULT_QCPR', 'หุ่นผู้ใหญ่สำหรับฝึกช่วยชีวิตขั้นพื้นฐาน Resusci Anne QCPR', '11001800-S-69100040010/58', 'ready', true, false, NULL),
    ('131200000521', 'RA6', 'BLS_ADULT_QCPR', 'หุ่นผู้ใหญ่สำหรับฝึกช่วยชีวิตขั้นพื้นฐาน Resusci Anne QCPR', '11001800-S-69100040010/58', 'ready', true, false, NULL),
    ('131200000522', 'RA7', 'BLS_ADULT_QCPR', 'หุ่นผู้ใหญ่สำหรับฝึกช่วยชีวิตขั้นพื้นฐาน Resusci Anne QCPR', '11001800-S-69100040010/58', 'ready', true, false, NULL),
    ('131200000523', 'RA8', 'BLS_ADULT_QCPR', 'หุ่นผู้ใหญ่สำหรับฝึกช่วยชีวิตขั้นพื้นฐาน Resusci Anne QCPR', '11001800-S-69100040010/58', 'maintenance', false, true, 'รอซ่อม'),
    ('131200000524', 'RA9', 'BLS_ADULT_QCPR', 'หุ่นผู้ใหญ่สำหรับฝึกช่วยชีวิตขั้นพื้นฐาน Resusci Anne QCPR', '11001800-S-69100040010/58', 'ready', true, false, NULL),
    ('131200000525', 'RA10', 'BLS_ADULT_QCPR', 'หุ่นผู้ใหญ่สำหรับฝึกช่วยชีวิตขั้นพื้นฐาน Resusci Anne QCPR', '11001800-S-69100040010/58', 'ready', true, false, NULL),
    ('131200000554', 'RA11', 'BLS_ADULT_QCPR', 'หุ่นผู้ใหญ่สำหรับฝึกช่วยชีวิตขั้นพื้นฐาน Laerdal / RA QCPR พร้อมโปรแกรมประเมินผล', '11001800-S-69100040017/61', 'ready', true, false, NULL),
    ('131200000555', 'RA12', 'BLS_ADULT_QCPR', 'หุ่นผู้ใหญ่สำหรับฝึกช่วยชีวิตขั้นพื้นฐาน Laerdal / RA QCPR พร้อมโปรแกรมประเมินผล', '11001800-S-69100040017/61', 'ready', true, false, NULL),
    ('131200000556', 'RA13', 'BLS_ADULT_QCPR', 'หุ่นผู้ใหญ่สำหรับฝึกช่วยชีวิตขั้นพื้นฐาน Laerdal / RA QCPR พร้อมโปรแกรมประเมินผล', '11001800-S-69100040017/61', 'ready', true, false, NULL),
    ('131200000557', 'RA14', 'BLS_ADULT_QCPR', 'หุ่นผู้ใหญ่สำหรับฝึกช่วยชีวิตขั้นพื้นฐาน Laerdal / RA QCPR พร้อมโปรแกรมประเมินผล', '11001800-S-69100040017/61', 'ready', true, false, NULL),
    ('131200000558', 'RA15', 'BLS_ADULT_QCPR', 'หุ่นผู้ใหญ่สำหรับฝึกช่วยชีวิตขั้นพื้นฐาน Laerdal / RA QCPR พร้อมโปรแกรมประเมินผล', '11001800-S-69100040017/61', 'ready', true, false, NULL)
ON CONFLICT (sap_id) DO UPDATE SET
    model_id = EXCLUDED.model_id,
    team_code = EXCLUDED.team_code,
    display_name = EXCLUDED.display_name,
    asset_code = EXCLUDED.asset_code,
    status = EXCLUDED.status,
    is_active = EXCLUDED.is_active,
    needs_review = EXCLUDED.needs_review,
    notes = EXCLUDED.notes,
    deleted_at = NULL;

COMMIT;

-- Verification:
-- SELECT status, needs_review, count(*) FROM public.manikins GROUP BY status, needs_review ORDER BY status, needs_review;
-- SELECT sap_id, model_id, team_code, display_name, status, is_active, needs_review FROM public.manikins ORDER BY model_id;
-- SELECT e.name_th, e.inventory_mode, e.source_team_code, count(m.id) AS manikin_count FROM public.equipments e LEFT JOIN public.manikins m ON m.team_code = e.source_team_code GROUP BY e.name_th, e.inventory_mode, e.source_team_code ORDER BY e.name_th;
