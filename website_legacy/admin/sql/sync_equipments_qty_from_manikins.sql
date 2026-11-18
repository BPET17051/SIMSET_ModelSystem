-- ============================================================
-- sync_equipments_qty_from_manikins.sql
-- Purpose: Sync equipments.total_quantity and maintenance_quantity
--          from live manikin data for all team-linked equipment rows.
--
-- Logic:
--   total_quantity     = active, non-deleted manikins in the team
--   maintenance_quantity = active manikins NOT in 'ready' status
--   (so available_qty in RPC = ready manikins - currently borrowed)
--
-- Safety: Only touches rows WHERE source_team_code IS NOT NULL
-- Run: Safe to re-run anytime (idempotent)
-- ============================================================

WITH team_counts AS (
    SELECT
        m.team_code,
        COUNT(*) FILTER (WHERE m.is_active = true AND m.deleted_at IS NULL)                       AS total_qty,
        COUNT(*) FILTER (WHERE m.is_active = true AND m.deleted_at IS NULL AND m.status != 'ready') AS maintenance_qty
    FROM public.manikins m
    WHERE m.team_code IS NOT NULL
    GROUP BY m.team_code
)
UPDATE public.equipments e
SET
    total_quantity       = tc.total_qty,
    maintenance_quantity = tc.maintenance_qty
FROM team_counts tc
WHERE e.source_team_code = tc.team_code
  AND e.source_team_code IS NOT NULL;

-- ============================================================
-- Verification: show the result
-- ============================================================
SELECT
    t.team_code,
    t.display_name,
    e.total_quantity,
    e.maintenance_quantity,
    (e.total_quantity - e.maintenance_quantity) AS expected_ready,
    e.borrow_enabled
FROM public.equipments e
JOIN public.teams t ON t.team_code = e.source_team_code
WHERE e.source_team_code IS NOT NULL
ORDER BY t.team_code;
