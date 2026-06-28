# SIMSET Borrow Release And Rollback Note

Release checkpoint: `v2026.06.28-mvp.1`

Scope: SIMSET Borrow MVP for pilot/UAT. This checkpoint covers the public borrower request flow, L1 approval, staff pickup/return workflow, condition snapshots, tracking page, report page, Cloudflare Worker proxy, and consolidated Supabase SQL release script.

## Release Gate

Run these checks before enabling real staff use:

```powershell
npm run verify:current-mvp
npm run smoke:main-pages
npm run smoke:deploy-workflow
npm run verify:live-worker
npm audit --audit-level=high
```

Expected result: all verification scripts pass, and there are no high/critical dependency vulnerabilities.

## Supabase Backup Requirement

Do this before production data is entered.

Current local limitation: this workstation does not have `supabase`, `pg_dump`, or `psql` available in PATH, and no database connection string is present in environment variables. Because of that, this repository can only keep a schema/release-script backup locally. A live data backup must be exported from Supabase Dashboard or from a machine that has the database connection string.

Recommended export options:

```powershell
# Option A: Supabase CLI, after supabase link
supabase db dump -f .backups/supabase/2026-06-28-mvp/schema.sql
supabase db dump --data-only --use-copy -f .backups/supabase/2026-06-28-mvp/data.sql

# Option B: direct Postgres tools, if SUPABASE_DB_URL is available
pg_dump --schema-only --no-owner --no-acl --file .backups/supabase/2026-06-28-mvp/schema.sql "$env:SUPABASE_DB_URL"
pg_dump --data-only --no-owner --no-acl --column-inserts --file .backups/supabase/2026-06-28-mvp/data.sql "$env:SUPABASE_DB_URL"
```

Keep `.backups/` outside Git. If the export contains real borrower data or staff email addresses, treat it as sensitive operational data.

## Rollback Plan

Use rollback only if the release causes broken borrowing, broken staff workflow, data corruption risk, or failed authentication for staff.

1. Stop active rollout: tell staff to pause new order processing and keep current tracking IDs.
2. Frontend rollback: in Cloudflare Pages, redeploy the previous known-good deployment, or revert to the previous Git tag and redeploy.
3. Worker rollback: redeploy the previous Worker version from the previous Git tag, then run `npm run verify:live-worker`.
4. Database rollback:
   - Preferred: restore the Supabase project from Dashboard backup/PITR to the pre-release time.
   - If using logical export: restore into a new Supabase project first, verify, then switch Worker secrets to the restored project.
   - Do not run ad-hoc destructive SQL in production without a verified backup.
5. Post-rollback verification:

```powershell
npm run verify:current-mvp
npm run smoke:main-pages
npm run verify:live-worker
```

## Production Notes

- Borrower-facing pages do not require borrower login.
- Staff/admin access is gated by the project login/admin role flow.
- `/admin.html` is now a hub/legacy-safe entry and should not be used as the main operational approval screen.
- Main operational screens are `/approver.html`, `/staff.html`, `/report.html`, and `/history.html`.
- UAT with 2-3 staff using real equipment names remains the final business sign-off before calling the system 100% live.
