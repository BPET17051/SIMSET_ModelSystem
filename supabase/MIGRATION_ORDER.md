# Supabase Migration Order

This repository currently stores SQL as phase-based scripts, not as timestamped migrations. Use this file as the canonical order before a release until the SQL is converted into a real migration directory.

## Current MVP Release Script

For the active MVP, use `supabase/current_mvp_release.sql` as the consolidated release script for the browser-facing borrow, tracking, borrower history, admin status RPCs, exact manikin assignment, status audit, automatic `manikins.status` sync, Wave 2 staff/report workflow, and Wave 3 allocation rules for rotating, room-dedicated, and advance-course-dedicated manikins.

The older phase scripts below are retained as historical source material until the project is converted into timestamped Supabase migrations. Do not apply them after `current_mvp_release.sql` unless you are intentionally comparing or rebuilding old behavior.

## Historical Phase Order

1. `supabase/rls_setup.sql`
   - Establishes baseline tables, RLS, and public/admin policies used by the original showroom system.

2. `supabase/audit_and_softdelete_migration.sql`
   - Adds audit and soft-delete support expected by admin and data management flows.

3. `supabase/rpc_functions.sql`
   - Adds atomic RPC contracts used by the browser and admin UI, including `admin_update_borrow_request_status`.

4. `supabase/lock_data_supabase_only.sql`
   - Historical no-login borrow submission contract. The current checkout uses authenticated `submit_borrow_request`.

5. `supabase/security_hardening_raw_read_and_views.sql`
   - Replaces direct public raw reads with safer RPC/view contracts where available.

6. `supabase/security_hardening_mvp.sql`
   - Tightens function grants and MVP table policies after all referenced functions exist.

7. `supabase/admin_security_reinforcement.sql`
   - Applies stricter admin role/domain checks for admin-managed tables and RPCs.

8. `supabase/lock_status_flow.sql`
   - Applies final status-flow restrictions after the admin and borrower RPCs are present.

9. `supabase/security_hardening_remaining_advisor.sql`
   - Applies remaining Supabase Advisor cleanup after the functional contracts are installed.

## Release Rule

For the current release, run `supabase/current_mvp_release.sql` against a preview Supabase project first. Use the historical phase order only when rebuilding an older environment for comparison.

## Known Cleanup

- `security_hardening_raw_read_and_views.sql` contains repeated definitions for some public borrow RPCs. Keep the last definition if manually consolidating.
- `submit_public_borrow_request` is deprecated in the consolidated release script. The active frontend must use authenticated `submit_borrow_request`.
- Generated or temporary files under `supabase/.temp/` are not part of the release order.
