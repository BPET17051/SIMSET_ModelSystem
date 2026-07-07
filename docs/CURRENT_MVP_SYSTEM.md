# Current SIMSET Borrow MVP

This document is the current source of truth for the MVP route and release shape.

For Thai stakeholder reporting and the latest product decisions from the June 2026 working session, see `docs/PROJECT_LATEST_STATUS_TH.md`.

## Current Routes

| Route | Purpose |
| --- | --- |
| `/` / `/index.html` | Equipment catalog |
| `/product-details.html?id=<equipment_id>` | Equipment details |
| `/cart.html` | Borrow list review |
| `/checkout.html?equipment_id=<equipment_id>&qty=1` | Public borrow request submission with no borrower login |
| `/track.html?id=<tracking_id>` | Request tracking |
| `/approver.html` | L1 approval queue for approver_l1/admin users |
| `/staff.html` | Staff Kanban dashboard for prepare / checked-out / returned-today work |
| `/report.html` | KPI dashboard for approver/head reporting |
| `/admin-login.html` | Admin login |
| `/admin.html` | Admin menu hub for approver, staff, report, and catalog pages. Legacy admin workflow tabs are intentionally retired. |

## Current Runtime Path

Browser traffic uses `website/js/supabase-client.js`, which points the Supabase JS client at:

```text
https://simset-showroom-proxy.simset-admin.workers.dev
```

The browser uses `worker-managed-key` as a placeholder. The Worker injects the real Supabase key from Cloudflare secrets and preserves real user JWTs for RLS.

The Worker also dispatches pending `line_notification_outbox` rows to LINE Messaging API on a 15-minute Cloudflare Cron trigger. Configure `SUPABASE_SERVICE_ROLE_KEY`, `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_TARGET_STAFF`, `LINE_TARGET_HEAD`, and `LINE_DISPATCH_SECRET` as Worker secrets before using LINE notifications in production. LINE event types are `order_created`, `l1_approved`, `overdue`, and Wave 3 `room_dedicated_review`.

## Current Database Contract

Use `supabase/current_mvp_release.sql` as the active release SQL. It consolidates the Phase 1 status state machine, Phase 2 authenticated borrower RPCs, borrower history RPC, exact `borrow_request_items.manikin_sap_id` linkage, automatic `manikins.status` sync when orders move to `borrowed` or `returned`, and Wave 3 allocation rules.

Borrower submission is a public form based on the paper borrow form. Borrowers provide name, position, department/unit, phone, purpose, usage location, borrow dates, and requested items, then receive a tracking ID. Staff, approver_l1, and admin continue to require Supabase Auth roles.

Current product direction keeps borrower selection simple: borrowers choose catalog items and quantities, while staff/backend assignment chooses exact manikins or inventory units. The target inventory model is documented as four operational modes: `manikin`, `tracked_unit`, `kit`, and `quantity_only`. Kits use the container as the return-critical unit; missing refillable contents should create staff notes/refill work rather than blocking the order return.

The active release SQL now implements that model with `equipments.inventory_mode`, `equipment_units`, `borrow_request_items.equipment_unit_id`, `kit_refill_tasks`, automatic unit status sync, and `staff_assign_inventory_unit_to_item`.

Borrow-form output must be template-first. The official `.docx` borrow form is the source of truth for layout, and generated output should fill that template while adding only a QR code or tracking ID in a page corner. Avoid rebuilding the form as freehand HTML/PDF if exact visual parity is required.

Wave 3 allocation data lives in:

- `equipments.allocation_type`: `rotating`, `room_dedicated`, or `advance_course_dedicated`
- `courses` and `course_reserved_manikins` for Advance course reservation blocking
- `manikin_allocation_type_audit` plus `audit_logs` for allocation type changes

The active frontend calls:

- `submit_public_borrow_request_v2` from checkout, with no borrower login required
- `submit_borrow_request` remains as an authenticated fallback RPC during rollout
- `get_my_borrow_requests` from history
- `transition_borrow_request_status` for borrower cancellation
- `admin_update_borrow_request_status` for admin status progression
- `get_borrow_request_status` for tracking/success
- `approver_l1_decide_request` for L1 approval/rejection
- `get_l1_approval_queue` for the L1 approval page
- `get_staff_dashboard_orders`, `confirm_pickup_with_snapshot`, and `confirm_return_with_snapshot` for staff operations
- `get_equipment_borrow_rules` for checkout warnings/blocking by allocation type
- `get_rotation_suggestions` and `staff_assign_manikin_to_item` for staff assignment guidance
- `staff_assign_inventory_unit_to_item` for exact tracked-unit or kit-container assignment
- `mark_overdue_borrow_requests` for the daily overdue job
- `get_kpi_report` for KPI reporting

## Current Verification Commands

```bash
npm run verify:current-mvp
npm run smoke:main-pages
npm run smoke:deploy-workflow
npm run verify:live-worker
```

`verify:current-mvp`, `smoke:main-pages`, and `smoke:deploy-workflow` validate the source and browser-level MVP contract. `verify:live-worker` validates that the deployed Cloudflare Worker can reach the production Supabase API and blocks disallowed paths. Production sign-off still requires live UAT of the borrower, L1, staff pickup/return, reject, overdue, and document-print flows with real SIMSET staff.

## Historical Docs

Older planning documents may mention previous routes and files from the redesign branch. Treat those as historical unless they explicitly reference this MVP route map.

For release staging, use `docs/RELEASE_SOURCE_SET.md` to decide what belongs in the release source set and what is local/generated output.
