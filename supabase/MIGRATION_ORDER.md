# Supabase Migration Order

This repository currently stores SQL as phase-based scripts, not as timestamped migrations. Use this file as the canonical order before a release until the SQL is converted into a real migration directory.

## Current MVP Release Script

For the active MVP, use `supabase/current_mvp_release.sql` as the consolidated release script for the browser-facing borrow, tracking, borrower history, identity claim, admin/status RPCs, exact manikin or equipment-unit assignment, status audit, automatic asset status sync, Wave 2 staff/report workflow, and Wave 3 allocation rules for rotating, room-dedicated, and advance-course-dedicated manikins.

The older phase scripts below are retained as historical source material until the project is converted into timestamped Supabase migrations. Do not apply them after `current_mvp_release.sql` unless you are intentionally comparing or rebuilding old behavior.

## Historical Phase Order

1. `supabase/rls_setup.sql`
   - Establishes baseline tables, RLS, and public/admin policies used by the original showroom system.

2. `supabase/audit_and_softdelete_migration.sql`
   - Adds audit and soft-delete support expected by admin and data management flows.

3. `supabase/rpc_functions.sql`
   - Adds atomic RPC contracts used by the browser and admin UI, including `admin_update_borrow_request_status`.

4. `supabase/lock_data_supabase_only.sql`
   - Historical no-login borrow submission contract. The current checkout uses `submit_public_borrow_request_v2` with optional `borrower_email`; authenticated history is connected later through `claim_borrow_request_identity`.

5. `supabase/security_hardening_raw_read_and_views.sql`
   - Replaces direct public raw reads with safer RPC/view contracts where available.

6. `supabase/security_hardening_mvp.sql`
   - Tightens function grants and MVP table policies after all referenced functions exist.

7. `supabase/admin_security_reinforcement.sql`
   - Applies stricter admin role/domain checks for admin-managed tables and RPCs.

8. `supabase/lock_status_flow.sql`
   - Historical status-flow restriction script. Do not apply it to the current MVP because its status set is narrower than `current_mvp_release.sql`.

9. `supabase/security_hardening_remaining_advisor.sql`
   - Applies remaining Supabase Advisor cleanup after the functional contracts are installed.

## Release Rule

For the current release, run only `supabase/current_mvp_release.sql` against a preview Supabase project first. Confirm the Supabase project ref in the SQL editor or connection string matches the project used by `cloudflare-worker/wrangler.toml` and Worker secrets before running it. Do not use `supabase/.temp/linked-project.json` as proof; that file is local scratch state and can point at an old test project. Do not layer `phase1_domain_state_machine.sql`, `phase2_borrower_flow.sql`, or `lock_status_flow.sql` on top of it; those files are retained only as historical source material and contain older status/RPC contracts.

## Known Cleanup

- `security_hardening_raw_read_and_views.sql` contains repeated definitions for some public borrow RPCs. Keep the last definition if manually consolidating.
- `submit_public_borrow_request` is deprecated in the consolidated release script. The active frontend must use `submit_public_borrow_request_v2`.
- The active release has no timestamped `supabase/migrations/` directory yet. Before a production RC, either tag `current_mvp_release.sql` as the baseline install script or split future deltas into timestamped migrations that never rewrite old applied files.
- Generated or temporary files under `supabase/.temp/` are not part of the release order.
