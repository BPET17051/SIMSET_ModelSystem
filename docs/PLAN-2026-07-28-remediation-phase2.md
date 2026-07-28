# Phase 2 Remediation Roadmap — PR-Sized Task Breakdown

Companion to `docs/AUDIT_2026-07-28_borrow_return_system.md` and the Phase 1 root-cause
validation performed against ticket claims dated 2026-07-28. This document is a **plan
only** — no code in this repository has been changed as part of it. Each task below is
sized to be one independent, reviewable pull request.

## Phase 1 recap: what actually survived verification

Reproducing the ticket's blockers against the live repo (not trusting the ticket text)
changed the picture materially:

| Ticket claim | Verdict after reproduction |
|---|---|
| `verify:live-worker` returns 404 | **False as stated.** It fails with a 403 from this sandbox's own network egress policy (`Host not in allowlist: simset-showroom-proxy.simset-admin.workers.dev`), before ever reaching the real Worker. Real Worker health is unknown, not "404." |
| Worker has no encrypted secrets | **Unverifiable from this session** — no Cloudflare API token, no `wrangler` CLI, no cached auth exist here. |
| Production Worker cannot execute RPC | **Unverifiable from this session** — same network/credential gap. |
| RLS verification incomplete | **True**, confirmed again at the source level: `supabase/current_mvp_release.sql` has no `ENABLE ROW LEVEL SECURITY` / `GRANT` / `REVOKE` for `borrow_requests`, `borrow_request_items`, or `manikins`. |
| Worker allowlist exposes raw table endpoint | **True**: `cloudflare-worker/worker.js` `ALLOWED_PATHS` still lists `/rest/v1/borrow_requests` and `/rest/v1/borrow_request_items`, which no frontend code ever calls directly. |
| `verify:phase2` references old RPC contract | **False.** `scripts/verify-phase1-domain-state-machine.js` and `scripts/verify-phase2-borrower-flow.js` do not exist in the repo at all (`MODULE_NOT_FOUND`), and neither script is wired into `.github/workflows/*.yml` — they don't gate CI or deploys today. Orphaned `package.json` entries, not a live regression. |
| Working tree dirty/untracked files | **False** — `git status --short` is empty as of this session. |
| Production validation incomplete | **True, and stays true** regardless of any in-repo fix — this sandbox has no path to production (no Cloudflare/Supabase credentials, `*.workers.dev` egress blocked). |

Only two of the seven claims are confirmed, source-level, fixable-without-credentials
defects: the **RLS/GRANT gap** and the **Worker allowlist exposure**. Everything else is
either already false, already fixed, or structurally unverifiable without credentials
this session does not hold. The plan below is scoped to that reality — it does not
invent fixes for problems that reproduction disproved.

---

## Task breakdown

### PR-1 — Close the RLS/GRANT gap on the three unprotected tables
- **Priority:** P0
- **Objective:** Make `borrow_requests`, `borrow_request_items`, and `manikins` carry the
  same explicit `ENABLE ROW LEVEL SECURITY` + `REVOKE`/`GRANT` + policy treatment that
  every other table in `current_mvp_release.sql` already has, so the release script is
  self-certifying instead of silently relying on grants that may or may not survive from
  superseded historical scripts.
- **Files:** `supabase/current_mvp_release.sql` (additive block near the other
  `ENABLE ROW LEVEL SECURITY` statements, ~line 238); `docs/MIGRATION_ORDER.md` update
  noting the new block's location for future editors.
- **Dependencies:** None. Purely additive SQL; does not depend on any other task.
- **Risk:** Low technical risk (additive, no data touched). Medium *process* risk if
  applied to production without first running the read-only verification queries against
  the live catalog, because if the live DB currently has **no** protective policy at all
  (worse than assumed), this is the fix; if it already has protective policy inherited
  from `security_hardening_mvp.sql`, this becomes a confirming no-op — either way safe,
  but must be preceded by the read-only check in PR-1's verification step, not skipped.
