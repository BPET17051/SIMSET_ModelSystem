import csv
from pathlib import Path

csv_path = Path(r"C:\Users\Apisit Tangla\Downloads\ฐานข้อมูลสำหรับระบบยืม-คืน - manikins.csv")
out_path = Path(r"D:\Jedi_EX_HDX_BAC01\01.Jedi_SIMSET\SIMSET_Project\SIMSET_ModelSystem\supabase\seed_manikins_from_csv.sql")

status_map = {
    "พร้อมใช้งาน": "ready",
    "ซ่อมบำรุง": "maintenance",
    "ready": "ready",
    "in_use": "in_use",
    "maintenance": "maintenance",
    "retired": "retired",
}


def q(value):
    value = "" if value is None else str(value).strip()
    return "NULL" if value == "" else "'" + value.replace("'", "''") + "'"


def b(value):
    value = "" if value is None else str(value).strip().lower()
    if value in {"true", "t", "1", "yes", "y"}:
        return "true"
    if value in {"false", "f", "0", "no", "n"}:
        return "false"
    raise ValueError(f"Bad boolean: {value!r}")


with csv_path.open("r", encoding="utf-8-sig", newline="") as f:
    rows = list(csv.DictReader(f))

seen_sap = set()
seen_model = set()
values = []

for row in rows:
    sap = (row.get("sap_id") or "").strip()
    model = (row.get("model_id") or "").strip()
    if not sap or not model:
        raise SystemExit("sap_id and model_id are required")
    if sap in seen_sap:
        raise SystemExit(f"Duplicate sap_id: {sap}")
    if model in seen_model:
        raise SystemExit(f"Duplicate model_id: {model}")
    seen_sap.add(sap)
    seen_model.add(model)

    status_text = (row.get("status") or "").strip()
    if status_text not in status_map:
        raise SystemExit(f"Bad status: {status_text!r}")
    status = status_map[status_text]
    needs_review = "false" if status == "ready" else b(row.get("needs_review"))

    values.append(
        "    ({}, {}, {}, {}, {}, {}, {}, {}, {})".format(
            q(sap),
            q(model),
            q(row.get("team_code")),
            q(row.get("display_name")),
            q(row.get("asset_code")),
            q(status),
            b(row.get("is_active")),
            needs_review,
            q(row.get("notes")),
        )
    )

sql = f"""-- Seed generated from: C:\\Users\\Apisit Tangla\\Downloads\\ฐานข้อมูลสำหรับระบบยืม-คืน - manikins.csv
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
        {len(rows)}::integer AS total_quantity,
        {sum(1 for r in rows if status_map[(r.get("status") or "").strip()] == "maintenance")}::integer AS maintenance_quantity,
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
{",\n".join(values)}
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
"""

out_path.write_text(sql, encoding="utf-8")
print(f"OUT={out_path}")
print(f"ROWS={len(rows)}")
