# PROJECT STATUS

Snapshot date: 2026-03-16
Project path: `d:/Jedi_EX_HDX_BAC01/01.Jedi_SIMSET/SIMSET_Project/SIMSET_ModelSystem`
Status source: current codebase, SQL files, Worker config, GitHub Actions, and current repository state

## Executive Summary

This project is no longer a simple static showroom. It is now a hybrid system with:

1. A public showroom fed by generated JSON snapshots.
2. A live borrowing flow backed by Supabase RPCs.
3. A public tracking flow with both legacy and replacement implementations.
4. A large admin panel with review, borrowing, team, location, and reporting features.
5. A Cloudflare Worker used as the browser-to-Supabase gateway.

The system already has meaningful production structure: worker allowlists, rate limiting, Supabase RLS, admin role checks, generated public data, and borrowing/tracking flows. However, the project is still in transition. The main delivery risks are legacy path duplication, mixed encoding quality, incomplete test coverage, manual SQL migration drift, and a currently dirty worktree.

Current overall assessment: functional but not release-hardened.

## Current System Map

### 1. Public Showroom

- Entry page: `website/index.html`
- Client logic: `website/app.js`
- Static data source: `website/data/*.json`
- Data refresh pipeline: `.github/workflows/generate-data.yml`

What exists now:

- Public catalog UI for manikins.
- Grouped and individual views.
- Search and status filters.
- Realtime client hookup in `website/app.js`.
- Static JSON refresh every 15 minutes from GitHub Actions.

Current assessment:

- Core functionality exists.
- Public data pipeline is simple and maintainable.
- Frontend text quality is inconsistent because some HTML files still contain mojibake.

### 2. Borrowing Flow

- Page: `website/borrow.html`
- Client logic: `website/borrow.js`
- Styles: `website/borrow.css`

What exists now:

- Google SSO login from the frontend.
- Equipment catalog built from grouped team/manikin data.
- Date range selection.
- Availability lookup via RPC.
- Borrow request submission via RPC.
- Cart flow and UI for request creation.
- Team cover image usage in the borrow catalog.

Current assessment:

- The borrowing path is the most aligned with the intended architecture.
- It uses RPC contracts instead of raw client-side table mutation for key actions.
- It still depends on backend correctness and migration completeness for business rules.

### 3. Tracking Flow

- New page: `website/tracking.html`
- New script: `website/js/tracking.js`
- Legacy page/script still present: `website/track.html`, `website/track.js`

What exists now:

- New tracking flow uses `get_borrow_request_status` RPC.
- New cancellation flow uses `cancel_borrow_request` RPC.
- New flow supports login-gated cancellation and client-side 24-hour cutoff check.
- Legacy flow still queries `borrow_requests` and `borrow_request_items` directly and attempts direct update cancellation.

Current assessment:

- Replacement architecture exists.
- Legacy path still creates behavioral and security inconsistency.
- Decommission work is still needed before the tracking surface is considered stable.

### 4. Admin System

- Main page: `website/admin/dashboard.html`
- Main logic: `website/admin/admin.js`
- Borrowing admin logic: `website/admin/borrow-admin.js`
- Login page: `website/admin/index.html`
- Login logic: `website/admin/login.js`

What exists now:

- Dashboard tab system.
- Review queue.
- Borrow request management.
- Manikin management.
- Recycle bin flow.
- Location management.
- Team management.
- Reporting section.
- Team image management.
- Audit log usage in admin actions.

Current assessment:

- Admin is feature-rich and likely central to operations.
- It has already moved beyond a prototype.
- It is also the heaviest maintenance surface and the biggest regression risk area.

### 5. Cloudflare Worker Gateway

- Source: `cloudflare-worker/worker.js`
- Config: `cloudflare-worker/wrangler.toml`

What exists now:

- Allowed-path proxy model.
- Allowed prefix handling for auth and realtime.
- Per-IP rate limiting.
- GET response caching.
- Preservation of incoming JWT Authorization header for RLS.
- Support for public REST and RPC paths used by showroom, borrow, tracking, and admin.

Current assessment:

- Worker structure is correct for the current architecture.
- It is one of the strongest parts of the system.
- Some documentation and config still need cleanup.

### 6. Supabase Security and DB Logic

- RLS setup: `supabase/rls_setup.sql`
- RPC helpers: `supabase/rpc_functions.sql`
- Security reinforcement: `supabase/admin_security_reinforcement.sql`
- Additional migrations: `supabase/audit_and_softdelete_migration.sql`

What exists now:

- RLS on public tables.
- Public view for showroom data.
- Admin policies using `app_metadata.role`.
- Reinforced admin checks with `@mahidol.ac.th` email restrictions.
- Atomic RPCs for some admin operations.

Current assessment:

- Security direction is sound.
- DB logic is not yet centralized enough for all state-changing flows.
- Migration history is spread across multiple SQL files and admin-run SQL scripts.