- **Rollback:** `DROP POLICY` the new policies and re-run `REVOKE`/re-`GRANT` to restore
  the pre-change state; no data migration to reverse.
- **Verification:**
  1. Before merging: run (read-only, against a preview/staging Supabase project, not
     production) `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename IN ('manikins','borrow_requests','borrow_request_items');`
     and the matching `pg_policies` / `information_schema.role_table_grants` queries from
     `docs/AUDIT_2026-07-28_borrow_return_system.md` §10, and attach the output to the PR.
  2. After applying to preview: re-run the same queries, confirm RLS is `true` and no
     `anon` grants exist.
  3. From a machine with normal network access (not this sandbox): `curl -i
     ".../rest/v1/borrow_requests?select=id,tracking_id,borrower_name&limit=3"` with no
     auth header, confirm it no longer returns row data.
  4. Confirm `npm run verify:current-mvp` and `npm run smoke:main-pages` still pass
     unchanged (neither currently exercises table grants, so this is a regression guard,
     not proof of the fix — see PR-3).
- **Estimated effort:** 1–2 hours (SQL authoring + preview verification run).

### PR-2 — Trim the Worker's raw-table allowlist
- **Priority:** P0
- **Objective:** Remove `/rest/v1/borrow_requests` and `/rest/v1/borrow_request_items`
  from `ALLOWED_PATHS` in the Worker, since no frontend code calls them directly (all
  reads/writes to those tables go through `SECURITY DEFINER` RPCs) and their presence is
  attack surface with no current legitimate caller.
- **Files:** `cloudflare-worker/worker.js` (lines ~28–29).
- **Dependencies:** Should land **after or together with PR-1**, not before — removing
  the allowlist entries reduces exposure regardless, but PR-1 is the actual data-layer
  fix; do not treat PR-2 alone as sufficient (a caller could still reach these tables via
  any other REST client that talks to Supabase directly, bypassing the Worker entirely,
  if the Worker's URL is not the only path — confirm during PR-1 verification whether
  Supabase's REST API is reachable from outside the Worker at all).
- **Risk:** Low. Verify first that no admin/staff tooling (including any script under
  `scripts/`) calls these paths before removing them — `grep` confirms `website/js/*`
  does not, but this should be re-checked against any tooling added since the last audit.
- **Rollback:** Re-add the two lines; single-line revert.
- **Verification:** `npm run verify:current-mvp` (has existing assertions about
  `ALLOWED_PATHS` contents that must be updated in the same PR if they reference these
  paths — check `scripts/verify-current-mvp-contracts.js` for any `assertContains` on
  these specific paths before removing); manual `curl` against the deployed Worker (by
  someone with network access) confirming `403 Forbidden` for both paths post-deploy.
- **Estimated effort:** 30 minutes.

### PR-3 — Add a real CI check that would have caught PR-1's root cause
- **Priority:** P1
- **Objective:** Stand up a CI job that applies `current_mvp_release.sql` to an ephemeral
  Postgres service container and asserts RLS/grant state on the three tables from PR-1,
  so this class of gap cannot silently regress again. This directly answers the ticket's
  "Never mark something complete without evidence" requirement for *future* changes, not
  just this one.
- **Files:** new `.github/workflows/db-checks.yml`; new `supabase/tests/` directory with
  SQL assertion scripts.
- **Dependencies:** PR-1 must land first (otherwise this CI job is written to assert a
  state that doesn't exist yet — write it to fail against `main` before PR-1, confirm it
  fails, then merge PR-1, confirm it passes, as the test-first proof).
- **Risk:** Low — CI-only, ephemeral database, never touches production or staging.
- **Rollback:** Disable/delete the workflow file; no production impact either way.
- **Verification:** The job itself is the verification; additionally confirm it goes
  red when PR-1's SQL block is locally reverted, proving it actually detects the
  regression class it's meant to catch.
- **Estimated effort:** 3–4 hours (Postgres service container wiring + assertion
  authoring is the bulk of the time).

### PR-4 — Remove or restore the orphaned `verify:phase1` / `verify:phase2` scripts
- **Priority:** P3 (reclassified down from the ticket's P1 — confirmed not to block CI
  or deploys today; this is cleanup, not a live regression)
- **Objective:** Resolve the dangling `package.json` references to
  `scripts/verify-phase1-domain-state-machine.js` and
  `scripts/verify-phase2-borrower-flow.js`, which do not exist and throw
  `MODULE_NOT_FOUND` if anyone runs them. Two legitimate directions, **needs a decision
  before implementation, not a unilateral choice**:
  1. **Delete** the two `package.json` script entries, since their function (verifying
     the borrower flow and state machine) is already covered by
     `scripts/verify-current-mvp-contracts.js`'s assertions against
     `current_mvp_release.sql` — the phase-based scripts appear to predate the
     consolidation into that single release script and were never cleaned up.
  2. **Restore** them as thin wrappers that re-point at `current_mvp_release.sql` if
     there was intended behavior in the old phase scripts not now covered elsewhere —
     this requires someone who remembers what those scripts checked (they are not in git
     history under those exact filenames as far as this audit found — see PR-4's
     verification step).
- **Files:** `package.json`; possibly new files under `scripts/` if direction 2 is
  chosen.
- **Dependencies:** None.
- **Risk:** Very low either way — these scripts run in nobody's CI path today.
- **Rollback:** Trivial (single-file, single-purpose change).
- **Verification:** `git log --all --follow -- scripts/verify-phase1-domain-state-machine.js
  scripts/verify-phase2-borrower-flow.js` to check whether these files ever existed in
  this repo's history (determines whether this is "delete dead reference" or "restore
  accidentally-deleted file" — **this check should be the first step of implementing
  PR-4**, before choosing a direction).
