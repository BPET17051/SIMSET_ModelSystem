-- Seed generated from:
-- C:\Users\Apisit Tangla\Downloads\ฐานข้อมูลสำหรับระบบยืม-คืน - equipment_units.csv
--
-- Purpose:
-- - Create the parent equipment catalog rows if they do not exist.
-- - Add sap_id to equipment_units if the table does not have it yet.
-- - Upsert FCB/AWB/NWB equipment unit rows without manually copying equipment UUIDs.

BEGIN;

ALTER TABLE public.equipment_units
    ADD COLUMN IF NOT EXISTS sap_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_equipment_units_sap_id
ON public.equipment_units (sap_id)
WHERE sap_id IS NOT NULL;

WITH desired_equipments AS (
    SELECT *
    FROM (VALUES
        ('กระดานฟลิปชาร์ท', 'equipment', 'tracked_unit', 4, 0, 'rotating', true),
        ('กล่องอุปกรณ์ Airway ผู้ใหญ่', 'kit', 'kit', 12, 0, 'rotating', true),
        ('กล่องอุปกรณ์ Airway เด็กทารก', 'kit', 'kit', 13, 0, 'rotating', true)
    ) AS v(name_th, type, inventory_mode, total_quantity, maintenance_quantity, allocation_type, borrow_enabled)
),
inserted AS (
    INSERT INTO public.equipments (
        name_th,
        type,
        inventory_mode,
        total_quantity,
        maintenance_quantity,
        allocation_type,
        borrow_enabled
    )
    SELECT
        d.name_th,
        d.type,
        d.inventory_mode,
        d.total_quantity,
        d.maintenance_quantity,
        d.allocation_type,
        d.borrow_enabled
    FROM desired_equipments d
    WHERE NOT EXISTS (
        SELECT 1
        FROM public.equipments e
        WHERE e.name_th = d.name_th
    )
    RETURNING id, name_th
),
equipment_map AS (
    SELECT id, name_th
    FROM inserted
    UNION ALL
    SELECT existing.id, existing.name_th
    FROM (
        SELECT DISTINCT ON (e.name_th)
            e.id,
            e.name_th
        FROM public.equipments e
        JOIN desired_equipments d ON d.name_th = e.name_th
        WHERE NOT EXISTS (
            SELECT 1
            FROM inserted i
            WHERE i.name_th = e.name_th
        )
        ORDER BY e.name_th, e.id
    ) existing
),
raw_units AS (
    SELECT *
    FROM (VALUES
        ('กระดานฟลิปชาร์ท', NULL, 'FCB-001', NULL, 'ready', false, 0, true, 'กระดานฟลิปชาร์ท 01'),
        ('กระดานฟลิปชาร์ท', NULL, 'FCB-002', NULL, 'ready', false, 0, true, 'กระดานฟลิปชาร์ท 02'),
        ('กระดานฟลิปชาร์ท', NULL, 'FCB-003', NULL, 'ready', false, 0, true, 'กระดานฟลิปชาร์ท 03'),
        ('กระดานฟลิปชาร์ท', NULL, 'FCB-004', NULL, 'ready', false, 0, true, 'กระดานฟลิปชาร์ท 04'),
        ('กล่องอุปกรณ์ Airway ผู้ใหญ่', NULL, 'AWB-001', NULL, 'ready', false, 0, true, 'กล่องอุปกรณ์ Airway ผู้ใหญ่ 01'),
        ('กล่องอุปกรณ์ Airway ผู้ใหญ่', NULL, 'AWB-002', NULL, 'ready', false, 0, true, 'กล่องอุปกรณ์ Airway ผู้ใหญ่ 02'),
        ('กล่องอุปกรณ์ Airway ผู้ใหญ่', NULL, 'AWB-003', NULL, 'ready', false, 0, true, 'กล่องอุปกรณ์ Airway ผู้ใหญ่ 03'),
        ('กล่องอุปกรณ์ Airway ผู้ใหญ่', NULL, 'AWB-004', NULL, 'ready', false, 0, true, 'กล่องอุปกรณ์ Airway ผู้ใหญ่ 04'),
        ('กล่องอุปกรณ์ Airway ผู้ใหญ่', NULL, 'AWB-005', NULL, 'ready', false, 0, true, 'กล่องอุปกรณ์ Airway ผู้ใหญ่ 05'),
        ('กล่องอุปกรณ์ Airway ผู้ใหญ่', NULL, 'AWB-006', NULL, 'ready', false, 0, true, 'กล่องอุปกรณ์ Airway ผู้ใหญ่ 06'),
        ('กล่องอุปกรณ์ Airway ผู้ใหญ่', NULL, 'AWB-007', NULL, 'ready', false, 0, true, 'กล่องอุปกรณ์ Airway ผู้ใหญ่ 07'),
        ('กล่องอุปกรณ์ Airway ผู้ใหญ่', NULL, 'AWB-008', NULL, 'ready', false, 0, true, 'กล่องอุปกรณ์ Airway ผู้ใหญ่ 08'),
        ('กล่องอุปกรณ์ Airway ผู้ใหญ่', NULL, 'AWB-009', NULL, 'ready', false, 0, true, 'กล่องอุปกรณ์ Airway ผู้ใหญ่ 09'),
        ('กล่องอุปกรณ์ Airway ผู้ใหญ่', NULL, 'AWB-010', NULL, 'ready', false, 0, true, 'กล่องอุปกรณ์ Airway ผู้ใหญ่ 10'),
        ('กล่องอุปกรณ์ Airway ผู้ใหญ่', NULL, 'AWB-011', NULL, 'ready', false, 0, true, 'กล่องอุปกรณ์ Airway ผู้ใหญ่ 11'),
        ('กล่องอุปกรณ์ Airway ผู้ใหญ่', NULL, 'AWB-012', NULL, 'ready', false, 0, true, 'กล่องอุปกรณ์ Airway ผู้ใหญ่ 12'),
        ('กล่องอุปกรณ์ Airway เด็กทารก', NULL, 'NWB-001', NULL, 'ready', true, 0, true, 'กล่องอุปกรณ์ Airway เด็กทารก 01'),
        ('กล่องอุปกรณ์ Airway เด็กทารก', NULL, 'NWB-002', NULL, 'ready', true, 0, true, 'กล่องอุปกรณ์ Airway เด็กทารก 02'),
        ('กล่องอุปกรณ์ Airway เด็กทารก', NULL, 'NWB-003', NULL, 'ready', true, 0, true, 'กล่องอุปกรณ์ Airway เด็กทารก 03'),
        ('กล่องอุปกรณ์ Airway เด็กทารก', NULL, 'NWB-004', NULL, 'ready', true, 0, true, 'กล่องอุปกรณ์ Airway เด็กทารก 04'),
        ('กล่องอุปกรณ์ Airway เด็กทารก', NULL, 'NWB-005', NULL, 'ready', true, 0, true, 'กล่องอุปกรณ์ Airway เด็กทารก 05'),
        ('กล่องอุปกรณ์ Airway เด็กทารก', NULL, 'NWB-006', NULL, 'ready', true, 0, true, 'กล่องอุปกรณ์ Airway เด็กทารก 06'),
        ('กล่องอุปกรณ์ Airway เด็กทารก', NULL, 'NWB-007', NULL, 'ready', true, 0, true, 'กล่องอุปกรณ์ Airway เด็กทารก 07'),
        ('กล่องอุปกรณ์ Airway เด็กทารก', NULL, 'NWB-008', NULL, 'ready', true, 0, true, 'กล่องอุปกรณ์ Airway เด็กทารก 08'),
        ('กล่องอุปกรณ์ Airway เด็กทารก', NULL, 'NWB-009', NULL, 'ready', true, 0, true, 'กล่องอุปกรณ์ Airway เด็กทารก 09'),
        ('กล่องอุปกรณ์ Airway เด็กทารก', NULL, 'NWB-010', NULL, 'ready', true, 0, true, 'กล่องอุปกรณ์ Airway เด็กทารก 10'),
        ('กล่องอุปกรณ์ Airway เด็กทารก', NULL, 'NWB-011', NULL, 'ready', true, 0, true, 'กล่องอุปกรณ์ Airway เด็กทารก 11'),
        ('กล่องอุปกรณ์ Airway เด็กทารก', NULL, 'NWB-012', NULL, 'ready', true, 0, true, 'กล่องอุปกรณ์ Airway เด็กทารก 12'),
        ('กล่องอุปกรณ์ Airway เด็กทารก', NULL, 'NWB-013', NULL, 'ready', true, 0, true, 'กล่องอุปกรณ์ Airway เด็กทารก 13')
    ) AS v(equipment_name, sap_id, unit_code, asset_code, status, requires_l1_approval, borrow_count, is_active, notes)
)
INSERT INTO public.equipment_units (
    equipment_id,
    sap_id,
    unit_code,
    asset_code,
    status,
    requires_l1_approval,
    borrow_count,
    is_active,
    notes
)
SELECT
    em.id,
    ru.sap_id,
    ru.unit_code,
    ru.asset_code,
    ru.status,
    ru.requires_l1_approval,
    ru.borrow_count,
    ru.is_active,
    ru.notes
