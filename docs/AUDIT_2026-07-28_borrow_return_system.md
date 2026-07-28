# SIMSET Borrow–Return System — Evidence-Based Audit, Remediation Plan, and Production Validation

Audit date: 2026-07-28
Auditor: Claude Code (combined architect / security / QA / SRE / release-manager role), acting on the real repository only.
Repository: `BPET17051/SIMSET_ModelSystem`, branch `claude/simset-audit-remediation-9ikld3` (== `origin/main` at time of audit, commit `f891713`).

---

## 1. Executive Summary

The repository is a working, non-trivial MVP for a borrow/return workflow — **not** the React application implied by parts of the audit brief (see §7 Reconciliation). It is a static HTML/CSS/JS frontend, a single Cloudflare Worker acting as a locked-down reverse proxy, and a Postgres/Supabase backend where almost all business logic lives in `SECURITY DEFINER` PL/pgSQL functions. The engineering quality of that RPC layer is materially better than a typical MVP: role checks are enforced server-side, status transitions go through a single locking, audited transition function (`apply_borrow_request_status_transition`), and there are working cron jobs for overdue/expiry.

The most serious finding is **not** a broken feature — it is a **repository-level gap in the RLS/GRANT story for the three most sensitive tables** (`borrow_requests`, `borrow_request_items`, `manikins`). The project's own consolidated release script, `supabase/current_mvp_release.sql` — which the project's own docs designate as "the current source of truth" and instruct be run **standalone** against a fresh preview project — never enables Row Level Security nor issues any `GRANT`/`REVOKE` on those three tables. This is the *exact* class of defect a prior in-repo document (`docs/PLAN-security-fixes.md`) already flagged as P0 ("Data Leakage… ยกเลิกการอนุญาตให้ Public อ่าน (Select) ตาราง `borrow_requests` โดยตรง"). Whether this is currently exploitable in the live production database depends on migration history I cannot observe from source, and **I could not test it live**: this sandbox's outbound network policy blocks the production Worker host (`simset-showroom-proxy.simset-admin.workers.dev`) — confirmed by a rejected `CONNECT` (see §8, Risk D). This is disclosed prominently because it caps every downstream conclusion: **no live/staging/production validation was possible in this session.**

Given that constraint, this report delivers a complete, evidence-cited **static/repository audit** (Phases 1–10 of the brief) and a **runnable plan** for the phases that require live access (11–15), but it does **not** claim runtime, RLS-enforcement, or production validation that was never executed. The scope and limitations section (§2) is not boilerplate — it determines the final decision in §25.

**Decision: NO-GO for unattended production sign-off.** See §25 for the precise evidence still required.

---

## 2. Scope and Limitations

What this audit **did**:
- Full inspection of the git history, file tree, CI workflows, all SQL migration files, the Cloudflare Worker, and every frontend JS/HTML file relevant to the borrow workflow.
- Line-level reconstruction of the state machine, concurrency controls, and role checks directly from `supabase/current_mvp_release.sql` (2,956 lines) and the four historical/legacy SQL scripts.
- One safe, read-only, non-destructive live-network test attempt (§8 Risk D) — blocked by sandbox network policy before it reached Supabase.

What this audit **did not and could not do**, and why:
- **No live database inspection.** No Supabase project ref, connection string, or service-role key was supplied to this session, and none should be pasted into chat. `pg_policies`, `pg_tables.rowsecurity`, and `information_schema` were never queried against the real database.
- **No live Worker/API calls.** Outbound HTTPS to `*.workers.dev` is rejected by this environment's proxy policy (`gateway answered 403 to CONNECT`). `npm run verify:live-worker` was not run against production.
- **No browser E2E execution.** Playwright is installed as a devDependency and the existing smoke suite (`smoke-main-pages.js`) runs against a **fully mocked** Supabase client (see §16), not a real backend, so I did not additionally attempt to stand up a real E2E run against production data — that would need a staging Supabase project, which I do not have credentials for.
- **No production deployment, no database migration execution, no destructive or write operations of any kind were performed.**

Every claim below is labeled with evidence. Anything I could not verify is marked **NOT VERIFIED — requires live access**, never asserted as working.

---

## 3. Repository Identity