- **Estimated effort:** 15 minutes if deleting; 2+ hours if restoring and history shows
  real prior content to recover.

### PR-5 — Trace and confirm the borrower self-cancel RPC path
- **Priority:** P1
- **Objective:** `website/js/history.js:90` calls `transition_borrow_request_status` for
  borrower-initiated cancellation. The prior audit did not fully trace whether this RPC
  (`current_mvp_release.sql:971-1037`) enforces "borrower can only cancel their own
  still-pending request" as rigorously as the older, narrower `cancel_borrow_request`
  RPC did. This PR is read-only analysis (plus a regression test if a gap is found), not
  a planned code change until the trace is done.
- **Files:** `supabase/current_mvp_release.sql` (read), `website/js/history.js` (read);
  new SQL test if a gap is found.
- **Dependencies:** None; can run in parallel with PR-1/PR-2.
- **Risk:** Unknown until traced — flag as N/A pending investigation.
- **Rollback:** N/A (investigation task; any resulting fix gets its own PR).
- **Verification:** Read `public.transition_borrow_request_status`'s full body, confirm
  it checks `auth.uid() = borrower_id` (or equivalent ownership check) and restricts the
  allowed `p_next_status` to `cancelled` only, matching `cancel_borrow_request`'s
  guarantees. Write this confirmation (or the found gap) into the audit doc.
- **Estimated effort:** 1 hour.

### PR-6 — Defense-in-depth: EXCLUDE constraint against overlapping assignments
- **Priority:** P2
- **Objective:** Add a database-level `EXCLUDE USING gist` constraint (via
  `btree_gist`) on manikin/unit + date-range overlap as a backstop to the existing
  RPC-level locking-and-check pattern, so a future code change that bypasses the RPC
  layer cannot silently reintroduce double-booking.
- **Files:** `supabase/current_mvp_release.sql` or a new migration file.
- **Dependencies:** None functionally, but should land after PR-3's CI harness exists so
  the constraint's behavior can be asserted in CI, not just claimed.
