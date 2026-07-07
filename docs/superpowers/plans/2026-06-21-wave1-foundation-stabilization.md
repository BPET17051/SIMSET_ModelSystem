# Wave 1 Foundation Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stabilize the current borrow foundation before adding new approval, notification, dashboard, or allocation-type features.

**Architecture:** Keep the active browser contract in `website/` and the Worker allowlist, but consolidate Supabase behavior into one release SQL script. The SQL script becomes the source of truth for authenticated borrower RPCs, status transitions, audit, item-to-manikin assignment, and automatic manikin status updates.

**Tech Stack:** Static HTML/JS frontend, Cloudflare Worker proxy, Supabase Postgres/RLS/RPC, Node verification scripts.

---

### Task 1: Baseline Verification

**Files:**
- Modify: `scripts/verify-current-mvp-contracts.js`

- [ ] **Step 1: Add assertions that define the wave 1 baseline**

Check that `supabase/current_mvp_release.sql` contains:
- `submit_borrow_request`
- `get_my_borrow_requests`
- `transition_borrow_request_status`
- `borrow_request_items.manikin_sap_id`
- `borrow_request_status_audit`
- `trg_sync_manikin_status_from_borrow_request`

- [ ] **Step 2: Run the verification and confirm RED**

Run: `npm run verify:current-mvp`

Expected: fail because the current consolidated SQL does not yet contain the wave 1 baseline.

### Task 2: Consolidated SQL

**Files:**
- Modify: `supabase/current_mvp_release.sql`
- Modify: `supabase/MIGRATION_ORDER.md`

- [ ] **Step 1: Consolidate current MVP + Phase 1 + Phase 2**

Replace the release SQL with one idempotent script that:
- Adds borrow domain columns and canonical statuses.
- Adds `borrow_request_status_audit`.
- Defines `transition_borrow_request_status`.
- Defines authenticated `submit_borrow_request`.
- Defines `get_my_borrow_requests`.
- Keeps `get_borrow_request_status`.
- Marks `submit_public_borrow_request` deprecated instead of relying on it.

- [ ] **Step 2: Add exact manikin linkage**

Add `borrow_request_items.manikin_sap_id text references public.manikins(sap_id)` and an index.

- [ ] **Step 3: Auto-assign ready manikins during submit**

For equipment rows with `source_team_code`, create one item row per assigned ready manikin with `qty_borrowed = 1`. Use row locks and active/non-deleted/ready filters to prevent double assignment.

- [ ] **Step 4: Sync manikin status from order status**

Create a trigger on `borrow_requests`:
- `borrowed` sets linked `manikins.status = 'in_use'`.
- `returned` sets linked `manikins.status = 'ready'`.
- `cancelled`, `rejected`, and `expired` release pending assigned items back to `ready` only when the manikin is not linked to another active order.

### Task 3: Frontend And Route Stabilization

**Files:**
- Modify: `website/js/admin.js`
- Modify: `docs/CURRENT_MVP_SYSTEM.md`
- Modify: `docs/RELEASE_SOURCE_SET.md`

- [ ] **Step 1: Keep frontend aligned with the consolidated RPC version**

Confirm checkout/history use `submit_borrow_request`, `get_my_borrow_requests`, and `transition_borrow_request_status`.

- [ ] **Step 2: Reduce legacy ambiguity**

Document that active routes are `website/` only and `website_legacy/` is historical. Keep `track.html` because it is the current route, but avoid referencing retired `tracking.html` or `borrow.html` flows in current docs/checks.

### Task 4: Verify

**Files:**
- Test: `scripts/verify-current-mvp-contracts.js`

- [ ] **Step 1: Run current MVP contract verification**

Run: `npm run verify:current-mvp`

Expected: pass.

- [ ] **Step 2: Run smoke page verification**

Run: `npm run smoke:main-pages`

Expected: pass.

- [ ] **Step 3: Report wave 1 status only**

Report what changed, what was verified, and any remaining live-database action required before starting wave 2.