## What Is Working Well

### Architecture strengths

- The project has a clear browser -> Worker -> Supabase structure.
- Worker path allowlisting reduces accidental database exposure.
- RLS and role-based control are already part of the implementation.
- Public showroom data is decoupled from live borrow operations.

### Product strengths

- There is already a usable public catalog.
- Borrow flow is materially implemented, not just mocked.
- Admin supports real operational workflows, not only content editing.
- Team-based equipment presentation is already integrated into borrow UX.

### Operational strengths

- Public JSON generation is automated.
- There is at least one smoke-test script for endpoints.
- Admin code has had some refactoring to reduce duplicate logic.

## Partial or In-Progress Areas

### Tracking consolidation

- The new tracking path is more correct.
- The legacy tracking path still exists.
- Redirect/decommission work has not been completed.

### Encoding and content quality

- Several JavaScript and text files were cleaned already.
- Public HTML and some documentation still contain mojibake.
- Text quality issues affect maintainability and trust even when logic works.

### Testing and release quality

- There is smoke coverage.
- There is no visible full test pyramid in the repository.
- There is no clear CI quality gate for lint, integration, and end-to-end blocking deploys.

### Migration discipline

- SQL assets exist.
- Some migrations are stored in admin SQL folders and standalone files.
- The project does not yet present a single canonical migration path.

## Main Risks Right Now

| Risk | Severity | Why it matters |
| --- | --- | --- |
| Legacy tracking path still active | High | Behavior and authorization rules differ between old and new flow |
| Encoding debt in public/admin/docs | High | Creates user-facing quality issues and makes maintenance error-prone |
| Dirty git worktree | High | Hard to separate stable baseline from current experiments |
| Weak automated test coverage | High | Regression risk is high across borrow/admin/tracking flows |
| SQL migration drift | High | DB rules may differ between intended and actual environments |
| Admin surface area is large | Medium | High coupling and regression cost |
| Worker config/documentation inconsistency | Medium | Can lead to deployment mistakes |

## Repository Reality Check

As of the current snapshot:

- The repository is in a dirty state with multiple modified files.
- There are untracked planning, deployment, generated, and helper files.
- This means the codebase should be treated as an active working branch, not a clean release branch.

Implication:

- The first planning horizon should focus on stabilization and baseline control before major new feature expansion.

## Delivery Assessment

| Area | Status | Notes |
| --- | --- | --- |
| Public showroom | Mostly working | Good data pipeline, but public HTML/text cleanup still needed |
| Borrowing | Working with caveats | Strongest flow architecturally, still needs hardening and tests |
| Tracking | Split state | New RPC flow exists, legacy path still present |
| Admin | Working but high risk | Rich feature set, heavy change surface |
| Worker | Good | Strong proxy foundation |
| DB security | Good direction | Needs stricter migration discipline and broader RPC centralization |
| Testing | Weak | Smoke-level only, no clear release gate |
| Release readiness | Not ready | Too much drift, duplication, and verification gap |

## Recommended Planning Direction

The project should move through four stabilization-first sprints:

1. Normalize and stabilize the baseline.
2. Centralize business rules and remove legacy flow duplication.
3. Improve operational reliability and observability.
4. Add release governance and stronger automated verification.

---

# SPRINT BACKLOG

Scale used:

- Priority: `P0` critical, `P1` high, `P2` medium
- Effort: `S` 1-2 days, `M` 3-5 days, `L` 1-2 weeks

## Sprint 1 - Baseline Stabilization

Sprint goal: make the current system internally consistent and establish a cleaner release baseline.

| ID | Task | Priority | Effort | Dependency | Definition of Done |
| --- | --- | --- | --- | --- | --- |
| S1-01 | Remove remaining mojibake and encoding issues from public/admin/docs critical files | P0 | M | None | Public pages and critical docs render readable Thai/English text; no known mojibake remains in release-critical files |
| S1-02 | Decommission legacy tracking path or redirect `track.html` to `tracking.html` | P0 | M | S1-01 | Old path no longer performs direct table reads/writes; all user entry points go to one tracking surface |
| S1-03 | Audit all public and admin client mutations and replace direct state-changing table updates with RPC where needed | P0 | L | S1-02 | No release-critical client path mutates protected tables directly outside approved contract |
| S1-04 | Build a clean environment baseline document for Worker, Supabase secrets, and deploy assumptions | P1 | S | None | One document lists required env vars, URLs, secrets ownership, and deploy order |
| S1-05 | Reconcile `wrangler.toml`, Worker README, and real deploy config | P1 | S | S1-04 | Config and docs match the actual deployment model; no misleading setup instructions remain |
| S1-06 | Review git worktree and separate active product code from scratch/generated artifacts | P1 | M | None | Team can clearly identify tracked source, generated output, and optional tooling artifacts |
| S1-07 | Produce a release-candidate inventory of pages, scripts, SQL files, and ownership | P2 | S | S1-06 | Inventory exists and is current enough to support planning and review |