- **Risk:** Medium — must be carefully scoped (`WHERE status IN (...)`) to not reject
  legitimate historical/terminal-status rows that would otherwise "overlap."
- **Rollback:** `ALTER TABLE ... DROP CONSTRAINT`.
- **Verification:** New CI assertion (extends PR-3) attempting a genuine double-booking
  insert and confirming Postgres rejects it independent of RPC logic.
- **Estimated effort:** 2–3 hours.

### PR-7 — Realtime debounce on the staff dashboard
- **Priority:** P2
- **Objective:** `website/js/staff.js:228-236` reloads the entire staff board on every
  `postgres_changes` event with no debounce. Add a trailing debounce (e.g. 500ms–1s)
  around the `loadBoard()` call triggered by the realtime subscription.
- **Files:** `website/js/staff.js`.
- **Dependencies:** None.
- **Risk:** Low.
- **Rollback:** Single-function revert.
- **Verification:** Manual test (or a Playwright test against the existing mocked-smoke
  harness) firing multiple rapid mock realtime events and confirming `loadBoard` is
  called once, not N times.
- **Estimated effort:** 1 hour.

### PR-8 — De-duplicate `STATUS_LABELS`
- **Priority:** P3
- **Objective:** `website/js/staff.js` redeclares its own `STATUS_LABELS` map with
  slightly different Thai wording than the shared one in `website/js/supabase-client.js`
  (e.g. `ready: 'พร้อมรับอุปกรณ์'` vs `'พร้อมจ่าย'`). Make `staff.js` consume
  `app.STATUS_LABELS` instead of redeclaring it.
- **Files:** `website/js/staff.js`.
- **Dependencies:** None.
- **Risk:** Very low — confirm no other page relies on `staff.js`'s specific wording
  before removing it.
- **Rollback:** Trivial.
- **Verification:** Visual check across `staff.html`/`approver.html`/`report.html` that
  the same status now renders identical Thai text everywhere.
- **Estimated effort:** 30 minutes.

### PR-9 (process, not code) — Live infrastructure verification runbook
- **Priority:** P0 (blocking for any GO decision, but not a code change)
- **Objective:** Because this environment cannot reach Cloudflare or Supabase, the
  ticket's P0 items 2 and 3 (Worker secrets existence, production RPC execution) and all
  of Phase 4 (production validation) must be executed by someone who holds
  Cloudflare/Supabase credentials, following the exact commands already collected in
  `docs/AUDIT_2026-07-28_borrow_return_system.md` §10/§20/§21/§23.
- **Files:** None (this PR is a runbook execution, not a repo change) — results should
  be pasted back into a follow-up doc or this session for the final certification report.
- **Dependencies:** PR-1 and PR-2 should land first so the runbook validates the fixed
  state, not the known-broken one.
- **Risk:** N/A — read-only verification steps, explicitly no production writes.
- **Rollback:** N/A.
- **Verification:** The runbook's own checklist (§23 of the audit doc) is the
  verification.
- **Estimated effort:** 2–4 hours including the outstanding staff UAT the project's own
  `docs/RELEASE_ROLLBACK_2026-06-28.md` already calls for.

---

## Suggested merge order

1. PR-4 direction decision (blocks nothing else, but resolve the ambiguity early)
2. PR-1 → PR-2 (the two confirmed P0 source defects; PR-2 depends conceptually on PR-1)
3. PR-3 (CI harness proving PR-1)
4. PR-5 (read-only trace, can run anytime, ideally before declaring the approval/cancel
   flow fully verified)
5. PR-6, PR-7, PR-8 (independent hardening/polish, any order)
6. PR-9 (live runbook) — only after PR-1/PR-2 are merged, so it validates the fixed
   state

No task in this list requires Cloudflare or Supabase credentials except PR-9, which is
explicitly a runbook for someone who has them — nothing else in this plan is blocked by
the credential gap identified in Phase 1.
