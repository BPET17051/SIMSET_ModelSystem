# Wave 3 Manikin Allocation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three-way manikin allocation rules so rotating, room-dedicated, and advance-course-dedicated assets behave differently during borrow selection and staff assignment.

**Architecture:** Keep `supabase/current_mvp_release.sql` as the active DB contract and expose behavior through RPCs instead of direct table writes. Use the existing static frontend pages and Worker proxy allowlist, adding only small UI states to catalog/checkout/staff/admin surfaces.

**Tech Stack:** Supabase Postgres/RLS/RPC, Cloudflare Worker allowlist, static HTML/CSS/JS, Playwright smoke tests.

---

### Task 1: Contract Test

**Files:**
- Modify: `scripts/verify-current-mvp-contracts.js`
- Modify: `scripts/smoke-main-pages.js`

- [ ] Add failing assertions for `allocation_type`, `courses`, `manikin_allocation_type_audit`, `get_equipment_borrow_rules`, `staff_assign_manikin_to_item`, `get_rotation_suggestions`, and `room_dedicated_review` LINE outbox event.
- [ ] Add smoke mocks for equipment allocation labels and checkout rule warnings.
- [ ] Run `npm run verify:current-mvp` and confirm it fails because Wave 3 contracts are missing.

### Task 2: Database Rules

**Files:**
- Modify: `supabase/current_mvp_release.sql`

- [ ] Add `equipments.allocation_type` with values `rotating`, `room_dedicated`, `advance_course_dedicated`.
- [ ] Add `courses` table and `course_reserved_manikins` table with explicit grants and RLS.
- [ ] Add audit trigger for `equipments.allocation_type` changes into `audit_logs` when present and `manikin_allocation_type_audit` as durable fallback.
- [ ] Add `get_equipment_borrow_rules(p_equipment_ids, p_start_date, p_end_date)` returning warnings, block status, course conflicts, and lead-time guidance.
- [ ] Add `staff_assign_manikin_to_item(p_item_id, p_manikin_sap_id)` that blocks advance-course conflicts and enforces exact item/manikin assignment.
- [ ] Add `get_rotation_suggestions(p_equipment_id, p_selected_manikin_sap_id)` based on borrow frequency in the same team/equipment pool.

### Task 3: Frontend Integration

**Files:**
- Modify: `website/js/catalog.js`
- Modify: `website/js/checkout.js`
- Modify: `website/js/staff.js`
- Modify: `website/css/simset-borrow.css`
- Modify: `cloudflare-worker/worker.js`

- [ ] Show allocation badges in catalog/details.
- [ ] On checkout, call `get_equipment_borrow_rules` after dates are known; show room-dedicated seven-working-day warning and block advance course conflicts.
- [ ] On staff dashboard, show allocation hints and rotation suggestions for assigned manikins.
- [ ] Allow Worker proxy access to the new RPCs.

### Task 4: Verification

**Files:**
- Modify: `docs/CURRENT_MVP_SYSTEM.md`
- Modify: `docs/RELEASE_SOURCE_SET.md`

- [ ] Update docs with Wave 3 route/RPC/schema contract.
- [ ] Run `npm run verify:current-mvp`.
- [ ] Run `npm run smoke:main-pages`.
- [ ] Run `npm run smoke:deploy-workflow`.
- [ ] Run `node --check cloudflare-worker/worker.js`.