FROM raw_units ru
JOIN equipment_map em ON em.name_th = ru.equipment_name
ON CONFLICT (equipment_id, unit_code) DO UPDATE
SET
    sap_id = EXCLUDED.sap_id,
    asset_code = EXCLUDED.asset_code,
    status = EXCLUDED.status,
    requires_l1_approval = EXCLUDED.requires_l1_approval,
    borrow_count = EXCLUDED.borrow_count,
    is_active = EXCLUDED.is_active,
    notes = EXCLUDED.notes;

UPDATE public.equipments e
SET total_quantity = unit_counts.unit_count
FROM (
    SELECT equipment_id, count(*)::integer AS unit_count
    FROM public.equipment_units
    WHERE unit_code ~ '^(FCB|AWB|NWB)-'
    GROUP BY equipment_id
) unit_counts
WHERE e.id = unit_counts.equipment_id;

COMMIT;

-- Verification
SELECT e.name_th, e.inventory_mode, e.total_quantity, count(eu.id) AS unit_count
FROM public.equipments e
LEFT JOIN public.equipment_units eu ON eu.equipment_id = e.id
WHERE e.name_th IN (
    'กระดานฟลิปชาร์ท',
    'กล่องอุปกรณ์ Airway ผู้ใหญ่',
    'กล่องอุปกรณ์ Airway เด็กทารก'
)
GROUP BY e.id, e.name_th, e.inventory_mode, e.total_quantity
ORDER BY e.name_th;