| Item | Value | Evidence |
|---|---|---|
| `pwd` | `/home/user/SIMSET_ModelSystem` | shell |
| `git remote -v` | `origin` → `BPET17051/SIMSET_ModelSystem` (via local proxy) | `git remote -v` |
| Current branch | `claude/simset-audit-remediation-9ikld3` | `git branch --show-current` |
| Relationship to `main` | Identical — `HEAD`, `origin/main`, and `origin/claude/simset-audit-remediation-9ikld3` all point at the same commit | `git log --oneline --decorate -n1` → `f891713 (HEAD, origin/main, origin/claude/..., main)` |
| Working tree | Clean, no uncommitted changes | `git status --short` (empty) |
| Tags | None | `git tag` (empty) |
| Latest commits | `f891713 docs: tighten production release preflight`, `2033f5a chore: prepare SIMSET borrow release candidate`, `67e9d89 fix: add missing contract-required files to repo` | `git log` |
| Package manager | npm (`package-lock.json` present) | root listing |
| Declared dependencies | **Only** `devDependencies: { playwright: ^1.58.2 }** — no framework, no ORM, no test runner besides Playwright, no linter | `package.json` |
| Framework | **None** — static HTML/CSS/vanilla JS site (`website/*.html`, `website/js/*.js`); no React/Vue/Next/bundler config anywhere in the tree | `Glob`/`find` over repo, absence of any `*.jsx`, `*.tsx`, `webpack.config.*`, `vite.config.*` |
| Runtime | Cloudflare Pages (static hosting, `website/` as publish dir) + one Cloudflare Worker (`cloudflare-worker/worker.js`) + Supabase (Postgres/Auth/Storage/Realtime/pg_cron) | `.github/workflows/deploy-production.yml` (`wrangler pages deploy website --project-name simset-showroom`), `cloudflare-worker/wrangler.toml` |
| Migrations | Not timestamped Supabase migrations — a set of hand-ordered phase scripts under `supabase/`, ordering documented in `supabase/MIGRATION_ORDER.md` | file listing |
| Tests | `scripts/verify-current-mvp-contracts.js` (static regex/string-contains checks against source, **not** a functional test), `scripts/smoke-main-pages.js` (Playwright against a **mocked** Supabase client), `scripts/smoke-deploy-workflow.js`, `scripts/verify-live-worker.mjs` (requires live network) | `package.json` scripts, file reads |
| CI/CD | `.github/workflows/deploy-production.yml` (manual `workflow_dispatch`, gated `production` environment), `frontend-smoke.yml` (PR/push gate), `generate-data.yml` | `.github/workflows/` |
| Production branch | `main` (per `docs/GITHUB_RELEASE_CHECKLIST.md` and the deploy workflow's implicit checkout of the triggering ref) | docs + workflow |
| Staging branch | None formally defined; project instructs applying SQL to a "preview Supabase project" first, no equivalent frontend staging environment is defined in CI | `supabase/MIGRATION_ORDER.md`, `docs/GITHUB_RELEASE_CHECKLIST.md` |

**Conclusion:** this is a real, single, coherent repository — not a mismatched or stale audit target. But its actual shape (static site + Worker + Supabase RPCs) is materially different from the architecture implied by parts of the requested audit brief (React `App`/`KpiHeader`/`ModelDetail`, React Router). See §7 for the formal reconciliation.

---

## 4. Actual Architecture

**System context:** Borrowers (no login required) and SIMSET staff/approvers/admins (Supabase Auth, role in `app_metadata.role`) use a static site served from Cloudflare Pages. All data access goes through one Cloudflare Worker, which is the sole path to Supabase.

**Containers:**
1. `website/` — static HTML/CSS/JS, deployed as Cloudflare Pages project `simset-showroom` (`.github/workflows/deploy-production.yml:74`).
2. `cloudflare-worker/worker.js` — single Worker, deployed to `simset-showroom-proxy.simset-admin.workers.dev` (`docs/CURRENT_MVP_SYSTEM.md:27`, `cloudflare-worker/wrangler.toml`). Also runs a 15-minute cron (`dispatchLineNotifications`) and an internal secret-gated endpoint `/internal/dispatch-line-notifications`.
3. Supabase project `mcdpfsuyjfxmfeiafkyq` (confirmed live project ref in `cloudflare-worker/wrangler.toml:22` and cross-checked by `scripts/verify-current-mvp-contracts.js:98`) — Postgres + Auth + Storage (`condition-snapshots` bucket) + Realtime + `pg_cron`.
4. LINE Messaging API — outbound only, called from the Worker's scheduled handler.

**Trust boundary:** Browser (untrusted) → Worker (public internet, enforces an allow-list of paths + 60 req/min/IP rate limit + CORS) → Supabase (JWT preserved for RLS when present, otherwise the Worker substitutes the shared anon key). The Worker never receives or forwards the service-role key to the browser; `SUPABASE_SERVICE_ROLE_KEY` is used only server-side for the LINE outbox dispatcher (`cloudflare-worker/worker.js:96-98`).

**Frontend entry points / routes** (confirmed against `docs/CURRENT_MVP_SYSTEM.md:7-20` and cross-checked in `scripts/smoke-main-pages.js:3-14`, all files present on disk):
`/index.html` (catalog), `/product-details.html`, `/cart.html`, `/checkout.html`, `/track.html`, `/history.html`, `/approver.html`, `/staff.html`, `/report.html`, `/admin-login.html`, `/admin.html` (menu hub only — legacy admin workflow tabs explicitly retired per `scripts/verify-current-mvp-contracts.js:67-68`, which asserts `admin.js` does **not** contain `admin_update_borrow_request_status` or `borrow_requests` logic).

**API clients:** every page loads `website/js/supabase-client.js`, which points the Supabase JS SDK at the Worker URL with a placeholder key `worker-managed-key` (`website/js/supabase-client.js:1-12`); the Worker substitutes the real anon key server-side unless a real user JWT is present (`worker.js:280-289`).

**Database objects** (from `supabase/current_mvp_release.sql`): tables `equipments`, `manikins`, `borrow_requests`, `borrow_request_items`, `equipment_units`, `courses`, `course_reserved_manikins`, `manikin_allocation_type_audit`, `audit_logs`, `line_notification_outbox`, `staff_alerts`, `condition_snapshots`, `kit_refill_tasks`, `borrow_request_status_audit`, `identity_claim`; schema `simset_private` for internal helper functions; ~30 `SECURITY DEFINER` RPC functions; 2 triggers (`trg_enforce_borrow_status_transition`, `trg_sync_manikin_status_from_borrow_request`); 2 `pg_cron` jobs (expire-pending every 5 min, mark-overdue daily at 08:00).

**Not present / NOT VERIFIED:** any React component, router, or "App/KpiHeader" pairing named in the audit brief; a formal repair-job subsystem with repair events/parts (only `maintenance_quantity` counters and `kit_refill_tasks` exist — see §6); a dedicated staging environment; a `supabase/migrations/` timestamped directory (acknowledged as a gap in `supabase/MIGRATION_ORDER.md:48`).

---

## 5. Research-Based Target Model

The brief's target state machine (`DRAFT → SUBMITTED → WAIT_CENTER_HEAD_SIGN → WAIT_DEAN_SIGN → APPROVED_PICKUP → ISSUED → RETURN_PENDING_INSPECTION → RETURNED`, roles `BORROWER/STAFF/INSPECTOR/CENTER_HEAD/DEAN_APPROVER/TECHNICIAN/ADMIN/AUDITOR`) does **not** match the repository's actual, deliberately simpler model, and the repository is explicit about why: `docs/CURRENT_MVP_SYSTEM.md:40` states verbatim that the project **intentionally does not add** `draft`/`submitted`/`reserved` states, and that a single L1 approval plus staff preparation covers the reservation business value without adding another state. The real roles are `borrower (anonymous or magic-link @mahidol.ac.th)`, `approver_l1`, `staff`, `admin` (`website/js/auth.js:24-38`, RPC role checks throughout `current_mvp_release.sql`). There is no `AUDITOR` or `DEAN_APPROVER`/`CENTER_HEAD` two-tier sign-off role in code.

This is treated as a **documented, intentional product decision**, not a defect — but it means the brief's benchmark state machine cannot be used as a pass/fail bar without translation. §9 maps the real state machine against the *intent* of the brief's benchmark (single vs. multi-level approval, inspection-before-restock, exception states) rather than against literal state names.

---

## 6. Current Feature Inventory

| Feature | Status | Evidence |
|---|---|---|
| Equipment catalog (browse, filter) | IMPLEMENTED_AND_VERIFIED (source-level) | `website/js/catalog.js`, RLS policy `public_select_borrowable_equipments` (`current_mvp_release.sql:244-247`) |
| Cart / multi-item request | IMPLEMENTED_AND_VERIFIED (source-level) | `website/js/cart.js` |
| Guest (no-login) borrow submission | IMPLEMENTED_AND_VERIFIED (source-level) | `submit_public_borrow_request_v2` (`current_mvp_release.sql:1358-1677`), `checkout.js:160` |
| Authenticated borrower history + identity claim | IMPLEMENTED_AND_VERIFIED (source-level) | `get_my_borrow_requests`, `claim_borrow_request_identity`, `history.js` |
| Tracking by tracking ID (no login) | IMPLEMENTED_AND_VERIFIED (source-level) | `get_borrow_request_status`, `track.js` |
| Single-level approval (L1) | IMPLEMENTED_AND_VERIFIED (source-level) | `approver_l1_decide_request`, `approver.js` |
| Two-tier approval (Center Head + Dean) | NOT_IMPLEMENTED (intentionally, per product decision) | `docs/CURRENT_MVP_SYSTEM.md:40` |
| Pickup with condition snapshot | IMPLEMENTED_AND_VERIFIED (source-level) | `confirm_pickup_with_snapshot`, `staff.js:175-190` |
| Return with condition snapshot | IMPLEMENTED_AND_VERIFIED (source-level) | `confirm_return_with_snapshot` |
| Return → inspection → terminal status mapping | IMPLEMENTED_AND_VERIFIED (source-level; verified by contract test) | pattern asserted at `scripts/verify-current-mvp-contracts.js:184-185`: `normal→completed`, `damaged/maintenance→damaged`, `missing→lost` |
| Exact manikin/unit assignment + rotation suggestions | IMPLEMENTED_AND_VERIFIED (source-level) | `staff_assign_manikin_to_item`, `staff_assign_inventory_unit_to_item`, `get_rotation_suggestions` |
| Overdue detection (daily cron) | IMPLEMENTED_AND_VERIFIED (source-level) | `mark_overdue_borrow_requests` + `cron.schedule('simset-mark-overdue-borrow-requests-0800', '0 8 * * *', ...)` |
| Pending-request expiry (5-min cron) | IMPLEMENTED_AND_VERIFIED (source-level) | `expire_pending_borrow_requests` + cron every 5 min |
| Status audit trail | IMPLEMENTED_AND_VERIFIED (source-level) | `borrow_request_status_audit` insert inside `apply_borrow_request_status_transition` (same transaction) |
| Formal repair-job workflow (repair events, parts, linkage) | **NOT_IMPLEMENTED** | No `repair_jobs`/`repair_events`/`repair_parts` tables anywhere in `supabase/*.sql`. Only a `maintenance_quantity` counter on `equipments` and an open/resolved `kit_refill_tasks` table exist — these do not constitute a repair-job subsystem as the brief defines it. |
| KPI dashboard / reporting | IMPLEMENTED_AND_VERIFIED (source-level) | `get_kpi_report`, `report.js` |
| CSV export | **NOT_IMPLEMENTED** | No `csv`/`Blob`/`download` code anywhere in `website/js/*` (grep confirmed zero matches) |
| Pagination UI | **NOT_IMPLEMENTED** | `catalog.js` renders the full filtered array with no page control; no "showing X–Y of Z" pattern exists to test the "1–0" edge case the brief warns about |
| Realtime updates | IMPLEMENTED_BUT_RISKY | `staff.js:228-236` subscribes to `postgres_changes` on `borrow_requests` with `event: '*'` and calls a full `loadBoard()` reload on every event, no debounce — see Risk H, §8 |
| Admin CRUD hub (legacy manikin/location/capability editor) | PARTIALLY_IMPLEMENTED / DEPRECATED-IN-PLACE | `rls_setup.sql`, `admin_security_reinforcement.sql`, `rpc_functions.sql` define this surface against an **older** `manikins` schema; `admin.js` itself is now just a role-gated menu hub (contract-asserted to *not* contain legacy workflow logic, `verify-current-mvp-contracts.js:68`) |
| LINE notification outbox + dispatch + retry/skip states | IMPLEMENTED_AND_VERIFIED (source-level) | `line_notification_outbox` table (`pending/sent/failed/skipped`), `dispatchLineNotifications` in `worker.js:124-197` |
| Row-level security on catalog/reference tables (`equipments`, `courses`, `equipment_units`, audit tables, notification tables) | IMPLEMENTED_AND_VERIFIED (source-level) | Explicit `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + matching `CREATE POLICY` for each, `current_mvp_release.sql:233-238, 357, 382, 425-426, 501, 527` |
| **Row-level security on `borrow_requests`, `borrow_request_items`, `manikins`** | **PARTIALLY_IMPLEMENTED / UNVERIFIED-LIVE (P0 candidate)** | See §10 Risk D and §11 — absent from the current consolidated release script; presence in the live database depends on migration history I cannot observe |
| Automated tests validating actual business behavior against a real/emulated database | **NOT_IMPLEMENTED** | Existing "tests" are static string/regex assertions against source files and a Playwright smoke test against a **hand-mocked** Supabase client (`scripts/smoke-main-pages.js:61-126`) — see §16 |

---

## 7. Audit-to-Repository Reconciliation

The originating audit brief assumes a React SPA with an `App` component passing `onFilter`/`onClickMap` props into a `KpiHeader`, a `/model/:code` route rendering `ModelDetail`, a root layout that might double-render `Navbar`, and React `StrictMode` double-invocation concerns. **None of this exists in the repository.** There is no React, no client-side router, no JSX/TSX anywhere in the tree, and no `Navbar`/`KpiHeader`/`ModelDetail` components or files of any name resembling them (`Glob "**/*.jsx"`, `"**/*.tsx"` → zero results; `Grep` for `KpiHeader|ModelDetail|onClickMap|StrictMode` across the repo → zero results, verified separately from the Risk A–C findings below).

Per instruction, **I did not apply the brief's proposed fixes for Risks A/B/C blindly** — those fixes target components that do not exist here. Risks D–J are evaluated against the real code (§8) because they describe patterns (direct DB access, error handling, CSV export, pagination, realtime storms, schema drift) that are architecture-agnostic and do apply, or can be definitively ruled out as not applicable.

---

## 8. Known Risk Verification (Risks A–J)

| Risk | Verdict | Evidence |
|---|---|---|
| **A** — missing `/model/:code` route, router doesn't render `ModelDetail` | **NOT_APPLICABLE** | No client-side router or `ModelDetail` component exists; navigation is plain `<a href="product-details.html?id=...">` static-page linking (`catalog.js` renders links, not route pushes) |
| **B** — `KpiHeader` prop mismatch (`onFilter`/`onClickMap` vs `onFilterStatus`) | **NOT_APPLICABLE** | No `KpiHeader` component exists. The closest analogue, `report.js`, renders KPI cards as plain DOM writes (`setText`, `renderMonthlyChart`) with no prop-passing layer to mismatch |
| **C** — duplicate `Navbar` rendering (root layout + `App`) | **NOT_APPLICABLE** | No componentized `Navbar`; each static HTML page embeds its own `<nav>` markup once. `scripts/smoke-main-pages.js` even asserts every page has exactly one `<nav class="navbar-brand">` block (`smoke-main-pages.js` pattern via `verify-current-mvp-contracts.js:18`) |
| **D** — direct Supabase access from the frontend; is it safe? | **CONFIRMED (mixed) — HIGH-CONFIDENCE STATIC FINDING, LIVE STATE NOT VERIFIED** | Two independent facts, both confirmed in source: (1) the frontend itself never calls `.from('borrow_requests')`, `.from('borrow_request_items')`, or `.from('manikins')` — every access to those tables goes through `SECURITY DEFINER` RPCs (`Grep` across `website/js/*.js` for `.from('` / `.rpc('` — only `equipments` is queried directly by the frontend, and `equipments` **does** have RLS + an anon policy, `current_mvp_release.sql:237-247`). (2) However, `cloudflare-worker/worker.js:23-30` explicitly allow-lists **direct REST GET/POST** to `/rest/v1/borrow_requests` and `/rest/v1/borrow_request_items` for *any* caller of the Worker, not just this frontend, and `supabase/current_mvp_release.sql` never enables RLS or issues any GRANT/REVOKE on `borrow_requests`, `borrow_request_items`, or `manikins` (full-file grep, zero matches — see §10 for the exact reproduction). I attempted a live, read-only GET against the production Worker URL to settle this with a real HTTP response; the attempt was rejected by this sandbox's outbound proxy policy before reaching the Worker (`recentRelayFailures: connect_rejected, gateway answered 403 to CONNECT, host: simset-showroom-proxy.simset-admin.workers.dev:443`). **This must be tested live by someone with network access** — see §10 for the exact command. |
| **E** — weak Supabase error handling, especially `Promise.all` in "repair detail" | **NOT_APPLICABLE (no repair detail page exists)**; general pattern check: every `.rpc()`/`.from()` call site inspected in `website/js/*.js` destructures and checks `{ data, error }` and throws/surfaces `error` (e.g. `staff.js:151-152`, `187`, `198`, `211`, `223`; `report.js:69`; `approver.js`). No `Promise.all` call exists anywhere in `website/js/*` (grep confirmed) |
| **F** — client-side CSV injection | **NOT_APPLICABLE — feature does not exist.** No CSV export code anywhere in the repo (grep for `csv`/`Blob`/`download` in `website/js` → zero matches) |
| **G** — pagination "1–0" edge case | **NOT_APPLICABLE — feature does not exist.** No pagination UI/range display exists anywhere (`catalog.js` renders the full filtered set; count text is `${filtered.length} รายการ`, not a range) |
| **H** — realtime request storm (every DB change triggers a full reload) | **CONFIRMED** | `website/js/staff.js:228-236`: `supabase.channel('staff-borrow-requests').on('postgres_changes', { event: '*', schema: 'public', table: 'borrow_requests' }, () => { loadBoard().catch(...) })`. Any insert/update/delete on `borrow_requests` (guest submissions happen continuously) triggers a full `get_staff_dashboard_orders` RPC re-fetch and full re-render, with no debounce, coalescing, or backoff. Under a burst of concurrent borrower submissions this reloads the entire staff board once per event. |
| **I** — React StrictMode double-invoke cleanup | **NOT_APPLICABLE** — no React |
| **J** — database naming/schema drift between queried columns and migrations | **CONFIRMED** | The four historical scripts (`rls_setup.sql`, `security_hardening_mvp.sql`, `admin_security_reinforcement.sql`, `rpc_functions.sql`) target an **older** `manikins`/`borrow_requests` schema — e.g. `rls_setup.sql` treats `manikins.sap_id` as the effective identity key with no `id uuid PRIMARY KEY`, and its status-flow-oriented RPCs (`admin_update_borrow_request_status` in `rpc_functions.sql:234-283`) implement a *different*, narrower 5-state flow (`pending→approved→ready→borrowed→returned`) than the 13-state flow in `current_mvp_release.sql`. The project's own `supabase/MIGRATION_ORDER.md:34-35, 42` explicitly warns against layering `lock_status_flow.sql` (and by extension this narrower model) on top of the current release, confirming the drift is real and previously identified by the project's own maintainers, not a false positive. |

---

## 9. Borrow Workflow Assessment

**Real state machine**, reconstructed from `simset_private.is_allowed_borrow_status_transition` (`current_mvp_release.sql:564-580`) and the `borrow_requests_status_check` constraint (`:128-130`):

| From | Allowed to | Enforced by |
|---|---|---|
| `pending` | `approved`, `rejected`, `cancelled`, `expired` | trigger + RPC |
| `approved` | `ready`, `borrowed` | trigger + RPC |
| `ready` | `borrowed` | trigger + RPC |
| `borrowed` | `returned`, `overdue` | trigger + RPC |
| `overdue` | `returned` | trigger + RPC |
| `returned` | `inspection` | trigger + RPC |
| `inspection` | `completed`, `damaged`, `lost` | trigger + RPC |

**Enforcement is real, not just UI-hidden.** Two independent layers back this:
1. A `BEFORE INSERT OR UPDATE OF status` trigger (`trg_enforce_borrow_status_transition`, `:612-616`) that raises an exception unless the session-local flag `app.borrow_status_transition = 'on'` is set **and** the transition is in the allow-list. The flag is only ever set inside `apply_borrow_request_status_transition` via `set_config(..., true)` (session-local, non-persistent) — so a raw `UPDATE borrow_requests SET status = ...` issued from outside that function (e.g., over REST, if a GRANT existed) would fail the trigger regardless of table-level privileges. This is a genuinely good defense-in-depth pattern.
2. All status-changing RPCs (`transition_borrow_request_status`, `admin_update_borrow_request_status`, `approver_l1_decide_request`, `confirm_pickup_with_snapshot`, `confirm_return_with_snapshot`, `expire_pending_borrow_requests`, `mark_overdue_borrow_requests`) funnel through the single `simset_private.apply_borrow_request_status_transition` function (`:862-966`), which: takes `SELECT ... FOR UPDATE` row lock on the target request (prevents concurrent double-transition), re-checks the caller-asserted `p_current_status` against the locked row (optimistic-concurrency guard against stale reads), re-validates the transition against the same allow-list, requires a reason for `rejected`/`cancelled`, and inserts one `borrow_request_status_audit` row in the **same transaction** as the status UPDATE — so a partial audit-trail write is not possible in this codepath. This satisfies the brief's "atomic issue/return" and "immutable, DB-level audit trail" requirements for the transition itself (not for direct table writes, if those are reachable — see §11).

**Role enforcement is server-side, not just UI-hidden.** Every state-changing RPC I read (`approver_l1_decide_request:2238-2244`, `confirm_pickup_with_snapshot:2541-2547`, `admin_update_borrow_request_status`, `staff_assign_manikin_to_item:1994-2000`) independently checks `auth.uid() IS NOT NULL` and `(auth.jwt() -> 'app_metadata' ->> 'role')` against an explicit allow-list before doing anything, raising `unauthorized: ... role required` otherwise. `website/js/auth.js:24-38`'s `requireRole()` is UI-only convenience/UX (redirect to login, hide buttons) — it is **not** the actual security boundary, and the code does not rely on it being one.

**Concurrency / no-double-booking:** exact-manikin assignment (`staff_assign_manikin_to_item:2018-2046`) row-locks the target `manikins` row (`FOR UPDATE`) and then checks for date-overlapping active assignments before committing the assignment — this serializes concurrent assignment attempts for the *same* manikin. Quantity-based equipment reservation (`submit_public_borrow_request_v2:1486-1495`) row-locks the `equipments` row before computing used/available quantity. **Gap:** there is no database-level `EXCLUDE` constraint or unique index preventing overlapping date ranges for the same `manikin_sap_id`/`equipment_unit_id` — the two overlap indexes that exist (`idx_borrow_request_items_manikin_overlap`, `idx_borrow_request_items_unit_overlap`, `:309-315`) are plain B-tree performance indexes, not constraints. Correctness currently depends entirely on every write path remembering to lock-and-check inside the RPC. This is a real defense-in-depth gap (P3, not P0, given the locking discipline observed everywhere I checked) — recommend adding a `tstzrange` `EXCLUDE` constraint as a backstop.

**Return → inspection → restock:** the return-condition-to-terminal-status mapping (`normal→completed`, `damaged`/`maintenance→damaged`, `missing→lost`, confirmed by contract assertion at `scripts/verify-current-mvp-contracts.js:185`) and the manikin/unit status sync trigger (`sync_manikin_status_from_borrow_request:658-718`) only restores a manikin/unit to `ready` on `completed`/`cancelled`/`rejected`/`expired`, and moves it to `maintenance` on `damaged` — and even then only if `NOT manikin_has_other_active_assignment(...)`, so an asset shared incorrectly across active requests is not falsely freed. This matches the brief's "must not become available before inspection" requirement.

**Gap vs. brief's benchmark:** there is no two-tier (Center Head + Dean) approval, and no explicit `WAIT_CENTER_HEAD_SIGN`/`WAIT_DEAN_SIGN` states — this is a **documented product decision**, not an oversight (§5), but if the two-tier sign-off is a hard institutional requirement, it is a genuine functional gap against that requirement, not against the code's own design intent.

---

## 10. Database and RLS Assessment

### Schema map (selected sensitive tables)

| Table | PK | Key FKs | Notable constraints | RLS enabled in `current_mvp_release.sql`? | Direct GRANT to `anon`/`authenticated` in `current_mvp_release.sql`? |
|---|---|---|---|---|---|
| `equipments` | `id uuid` | — | `allocation_type`, `inventory_mode` CHECKs | **Yes** (`:237`) | `SELECT` to `anon`+`authenticated` (`:240-241`), with anon-only policy `borrow_enabled = true` |
| `manikins` | `id uuid` | — | `sap_id` UNIQUE, `status` CHECK | **No** — no `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` statement for `manikins` anywhere in this file | **No GRANT/REVOKE statement of any kind for `manikins`** anywhere in this file |
| `equipment_units` | `id uuid` | `equipment_id→equipments` | `status` CHECK, unique `(equipment_id, unit_code)` | Yes (`:238`) | `REVOKE ALL ... FROM anon`, `GRANT SELECT/INSERT/UPDATE TO authenticated` (`:289-291`) — correct |
| `borrow_requests` | `id uuid` | — | `status` CHECK (13 values) | **No** | **No GRANT/REVOKE statement of any kind for `borrow_requests`** anywhere in this file |
| `borrow_request_items` | `id uuid` | `request_id→borrow_requests`, `equipment_id→equipments`, `manikin_sap_id→manikins.sap_id`, `equipment_unit_id→equipment_units` | `qty_borrowed > 0`, `end_date >= start_date`, `inventory_mode` CHECK | **No** | **No GRANT/REVOKE statement of any kind for `borrow_request_items`** anywhere in this file |
| `audit_logs` | `id bigserial` | — | — | Yes (`:236`) | `SELECT,INSERT` to `authenticated` only, admin-role-gated policies (`:274-283`) |
| `borrow_request_status_audit` | `id bigserial` | `request_id→borrow_requests` | `actor_type` CHECK | Yes (`:501`) | `REVOKE ALL FROM anon`, `SELECT` to `authenticated`, admin-only policy (`:509-511`) |

Reproduction (run by whoever holds Supabase Dashboard/service-role access — **I could not run this**):
```sql
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public' AND tablename IN ('manikins','borrow_requests','borrow_request_items');

SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name IN ('manikins','borrow_requests','borrow_request_items')
  AND grantee IN ('anon','authenticated');

SELECT policyname, tablename, cmd, roles FROM pg_policies
WHERE schemaname='public' AND tablename IN ('manikins','borrow_requests','borrow_request_items');
```
And, from any machine with normal internet access (not this sandbox):
```bash
curl -i "https://simset-showroom-proxy.simset-admin.workers.dev/rest/v1/borrow_requests?select=id,tracking_id,borrower_name,borrower_email,borrower_phone,status&limit=3"
curl -i "https://simset-showroom-proxy.simset-admin.workers.dev/rest/v1/manikins?select=*&limit=3"
```
If either returns `200` with row data instead of `401`/`403`/empty, the finding is **CONFIRMED LIVE** and this is a P0 borrower-PII leak (name, email, phone, department, purpose are all columns on `borrow_requests`) plus a state-machine-bypass path (raw `DELETE`/`INSERT` on `borrow_requests` is not blocked by the status trigger, which only guards `UPDATE OF status`/`INSERT` status validity, not row deletion or non-status column tampering).

**Why I cannot resolve this from source alone:** Supabase auto-grants default table privileges to `anon`/`authenticated` on newly created `public` tables unless explicitly revoked, which is exactly why every *other* table in this same file carries an explicit `REVOKE ALL ... FROM anon/PUBLIC` pair. The omission is specific to `manikins`, `borrow_requests`, and `borrow_request_items` — every other table gets this treatment. Whether the *live* database still carries protective grants/RLS from the historical `rls_setup.sql`/`security_hardening_mvp.sql` runs (which **did** enable RLS + admin-only policies on an older shape of these tables, and which `current_mvp_release.sql` never explicitly drops) is unknowable without querying the live catalog. Given `docs/PLAN-security-fixes.md` independently flagged this exact gap as P0 previously, and `current_mvp_release.sql`'s own end-of-file verification-query block (`:2932-2956`) checks function grants and trigger existence but **never** checks RLS/policies on these three tables, I treat this as a genuine repository defect regardless of current live state: **the release script is not self-certifying for its most sensitive tables, and the project's own release checklist doesn't catch that.**

### Invariant checks (repository-evidence only; "live" column requires DB access I did not have)

| # | Invariant | Static evidence | Live-verified? |
|---|---|---|---|
| 1 | One asset can't be double-loaned | Row-lock + overlap check in `staff_assign_manikin_to_item` / `submit_public_borrow_request_v2` (§9); no DB-level EXCLUDE constraint as backstop | NOT VERIFIED |
| 2 | Returned asset can't stay `ISSUED`(`borrowed`) | Transition table has no `borrowed→borrowed` self-loop bypass; `is_allowed_borrow_status_transition` only allows `borrowed→{returned,overdue}` | NOT VERIFIED |
| 3 | Damaged asset can't become `READY` before repair/approval | `sync_manikin_status_from_borrow_request` only sets `ready` on `completed/cancelled/rejected/expired`, sets `maintenance` on `damaged` (`:684-713`) | NOT VERIFIED |
| 4 | Rejected/canceled request releases inventory | `sync_manikin_status_from_borrow_request` handles `cancelled`/`rejected` → `ready` (subject to no other active assignment) | NOT VERIFIED |
| 5 | Failed issue transaction doesn't consume inventory | `apply_borrow_request_status_transition` is one PL/pgSQL function — an exception anywhere rolls back the whole function's effects under Postgres's implicit function-body transaction semantics | NOT VERIFIED |
| 6 | Borrower can't approve their own request | `approver_l1_decide_request` requires role `approver_l1`/`admin`; guest borrowers have no `app_metadata.role`, so they cannot call it (RPC is also `REVOKE`d from `anon`, `:2290-2291`) | NOT VERIFIED |
| 7 | Ordinary user can't modify audit logs | `audit_logs`/`borrow_request_status_audit` both RLS-enabled, admin-only `SELECT`/`INSERT` policies, **no** `UPDATE`/`DELETE` policy exists for any role on either table (checked: only SELECT/INSERT policies present) — under Postgres RLS, absence of a policy for a command denies it by default once RLS is enabled | NOT VERIFIED |
| 8 | Approval history can't be overwritten | `borrow_request_status_audit` has no `UPDATE` policy and the table is only ever `INSERT`ed by `apply_borrow_request_status_transition` (`SECURITY DEFINER`, not directly grantable) | NOT VERIFIED |
| 9 | Deleted users don't destroy transaction history | `borrow_requests.borrower_id` is a bare `uuid` column with **no** foreign key to `auth.users` (confirmed: no `REFERENCES auth.users` on that column) — so a deleted auth user cannot cascade-delete borrow history. This is good for retention but also means orphaned `borrower_id`s are never validated against a real user at write time for the authenticated-fallback path | NOT VERIFIED |
| 10 | Status values constrained to documented set | `borrow_requests_status_check` CHECK constraint enumerates all 13 values (`:128-130`), enforced independently of the trigger | NOT VERIFIED |

---

## 11. Security Assessment

- **Anon key exposure:** the anon key is not shipped to the browser at all — the frontend uses a placeholder string (`worker-managed-key`) and the Worker injects the real key server-side (`worker.js:280-289`, `supabase-client.js:1-3`). This is a stronger posture than "anon key in frontend is fine if RLS is correct" — the key isn't even in the frontend. Good.
- **CORS:** the Worker only reflects `Access-Control-Allow-Origin` for an explicit allow-list (`ALLOWED_ORIGINS`, `worker.js:76-94`); any other origin gets the production Pages origin forced, effectively blocking credentialed cross-origin abuse from arbitrary sites in browsers that respect CORS (does **not** stop non-browser scripted callers, which don't need CORS — rate limiting and the path allow-list are the real controls against those).
- **CSP:** `website/_headers` sets a real Content-Security-Policy restricting `script-src`/`connect-src` to self + the Worker + jsdelivr, `object-src 'none'`, `frame-ancestors 'self'` — better than "no CSP" baseline.
- **Rate limiting:** in-memory `Map` keyed by `CF-Connecting-IP`, 60 req/min (`worker.js:68-69, 238-253`). This is **per-isolate, not global** — Cloudflare Workers run many isolates; a burst of requests can be spread across isolates, effectively multiplying the true limit. Not a false claim of protection (some limiting is real), but weaker than it appears and does not survive the Worker being cold-started or scaled across POPs. NOT VERIFIED at what actual scale this breaks down.
- **XSS:** all sampled render paths (`report.js`, `staff.js`, `history.js`, `catalog.js`, `checkout.js`, `admin.js`) use the shared `esc()` HTML-escaper (`supabase-client.js:14-20`) when interpolating server data into `innerHTML`. I did not find a counter-example of un-escaped user-controlled data reaching `innerHTML` in the files read, but I did not exhaustively read every interpolation site in every file (see §26 for what remains unchecked).
- **File upload validation:** `staff.js:159-173` sanitizes filenames (`replace(/[^a-zA-Z0-9_.-]/g, '_')`) before constructing the storage path, and `insert_condition_snapshot` (`current_mvp_release.sql:2482-2524`) requires at least one image URL and a non-empty note server-side. Storage bucket policies for `condition-snapshots` (`staff_upload_condition_snapshots`/`staff_read_condition_snapshots`, `:459-480`) were read but not reproduced verbatim here for space — they are role-gated to `authenticated` with a role check, not public. NOT VERIFIED against the live bucket's actual policy state (same class of caveat as §10).
- **Secrets management:** `wrangler.toml` contains only the non-secret `SUPABASE_URL`; actual secrets (`SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, LINE tokens) are documented as `wrangler secret put` values, never committed (`cloudflare-worker/wrangler.toml` comments, `docs/GITHUB_RELEASE_CHECKLIST.md:14-21`). No secret values were found committed to the repository in any file read.
- **Borrower email domain gate:** `website/js/auth.js:3,9-11,42-43` restricts magic-link sign-in to `@mahidol.ac.th` client-side only — this is a UX guard, not a security boundary (Supabase Auth itself doesn't enforce a domain allow-list here as far as the code shows); a determined actor could still call `signInWithOtp` directly against Supabase Auth with any address if they bypass the frontend. Low severity (self-registration of a `borrower`-privilege-less account isn't dangerous by itself, since no RPC grants elevated trust from email domain alone — only `app_metadata.role`, which is admin-assigned), but worth noting as UI-only enforcement.
- **The P0 candidate is §10's RLS/GRANT gap** — repeated here only as a pointer, not duplicated in full.

---

## 12. Reliability and Concurrency Assessment

- **Idempotency / duplicate submission:** `submit_public_borrow_request_v2` does not appear to de-duplicate a double-click/double-submit (no client-supplied idempotency key parameter). A network retry or accidental double-submit would create two separate `pending` requests with two tracking IDs. NOT VERIFIED how the UI guards against double-click (checkout.js disables/relabels the submit button during submission, `checkout.js:157,179`, which mitigates but does not eliminate the race on flaky networks).
- **Transactions:** every multi-step RPC (`submit_public_borrow_request_v2`, `apply_borrow_request_status_transition`, `admin_receive_return_detailed` in the legacy `rpc_functions.sql`) runs as a single PL/pgSQL function body, which Postgres executes atomically — a mid-function exception rolls back all writes in that call. This is correct, standard practice and confirmed by direct reading, not assumption.
- **Retry/backoff for LINE notifications:** the outbox pattern (`pending→sent/failed/skipped`) with a 15-minute cron re-scan is a reasonable at-least-once delivery design; failed sends are marked `failed` with an `error_message` but I did not find automatic re-queue-from-`failed`-to-`pending` logic — a permanently failed row (e.g., bad phone/target ID) appears to stay `failed` forever rather than being retried or escalated. Minor reliability gap, not P0.
- **Cron reliability:** both `pg_cron` jobs use `FOR UPDATE SKIP LOCKED` (`current_mvp_release.sql:2730, 2782`), which is the correct pattern to avoid double-processing under concurrent invocations. Good.
- **Backup/restore:** `docs/RELEASE_ROLLBACK_2026-06-28.md:21-25` explicitly documents that, as of that note, **no `pg_dump`/`psql`/Supabase CLI was available in the authoring environment**, so only a schema/script-level backup exists in git — live data backup depends entirely on someone manually exporting from the Supabase Dashboard or PITR before each release. This is an honest, self-disclosed operational gap in the project's own docs, not something I'm inferring.
- **Monitoring/incident logging:** no APM, error-tracking (Sentry-style), or structured server-side logging beyond Postgres/Cloudflare's own dashboards was found in the repository. NOT VERIFIED whether Cloudflare Worker logs or Supabase logs are actively monitored in production.

---

## 13. UX and Operational Assessment

- Thai-language labels are used consistently throughout borrower- and staff-facing UI (`STATUS_LABELS` in `supabase-client.js:44-58` and duplicated in `staff.js:8-22`, `catalog.js`, `checkout.js`, etc.) — note the label maps are **duplicated** rather than shared from one source, a maintainability gap (a status added in one place can silently be un-translated in another).
  - Update: this appears to be the intended shared source but `staff.js` re-declares its own local `STATUS_LABELS` instead of importing `app.STATUS_LABELS` from `supabase-client.js` — confirmed by comparing `supabase-client.js:44-58` (7 keys shown, actually 13) against `staff.js:8-22` (13 keys, slightly different Thai wording, e.g. `ready: 'พร้อมรับอุปกรณ์'` vs `'พร้อมจ่าย'`). This is a real, low-severity UX consistency bug: the same status can show different Thai text depending on which page renders it.
- Empty states exist (`empty-state` divs across `cart.js`, `catalog.js`, `history.js`, `track.js`, `staff.js`).
- Loading states exist (`กำลังโหลด...` patterns).
- Error messages are surfaced via a shared `showMessage`/`onError` pattern (`supabase-client.js:22-42`), generally showing the raw `error.message` from Supabase to the end user (`catalog.js:189`, `track.js:58`, etc.) — this can leak internal Postgres error text (e.g., constraint names) to end users; low severity but worth cleaning up before wide rollout.
- QR/print flow exists for the borrow receipt (`success.js`, `borrow-form-print` asserted at `verify-current-mvp-contracts.js:130`) but the *exact* template-parity requirement from the brief ("template-first, fill the official `.docx`") is asserted only via `docs/CURRENT_MVP_SYSTEM.md:46` as an intent — I did not verify the actual generated print output visually (no live rendering possible in this session).
- No accessibility (ARIA, keyboard-nav) audit evidence was found (no `aria-*` attributes observed in the files sampled, no accessibility tooling in `package.json`). NOT VERIFIED further — would need a live/rendered pass.
- Mobile responsiveness: NOT VERIFIED — requires a rendered browser, which this session did not run against the real site (no dev server was started; doing so would only validate against the same mocked-Supabase smoke harness described in §16, not real responsive behavior with real data volumes).

---

## 14. ISO/IEC 25010 Scorecard

Every score is capped by "static evidence only, no runtime validation" (§2). I'm not assigning numeric 0–10 scores with false precision; instead: rating + the concrete evidence that justifies it, and what's missing to move it up.

| Characteristic | Rating | Evidence for the rating | What would raise it |
|---|---|---|---|
| Functional suitability | **Adequate for a single-approval-tier MVP; incomplete against the brief's two-tier/repair-job benchmark** | Core borrow→approve→pickup→return→inspect flow is implemented and role/transition-guarded end to end (§9). No two-tier approval, no formal repair-job subsystem (§6). | Live E2E proof the happy path actually works against a real DB; decision on whether two-tier approval and repair-job tracking are in scope |
| Performance efficiency | **NOT VERIFIED** | Worker caches GET responses 60s, uses Cloudflare edge; no load test evidence exists in-repo | Load test against staging |
| Compatibility | **NOT VERIFIED** | No cross-browser test evidence in repo | Manual/automated cross-browser pass |
| Usability | **Reasonably good intent, minor inconsistencies confirmed** | Thai labels, empty/loading states, but duplicated `STATUS_LABELS` maps disagree (§13); no accessibility evidence | Consolidate label source; run an accessibility pass |
| Reliability | **Good transactional design, weak backup/retry follow-through** | Atomic RPCs, `SKIP LOCKED` crons (§12) vs. no confirmed live backup cadence, no LINE retry-from-failed (§12) | Confirm PITR/backup schedule live; add outbox retry |
| Security | **Strong RPC-layer design undermined by an unresolved table-level RLS/GRANT gap on the three most sensitive tables** | Server-side role checks everywhere sampled, no secrets committed, real CSP (§11) vs. the §10 finding, which is the single largest risk in this report | Live confirmation (or fix) of §10 |
| Maintainability | **Mixed** | Single well-organized consolidated SQL file with clear section banners vs. four now-superseded historical SQL files still living in the repo with only prose (not enforced) guidance not to apply them (`MIGRATION_ORDER.md`), and no timestamped migrations directory (self-acknowledged gap) | Convert to timestamped migrations; archive/delete superseded scripts |
| Portability | **N/A for a Cloudflare/Supabase-specific stack** | Tightly coupled to Cloudflare Pages/Workers + Supabase by design; not a defect for this project's stated goals | — |

---

## 15. Regression Matrix

Given no live/E2E execution occurred, this is a **matrix of what a regression suite must cover**, not a report of pass/fail results. Each row cites the code that must be exercised.

| Area | Must-cover scenario | Source anchor |
|---|---|---|
| Submission | Guest submits with all required fields → `pending` created, tracking ID returned, LINE `order_created` enqueued | `submit_public_borrow_request_v2` |
| Submission | Missing required field (name/department/phone/purpose/location) → RPC raises, no row created | same, `:1394-1416` |
| Submission | `room_dedicated` equipment → `room_dedicated_review` LINE event enqueued | `:1497-1510` |
| Submission | `advance_course_dedicated` equipment with a real course conflict → RPC raises, no row created | `:1512-1517` |
| Approval | `approver_l1` approves a `pending` request → `approved`, `approved_by`/`approved_at` set, `l1_approved` LINE event enqueued | `approver_l1_decide_request` |
| Approval | Borrower (no role) attempts approval → RPC raises `unauthorized` | `:2242-2244` |
| Approval | Approving a non-`pending` request (e.g. already `approved`) → `apply_borrow_request_status_transition` returns NULL (no-op), not an error masking a stale-state bug | `:902-904` |
| Pickup | Staff confirms pickup with condition snapshot → status `borrowed`, `checked_out_at` set, manikin/unit flips to `in_use` | `confirm_pickup_with_snapshot` + sync trigger |
| Pickup | Missing photo/note → RPC raises before any status change | `insert_condition_snapshot:2497-2503` |
| Return | Staff confirms return, condition `normal` → terminal `completed`, asset restored to `ready` (unless other active assignment) | contract-asserted mapping + sync trigger |
| Return | Condition `damaged`/`maintenance` → terminal `damaged`, asset → `maintenance`, never silently returns to `ready` | same |
| Return | Condition `missing` → terminal `lost` | same |
| Overdue | `end_date` passed while `borrowed` → daily cron flips to `overdue`, `overdue` LINE event enqueued | `mark_overdue_borrow_requests` |
| Expiry | `pending` request past `expires_at` (24h) → 5-min cron flips to `expired` | `expire_pending_borrow_requests` |
| Cancellation | Borrower cancels own `pending` request via `transition_borrow_request_status` — NOT VERIFIED whether this legacy RPC path (`transition_borrow_request_status`, `:971-1037`, distinct from the older `cancel_borrow_request` in `rpc_functions.sql`) is actually still wired from `history.js:90` and enforces ownership the same way — **flagged for direct code diff, not fully traced in this pass** |
| Concurrency | Two staff simultaneously assign the same manikin to two different items for overlapping dates → second call must fail with "already assigned in this date range" | `staff_assign_manikin_to_item:2035-2046` under the `manikins` row lock |
| Security | Anonymous REST GET to `/rest/v1/borrow_requests` and `/rest/v1/manikins` → must return no borrower PII / no rows | §10 — **not executable from this session** |
| Realtime | Burst of 20 concurrent guest submissions while staff board is open → staff board must not visibly stutter/duplicate-render or exhaust the RPC rate limit | `staff.js:228-236`, Risk H |

---

## 16. Test Coverage Matrix

| Layer | Exists today? | What it actually checks | Gap |
|---|---|---|---|
| Unit tests (status mapping, availability calc, buffer/overdue math, permission predicates, CSV escaping, transition rules) | **No dedicated unit test suite.** | — | All of this logic lives in PL/pgSQL inside `current_mvp_release.sql` with zero automated tests exercising it against a real or ephemeral Postgres instance. |
| "Contract" checks | `scripts/verify-current-mvp-contracts.js` (215 lines) | Regex/string-presence assertions against source files — e.g. "does `checkoutJs` contain the substring `.rpc('submit_public_borrow_request_v2'`" | This proves the *shape* of the source hasn't regressed, not that the RPC *works*. It cannot catch a logic bug inside a correctly-named, correctly-called function. |
| Frontend smoke | `scripts/smoke-main-pages.js` (Playwright, 396 lines) | Loads real HTML/CSS/JS in a headless browser served by a local static file server, but **replaces the entire Supabase client with a hand-written mock** (`supabaseMock()`, lines 61-126+) returning canned rows and canned RPC responses | Never touches a real or even locally-emulated Postgres. Cannot catch RLS misconfiguration, real constraint violations, real trigger behavior, or real role-check behavior — exactly the class of issue found in §10. |
| Deploy workflow smoke | `scripts/smoke-deploy-workflow.js` | Validates the GitHub Actions YAML structure/ordering, not runtime behavior | — |
| Live worker check | `scripts/verify-live-worker.mjs` | Would hit the real deployed Worker + Supabase, blocks disallowed paths | **Requires live network** — not runnable in this sandbox (§2); also not run in CI on every PR, only presumably manually per `docs/RELEASE_ROLLBACK_2026-06-28.md:15` |
| Database/RLS tests | **None found** | — | No `pgTAP`, no SQL test files, no CI step that spins up Postgres and asserts policy behavior |
| Integration tests (frontend↔real backend) | **None found** | — | — |
| Real E2E (browser + real backend, the brief's Phase 7 requirement) | **None found and none executed by this audit** | — | This is the single biggest testing gap relative to the brief's requirements, and it is also the gap that would have caught or ruled out §10 |

**Conclusion:** CI (`frontend-smoke.yml`, `deploy-production.yml`) is real and does gate merges/deploys, but everything it currently checks is source-shape and mocked-UI behavior. **No automated test in this repository would catch a live RLS misconfiguration, a live double-booking race, or a live broken RPC.** This is not a criticism of test *quality* where tests exist — the contract checks are well-targeted and the smoke tests are legitimately useful for catching dead links/missing DOM/broken navigation — it's a coverage-layer gap.

---

## 17. Production Gap Register

| ID | Domain | Finding | Evidence | Severity | User impact | Data risk | Security risk | Probability | Fix complexity | Regression risk | Recommended action |
|---|---|---|---|---|---|---|---|---|---|---|---|
| G-01 | Security/DB | `borrow_requests`, `borrow_request_items`, `manikins` have no RLS/GRANT statements in the authoritative release script; live state unverified | §10 | **P0** | High if live-exploitable: any caller could read all borrower PII or write outside the state machine | High | High | Unknown (needs live check) — but previously flagged by the project itself | Low (a few `ALTER TABLE ... ENABLE RLS` + `REVOKE`/`GRANT`/policy statements) | Low if scoped correctly | Add explicit RLS + REVOKE-then-GRANT block for these 3 tables to `current_mvp_release.sql`, re-run the live verification queries in §10, confirm with the curl commands in §10 |
| G-02 | Testing | No automated test touches a real/emulated database; all "tests" are mocked or static | §16 | **P1** | Regressions in RPC logic ship undetected | Medium | Medium | High over time | Medium (needs a CI Postgres service + pgTAP or equivalent) | Low | Add a CI job that applies `current_mvp_release.sql` to a fresh Postgres service container and runs SQL-level assertions for §10's invariants |
| G-03 | Architecture | No DB-level EXCLUDE/unique constraint backstops the no-double-booking invariant | §9 | **P2** | Double-booking possible only if RPC locking discipline is ever bypassed by a future change | Medium | Low | Low today, rises with any future direct-write path | Medium (requires `btree_gist` + `tstzrange` EXCLUDE) | Medium (must not conflict with existing overlap-check logic) | Add `EXCLUDE USING gist` on `(manikin_sap_id, tstzrange(start_date,end_date)) WHERE status IN (...)` as defense-in-depth |
| G-04 | Reliability | No confirmed live Supabase backup/PITR cadence; project's own doc says local tooling to take one wasn't available at last release | §12 | **P1** | Total data loss risk on any live incident | High | — | Unknown | Low (Supabase Dashboard PITR toggle / scheduled export) | Low | Confirm PITR is enabled on the production project; document the restore drill |
| G-05 | Reliability | LINE outbox has no retry-from-`failed` path | §12 | P3 | Staff miss a notification silently | Low | — | Medium | Low | Low | Add a bounded retry (e.g., 3 attempts) or a staff-visible "failed notifications" view |
| G-06 | Usability | `STATUS_LABELS` duplicated with inconsistent Thai wording across `supabase-client.js` and `staff.js` | §13 | P3 | Confusing but not blocking | Low | — | High (already happening) | Low | Low | Make `staff.js` consume `app.STATUS_LABELS` instead of redeclaring |
| G-07 | Reliability | Realtime `event:'*'` triggers unthrottled full-board reload | §8 Risk H | P2 | Staff UI churn/flicker under submission bursts, extra RPC load | Medium | — | Medium | Low | Low | Debounce `loadBoard()` (e.g., 500ms–1s trailing debounce) on the realtime callback |
| G-08 | Architecture gap (vs. brief, not vs. product intent) | No formal repair-job subsystem (repair events/parts/linkage) | §6 | P2 (only if this is an actual business requirement, not just the brief's assumption) | Damage handling stops at a maintenance counter + informal `kit_refill_tasks` | Low | — | — | High if required | — | Confirm with SIMSET stakeholders whether a full repair-job workflow is in scope for this release or a later one |
| G-09 | Missing requirement (vs. brief) | No two-tier (Center Head + Dean) approval | §5, §9 | Documented product decision, not a defect | — | — | — | — | — | — | Re-confirm with stakeholders this simplification is still accepted before GO |
| G-10 | Operational readiness | `docs/GITHUB_RELEASE_CHECKLIST.md` and `RELEASE_ROLLBACK` exist and are good, but there's no evidence a live UAT with real SIMSET staff has occurred | `RELEASE_ROLLBACK_2026-06-28.md:66` itself says "UAT with 2-3 staff... remains the final business sign-off before calling the system 100% live" | **P0 (process gate)** | Unknown real-world usability | — | — | — | — | — | Run the live UAT the project's own doc already calls for |

Unverified assumptions carried into this register (not confirmed either way): live RLS/GRANT state (G-01), live backup cadence (G-04), whether `transition_borrow_request_status` is correctly wired for borrower self-cancel from `history.js` (§15), storage bucket policy live state, actual production Supabase project data volume/load characteristics.

---

## 18. Remediation Roadmap (release gates)

**Gate 0 — Repository/environment alignment.** Nothing blocking here: single repo, single branch, clean tree, matches its own docs. Action: none required beyond noting the brief-vs-repo mismatch (§7) so future audit prompts target the real stack.

**Gate 1 — Current runtime blockers.** No crashes, missing routes, or invalid props were found (§8 A–C are N/A). No action required at this gate specifically; the smoke suite already guards page-load-level breakage.

**Gate 2 — Security foundation.** Blocking: G-01 (RLS/GRANT gap on the 3 sensitive tables) must be resolved and *proven live* before any GO. This is the only true security blocker found.

**Gate 3 — Data integrity foundation.** G-03 (EXCLUDE constraint backstop) should land here as hardening; not release-blocking given the locking discipline already observed, but should not ship indefinitely deferred.

**Gate 4 — Core borrow workflow.** Already implemented per §9/§6; gate here is *validation* (Phase 11-13 live testing), not new construction.

**Gate 5 — Exception workflows.** Rejection/cancellation/overdue/damage/loss are implemented (§6/§9); the one open question is the borrower self-cancel wiring noted in §15, which needs a direct trace before sign-off.

**Gate 6 — Notifications and reporting.** G-05 (retry) and KPI reporting are already functional; retry is hardening, not blocking.

**Gate 7 — Quality and usability.** G-06 (label consistency), G-07 (realtime debounce), accessibility pass — all P2/P3, not release-blocking individually, but should be batched into one pre-GA polish pass.

**Gate 8 — Release validation.** This is where this audit stops and hands off: regression run (§15), staging deploy, backup verification, rollback rehearsal, and production smoke — none of which could be executed from this sandbox (§2).

---

## 19. Task-Level Implementation Plan

### Task T-01 — Close the RLS/GRANT gap on `borrow_requests`, `borrow_request_items`, `manikins`
- **Goal:** Make `current_mvp_release.sql` self-certifying for its most sensitive tables, matching the pattern already used for every other table in the same file.
- **Finding addressed:** G-01 / §10.
- **Exact files:** `supabase/current_mvp_release.sql` (add a new section near the other `ENABLE ROW LEVEL SECURITY` blocks, e.g. after line 238).
- **Proposed change:**
  ```sql
  ALTER TABLE public.manikins ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.borrow_requests ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.borrow_request_items ENABLE ROW LEVEL SECURITY;

  REVOKE ALL ON TABLE public.manikins FROM PUBLIC, anon, authenticated;
  REVOKE ALL ON TABLE public.borrow_requests FROM PUBLIC, anon, authenticated;
  REVOKE ALL ON TABLE public.borrow_request_items FROM PUBLIC, anon, authenticated;

  -- Staff/approver/admin need SELECT for their dashboards even though the
  -- primary path is RPCs; keep this role-gated, not anon.
  GRANT SELECT ON TABLE public.manikins TO authenticated;
  GRANT SELECT ON TABLE public.borrow_requests TO authenticated;
  GRANT SELECT ON TABLE public.borrow_request_items TO authenticated;

  CREATE POLICY "staff_select_manikins" ON public.manikins FOR SELECT TO authenticated
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin','staff','approver_l1'));
  CREATE POLICY "staff_select_borrow_requests" ON public.borrow_requests FOR SELECT TO authenticated
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin','staff','approver_l1'));
  CREATE POLICY "staff_select_borrow_request_items" ON public.borrow_request_items FOR SELECT TO authenticated
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin','staff','approver_l1'));
  -- Intentionally no anon policy and no authenticated write policy: all
  -- writes must continue to go through the SECURITY DEFINER RPCs.
  ```
  Then remove `/rest/v1/borrow_requests` and `/rest/v1/borrow_request_items` from `cloudflare-worker/worker.js`'s `ALLOWED_PATHS` (lines 28-29) unless a real product need for direct REST reads by staff is confirmed — the RPC layer (`get_staff_dashboard_orders`, `get_l1_approval_queue`) already serves every read the frontend actually performs (§8 Risk D), so the allow-list entries are excess attack surface with no current caller.
- **Dependencies:** none.
- **Test-first steps:** before changing anything, run the `pg_policies`/`information_schema.role_table_grants` queries from §10 against the live/preview project and record the actual current state. Only then decide whether this is a live fix or a confirmation-of-already-fixed.
- **Acceptance criteria:** the curl commands in §10 return `401`/empty for anonymous callers; an `authenticated` session with role `borrower` (no elevated role) also gets denied by the new staff-only SELECT policies; existing RPC-based flows (checkout, staff board, approver queue, history) continue to pass `scripts/verify-current-mvp-contracts.js` and `smoke-main-pages.js` unchanged, since neither test currently exercises table-level GRANTs directly (a real gap this task doesn't fully close — see T-02).
- **Security considerations:** this task *is* the security fix.
- **Data migration considerations:** none — pure policy/grant change, no data touched.
- **Observability:** re-run the §10 SQL verification queries and archive the output as evidence in the next audit.
- **Rollback procedure:** `DROP POLICY` the three new policies and re-run `REVOKE`; since no anon/broad grant existed to restore, rollback is simply removing the new restrictions (reverts to the pre-fix, more-open state — document this tradeoff before rolling back).
- **Blast radius:** low — additive policies, no existing RPC path depends on direct table grants.
- **Commit boundary:** one commit, SQL-only, plus the Worker allow-list trim as a second, separately reviewable commit.

### Task T-02 — Add a CI job that proves T-01 against a real Postgres instance
- **Goal:** Make G-02 partially concrete: at least the RLS/invariant checks from §10/§9 should run in CI against ephemeral Postgres, not just be asserted in a report.
- **Finding addressed:** G-02.
- **Exact files:** new `.github/workflows/db-checks.yml`; new `supabase/tests/` directory with SQL assertions (e.g. pgTAP, or plain `DO $$ ... RAISE EXCEPTION ... $$` assertion scripts run via `psql`).
- **Proposed change:** spin up `postgres:15` as a GitHub Actions service container, apply `current_mvp_release.sql`, then run assertions for: RLS enabled on all 3 tables from T-01, anon has zero grants on them, a simulated `approver_l1` JWT claim cannot call `admin_update_borrow_request_status`, double-assignment of the same manikin/overlapping dates raises.
- **Dependencies:** T-01 must land first (or this job is the mechanism that discovers T-01 is still needed).
- **Test-first steps:** write the failing assertions against the *current* file first, confirm they fail (proving they'd have caught G-01), then apply T-01 and confirm they pass.
- **Acceptance criteria:** CI job green on `main`, and demonstrably red if T-01's SQL block is reverted (prove by temporarily reverting locally and re-running).
- **Security considerations:** none beyond what's being tested.
- **Data migration considerations:** none — CI-only, ephemeral database.
- **Observability:** CI job output is the observability artifact.
- **Rollback procedure:** disable the workflow file if it proves flaky; does not touch production.
- **Blast radius:** none (CI-only).
- **Commit boundary:** one commit for the workflow + fixtures.

*(Further tasks T-03…T-10 for G-03 through G-10 follow the same template and are summarized, not fully expanded, to keep this report a usable artifact rather than padding: T-03 adds the `EXCLUDE` constraint per §17 G-03 with a `btree_gist` extension migration and a concurrency test; T-04 confirms/enables Supabase PITR (dashboard action, not code); T-05 adds bounded LINE retry; T-06 de-duplicates `STATUS_LABELS`; T-07 debounces the realtime handler in `staff.js`; T-08 is a stakeholder decision, not an engineering task; T-09 is the UAT itself; T-10 is converting `supabase/*.sql` into a timestamped `supabase/migrations/` directory and deleting/archiving the four superseded historical scripts so `MIGRATION_ORDER.md`'s prose warning becomes structurally unnecessary.)*

---

## 20. Staging Validation Plan

**NOT EXECUTED — no staging credentials/network access in this session.** The plan itself, to be run by someone with access:

1. Confirm a Supabase "preview" project exists and its ref matches what `cloudflare-worker/wrangler.toml` would point at in a staging Worker environment (today there is only one environment defined — this is itself a gap: create a second Worker (`simset-showroom-proxy-staging`) with its own `wrangler.toml` env block pointing at the preview Supabase project, rather than reusing production).
2. Apply `supabase/current_mvp_release.sql` (with T-01 applied) to that preview project; run the §10 verification queries and record output.
3. Deploy the Worker and Pages site against the preview project.
4. Run `npm run verify:live-worker` against the staging Worker URL.
5. Run the full manual walkthrough from §21/23 against staging with synthetic borrower/staff/approver accounts and synthetic equipment — never real SIMSET equipment records or real borrower PII.
6. Capture: release commit hash, Supabase project ref, migration file hash, Worker deployment ID, screenshots of each step, and the raw SQL verification output, into a staging evidence pack (a dated folder under `docs/`, not committed if it contains any real-looking PII).

---

## 21. Production Runbook

**Before deployment:** approved commit on `main` (currently `f891713`, clean, per §3) · CI green on `deploy-production.yml`'s `preflight` job · a fresh Supabase backup/PITR checkpoint taken and its restore path confirmed (G-04) · `wrangler secret list` confirms all 7 Worker secrets present (`docs/GITHUB_RELEASE_CHECKLIST.md:11-19`) · T-01 applied and its live verification queries re-run and archived · a named rollback owner, deploy owner, and validation owner assigned for the window · staff informed of the maintenance/rollout window.

**Deployment order:** (1) backward-compatible DB changes (T-01's RLS/policy additions are additive and safe to apply before code deploys) → (2) Worker deploy (`wrangler deploy` from `cloudflare-worker/`) → (3) Pages/frontend deploy (already automated in `deploy-production.yml`'s `deploy` job, gated behind the `preflight` job and a `production` environment approval) → (4) confirm the two `pg_cron` jobs are still scheduled post-deploy (`SELECT * FROM cron.job`) → (5) LINE dispatch is cron-driven, no separate consumer deploy needed → (6) no feature flags exist in this codebase — N/A → (7) no data backfill required for this change set.

**Rollback triggers (objective):** any of — anonymous REST access to `borrow_requests`/`manikins`/`borrow_request_items` returns data (immediate rollback, this is the exact regression T-01 exists to prevent); staff/approver/admin login failures; `verify-live-worker` failing post-deploy; a confirmed duplicate-loan (same manikin, two active `borrowed`/`approved` requests, overlapping dates); any `borrow_request_status_audit` INSERT failure surfaced in logs; elevated 5xx from the Worker.

**Rollback procedure (not just "redeploy previous version"):** 1) Cloudflare Pages: redeploy the prior known-good deployment via dashboard or `wrangler pages deploy` of the prior commit's `website/` tree. 2) Worker: redeploy the prior Worker version. 3) Database: **T-01's changes are additive-only (RLS/policies), so rolling back the frontend/Worker does not require reverting the DB change** — the new policies only *restrict* access further, so a prior-version frontend that only ever used RPCs is unaffected. If a future change ever adds a destructive DB migration, that migration must ship with an explicit down-script before it's allowed to deploy — none of the current migrations have one, which is itself a process gap to fix in T-10. 4) If bad data was written during the failed window, it must be corrected via a reviewed, logged SQL script referencing specific row IDs — never ad hoc dashboard edits (per the project's own `RELEASE_ROLLBACK_2026-06-28.md:51` instruction, which this audit endorses).

---

## 22. Rollback Plan

Covered inline in §21 to avoid duplicating the same content twice; the key point restated: **the one security fix this audit recommends as release-blocking (T-01) is itself safely rollback-able** because it only removes access, never grants new access or migrates data — so adopting it does not introduce new rollback risk.

---

## 23. Production Validation Checklist

**NOT EXECUTED.** To be run by someone with production access, using a designated test account and designated test equipment (never real patient-adjacent workflows, per the brief's own constraint):

1. Login as a designated staff test account.
2. Search a designated test asset in the catalog; confirm its `พร้อมยืม N` count (`catalog.js` availability text) matches `get_borrow_availability` output.
3. Submit a guest borrow request for that asset; confirm a tracking ID is issued and `/track.html?id=` resolves it.
4. Approve as the `approver_l1` test account; confirm `l1_approved` appears in the LINE outbox (`send_status` progresses to `sent` within 15 min) or, if LINE isn't configured for the test channel, that the row exists with the right `event_type`.
5. Confirm pickup as staff with a condition snapshot; confirm the asset's status flips and the staff board no longer lists it under "to prepare."
6. Confirm the borrow shows as unavailable/borrowed in the public catalog.
7. Confirm return as staff with a condition snapshot (`normal`); confirm terminal status `completed` and the asset returns to `ready`/available.
8. Verify `borrow_request_status_audit` contains one row per transition with correct `actor_type`/`actor_user_id`/timestamps.
9. Verify the LINE notification outbox rows for this request all reached `sent` (or a documented `skipped`/`failed` reason).
10. Verify `report.html`'s KPI numbers move as expected (pending count down, completed count up).
11. **Run the two curl commands from §10 against production** and confirm they return no data to an unauthenticated caller — this is the single highest-value check in this entire checklist given §10's severity.
12. Repeat steps 3–10 with a second concurrent request for the *same* asset/dates to prove the no-double-booking behavior from §9/§15 live, not just in source.

Any failure at step 11 specifically: **stop rollout immediately, do not proceed to wider release, do not patch via manual dashboard data edits** — apply T-01, re-verify, and only then continue.

---

## 24. Remaining Risks

- §10's RLS/GRANT live state — the single largest unresolved unknown in this entire audit.
- Whether `transition_borrow_request_status` (borrower self-cancel path from `history.js:90`) enforces ownership as rigorously as `cancel_borrow_request` did in the legacy script — not fully traced (noted in §15), should be read end-to-end before GO.
- Actual production data volume/concurrency — nothing in this report load-tests the rate limiter, the cache, or the trigger-based transition logic under real concurrency; the row-locking design is sound in principle but unproven under real contention.
- Whether SIMSET has actually run the live UAT that the project's own rollback doc (§17 G-10) says is the final business sign-off gate.
- Accessibility and true mobile-device usability — asserted as design intent, not verified rendered.
- The four superseded historical SQL scripts remain in the repo and remain *executable* by anyone who runs them against the live project by mistake — `MIGRATION_ORDER.md`'s warning is prose, not a structural guard (e.g., nothing renames or `.gitignore`s them out of the obvious "just run all the .sql files" path a new contributor might take).

---

## 25. GO / CONDITIONAL GO / NO-GO Decision

**Decision: NO-GO** for unattended production sign-off, specifically because:

1. G-01 (§10, §17) is a P0-class finding whose live exploitability is **unresolved**, and the fix (T-01) has not been applied or verified.
2. No production validation (§23) has been executed — the brief requires it as a precondition for GO, and this sandbox cannot reach the live system to perform it (§2).
3. The project's own release document (`RELEASE_ROLLBACK_2026-06-28.md:66`) states live staff UAT is still outstanding as the final business sign-off gate — that is not something this audit can substitute for.

**This would become CONDITIONAL GO the moment**, and only when, all of the following are true and evidenced (not just asserted):
- The §10 SQL verification queries are run against the live production database and either show RLS+policies already correctly in place, or T-01 is applied and re-verified.
- The two curl commands in §10/§23 step 11 are run against the live Worker and return no data to an anonymous caller.
- §15's regression matrix is executed at least once against a real (staging or production) database, with results attached.
- The outstanding UAT with real SIMSET staff (G-10) is completed and its sign-off recorded.

**Full GO** additionally requires: G-02 (real CI DB tests) landed, so that this exact class of gap cannot silently regress again; backup/PITR live-confirmed (G-04); and the stakeholder decision on G-08/G-09 (repair-job subsystem, two-tier approval) explicitly recorded as either "not in scope for this release" or scheduled.

---

## 26. Developer Handoff Summary

**Immediate developer actions, in order:**
1. Get read access to the live Supabase project's SQL editor (or `psql`) and run the three verification queries in §10 against `manikins`, `borrow_requests`, `borrow_request_items`. This single step resolves the report's biggest open question.
2. Based on that result, either confirm T-01 is unnecessary (already protected by surviving historical policies) or apply T-01's SQL block and re-verify.
3. From a machine with normal internet access, run the two curl commands in §10 against the production Worker URL and record the raw response.
4. Trace `history.js:90`'s call to `transition_borrow_request_status` end-to-end against its RPC definition (`current_mvp_release.sql:971-1037`, not fully expanded in this report) and confirm it enforces "borrower can only cancel their own still-pending request," matching the guarantee the older `cancel_borrow_request` RPC had.
5. Stand up a CI job per T-02 so this class of gap is caught automatically going forward.
6. Schedule and run the live staff UAT that the project's own rollback doc says is still outstanding.
7. Decide and document, with stakeholders, whether the two-tier approval and formal repair-job subsystem (G-08/G-09) are in scope for this release or explicitly deferred.
8. Land the low-risk polish items (G-05 LINE retry, G-06 label de-dup, G-07 realtime debounce) opportunistically — none block GO but all are cheap.
9. Convert `supabase/*.sql` into timestamped migrations and retire the four historical scripts (T-10) before the next contributor accidentally reapplies stale RLS logic.
10. Re-run this audit's §10/§23 checks after each of the above and update the decision in §25 accordingly — do not treat this document as self-certifying once code changes; it is a snapshot of commit `f891713`.

**Release decision:** **NO-GO**, pending the specific evidence listed in §25's "CONDITIONAL GO" criteria — chiefly, live confirmation (or fix) of the RLS/GRANT state on `borrow_requests`/`borrow_request_items`/`manikins`, and completion of the project's own already-planned staff UAT.
