-- ============================================================
-- monitor_production_readiness.sql
-- Purpose: Production readiness check — detect drift between
--          manikin reality and equipment catalog entries.
-- Run: Any time before/after changes to manikins or teams.
-- ============================================================

-- -------------------------------------------------------
-- Section 1: Teams with ready manikins but equipment total = 0
--            (Borrower will show wrong availability — CRITICAL)
-- -------------------------------------------------------
SELECT
    'CRITICAL: ready > 0 but eq_total = 0' AS check_name,
    t.team_code,
    t.display_name,
    e.total_quantity AS eq_total,
    e.maintenance_quantity AS eq_maintenance,
    ready.cnt AS manikin_ready
FROM public.teams t
JOIN public.equipments e ON e.source_team_code = t.team_code
JOIN (
    SELECT team_code, COUNT(*) AS cnt
    FROM public.manikins
    WHERE status = 'ready' AND is_active = true AND deleted_at IS NULL
    GROUP BY team_code
) ready ON ready.team_code = t.team_code
WHERE e.total_quantity = 0
  AND ready.cnt > 0
  AND e.borrow_enabled = true
ORDER BY t.team_code;

-- -------------------------------------------------------
-- Section 2: Teams with NO equipment row (orphaned teams)
--            (Auto-sync should prevent this, but good to monitor)
-- -------------------------------------------------------
SELECT
    'WARNING: team has no equipment row' AS check_name,
    t.team_code,
    t.display_name,
    NULL::UUID AS equipment_id
FROM public.teams t
WHERE NOT EXISTS (
    SELECT 1 FROM public.equipments e WHERE e.source_team_code = t.team_code
)
ORDER BY t.team_code;

-- -------------------------------------------------------
-- Section 3: Equipment rows where total_quantity != manikin count
--            (Drift — needs re-sync)
-- -------------------------------------------------------
SELECT
    'DRIFT: equipment qty != manikin count' AS check_name,
    t.team_code,
    t.display_name,
    e.total_quantity AS eq_total,
    e.maintenance_quantity AS eq_maintenance,
    tc.manikin_total,
    tc.manikin_not_ready,
    (tc.manikin_total - e.total_quantity) AS total_drift,
    (tc.manikin_not_ready - e.maintenance_quantity) AS maintenance_drift
FROM public.teams t
JOIN public.equipments e ON e.source_team_code = t.team_code
JOIN (
    SELECT
        team_code,
        COUNT(*) FILTER (WHERE is_active = true AND deleted_at IS NULL)                        AS manikin_total,
        COUNT(*) FILTER (WHERE is_active = true AND deleted_at IS NULL AND status != 'ready')  AS manikin_not_ready
    FROM public.manikins
    WHERE team_code IS NOT NULL
    GROUP BY team_code
) tc ON tc.team_code = t.team_code
WHERE e.total_quantity != tc.manikin_total
   OR e.maintenance_quantity != tc.manikin_not_ready
ORDER BY t.team_code;

-- -------------------------------------------------------
-- Section 4: Full status snapshot (always helpful to run)
-- -------------------------------------------------------
SELECT
    t.team_code,
    t.display_name,
    e.borrow_enabled,
    e.total_quantity AS eq_total,
    e.maintenance_quantity AS eq_maintenance,
    (e.total_quantity - e.maintenance_quantity) AS eq_ready,
    COALESCE(tc.manikin_total, 0) AS real_total,
    COALESCE(tc.manikin_ready, 0) AS real_ready,
    CASE
        WHEN e.total_quantity = COALESCE(tc.manikin_total, 0)
         AND e.maintenance_quantity = COALESCE(tc.manikin_total, 0) - COALESCE(tc.manikin_ready, 0)
        THEN 'OK'
        ELSE 'DRIFT — run sync_equipments_qty_from_manikins.sql'
    END AS sync_status
FROM public.teams t
LEFT JOIN public.equipments e ON e.source_team_code = t.team_code
LEFT JOIN (
    SELECT
        team_code,
        COUNT(*) FILTER (WHERE is_active = true AND deleted_at IS NULL)                    AS manikin_total,
        COUNT(*) FILTER (WHERE is_active = true AND deleted_at IS NULL AND status = 'ready') AS manikin_ready
    FROM public.manikins
    WHERE team_code IS NOT NULL
    GROUP BY team_code
) tc ON tc.team_code = t.team_code
ORDER BY t.team_code;
