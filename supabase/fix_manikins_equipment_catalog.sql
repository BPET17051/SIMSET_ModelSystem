-- Fix missing equipment catalog row for manikin inventory.
-- Run once after seed_manikins_from_csv.sql if equipments has no manikin row.

BEGIN;

WITH desired AS (
    SELECT
        'หุ่นฝึกช่วยชีวิตผู้ใหญ่ BLS'::text AS name_th,
        'Adult BLS CPR training manikin'::text AS name_en,
        'manikin'::text AS type,
        'BLS_ADULT_QCPR'::text AS source_team_code,
        'manikin'::text AS inventory_mode,
        COALESCE((SELECT count(*)::integer FROM public.manikins WHERE team_code = 'BLS_ADULT_QCPR' AND is_active = true), 0) AS total_quantity,
        COALESCE((SELECT count(*)::integer FROM public.manikins WHERE team_code = 'BLS_ADULT_QCPR' AND status = 'maintenance'), 0) AS maintenance_quantity,
        'rotating'::text AS allocation_type,
        true AS borrow_enabled
),
existing AS (
    SELECT e.id
    FROM public.equipments e
    WHERE e.source_team_code = 'BLS_ADULT_QCPR'
       OR e.name_th = 'หุ่นฝึกช่วยชีวิตผู้ใหญ่ BLS'
    ORDER BY e.id
    LIMIT 1
),
inserted AS (
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
    FROM desired d
    WHERE NOT EXISTS (SELECT 1 FROM existing)
    RETURNING id
),
target AS (
    SELECT id FROM existing
    UNION ALL
    SELECT id FROM inserted
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
FROM desired d, target t
WHERE e.id = t.id;

COMMIT;

-- Verification:
-- SELECT e.name_th, e.inventory_mode, e.source_team_code, count(m.id) AS manikin_count
-- FROM public.equipments e
-- LEFT JOIN public.manikins m ON m.team_code = e.source_team_code
-- GROUP BY e.name_th, e.inventory_mode, e.source_team_code
-- ORDER BY e.name_th;