## Sprint 2 - Domain Correctness and Contract Hardening

Sprint goal: move all important business rules to consistent backend contracts and remove behavioral ambiguity.

| ID | Task | Priority | Effort | Dependency | Definition of Done |
| --- | --- | --- | --- | --- | --- |
| S2-01 | Validate all borrow request rules at RPC boundary | P0 | L | S1-03 | Submit flow rejects invalid payloads consistently with structured errors |
| S2-02 | Make availability contract authoritative and consistent between UI and DB | P0 | L | S2-01 | UI availability result matches submit-time validation for tested scenarios |
| S2-03 | Finalize cancellation policy at server level including ownership and cutoff rule | P0 | M | S1-02 | Cancellation logic is enforced in RPC and not only in client checks |
| S2-04 | Review all admin state changes and require RPC or DB-guarded flows for approve/reject/return actions | P1 | L | S1-03 | Admin state transitions follow a documented, enforceable backend contract |
| S2-05 | Consolidate SQL migration path and identify canonical execution order | P1 | M | None | One ordered migration plan exists; obsolete or duplicate SQL is marked clearly |
| S2-06 | Add DB-level verification queries for RLS, RPC grants, and role expectations | P1 | S | S2-05 | Verification checklist can confirm environment is configured correctly |
| S2-07 | Review Worker allowlist against actual frontend/admin/runtime usage | P2 | S | S2-04 | Worker paths are minimal but sufficient; unused paths are removed or documented |

## Sprint 3 - Reliability, Monitoring, and Operational Readiness

Sprint goal: make issues easier to detect, triage, and recover from.

| ID | Task | Priority | Effort | Dependency | Definition of Done |
| --- | --- | --- | --- | --- | --- |
| S3-01 | Add structured error handling and user-safe error messages across borrow/tracking/admin | P0 | M | S2-01 | Critical flows classify user error vs system error and display consistent messages |
| S3-02 | Add request correlation strategy across frontend, Worker, and RPC logs | P1 | M | S3-01 | Incidents can trace a user action through the main request path |
| S3-03 | Add operational dashboard metrics for RPC failures, latency, and submit success ratio | P1 | L | S3-02 | Core service health is visible from one ops view |
| S3-04 | Create rollback and incident runbook for Worker, Supabase SQL, and frontend deploys | P1 | M | S2-05 | Team can execute rollback with documented steps and prerequisites |
| S3-05 | Add smoke test execution to a routine validation path | P1 | S | S1-05 | Smoke script runs in a documented way against preview or production |
| S3-06 | Review cache behavior, rate limits, and origin restrictions in Worker for production safety | P2 | S | S1-05 | Cache and CORS behavior are explicitly accepted and documented |

## Sprint 4 - QA Gate and Release Governance

Sprint goal: reduce regression risk and define a repeatable release process.

| ID | Task | Priority | Effort | Dependency | Definition of Done |
| --- | --- | --- | --- | --- | --- |
| S4-01 | Add JavaScript syntax and static validation checks for all critical entry files | P0 | S | S1-01 | Failing syntax blocks merge or release |
| S4-02 | Add integration tests for key RPC contracts: availability, submit, tracking, cancel | P0 | L | S2-01 | Core RPC behavior is testable and verified automatically |
| S4-03 | Add end-to-end tests for main user journey and admin approval loop | P0 | L | S2-04 | Critical path E2E covers borrow -> track -> cancel and admin approve/reject/return |
| S4-04 | Add CI quality gates for smoke, integration, and E2E subsets | P1 | M | S4-01, S4-02, S4-03 | Deploys are blocked on defined failing checks |
| S4-05 | Define release checklist with environment verification, migration checks, and rollback confirmation | P1 | S | S3-04, S4-04 | Release checklist is required and usable by a second person |
| S4-06 | Run one full release rehearsal on preview environment | P1 | M | S4-05 | Team can execute a dry-run deploy, validate health, and rollback if needed |

## Cross-Sprint Priority Order

If capacity is limited, the recommended execution order is:

1. S1-02
2. S1-03
3. S2-01
4. S2-02
5. S2-03
6. S4-02
7. S4-03
8. S3-04

## Definition of Success After Sprint 4

The system can be considered materially healthier when all of the following are true:

- There is only one public tracking path.
- Release-critical files are free from known encoding corruption.
- Borrowing and cancellation rules are enforced at backend contract level.
- Admin state-changing operations follow audited, protected paths.
- The canonical SQL migration path is clear.
- Smoke, integration, and end-to-end checks exist for critical flows.
- Preview and production release steps are documented and repeatable.

## Next Recommended Artifact

After this document, the next high-value planning artifact should be:

- `RELEASE_BASELINE_CHECKLIST.md`

Its purpose should be to convert Sprint 1 into a measurable stabilization gate before deeper feature work continues.
