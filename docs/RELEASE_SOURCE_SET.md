# Release Source Set

Use this file to separate release source from local scratch/generated files before tagging or deploying.

## Release Source

These paths are part of the current MVP release surface:

- `.github/workflows/deploy-production.yml`
- `.github/workflows/frontend-smoke.yml`
- `.gitattributes`
- `.gitignore`
- `package.json`
- `package-lock.json`
- `website/`
- `cloudflare-worker/worker.js`
- `cloudflare-worker/wrangler.toml`
- `cloudflare-worker/README.md`
- `scripts/smoke-main-pages.js`
- `scripts/smoke-deploy-workflow.js`
- `scripts/verify-current-mvp-contracts.js`
- `scripts/verify-live-worker.mjs`
- `scripts/static-serve.js`
- `supabase/current_mvp_release.sql`
- `supabase/MIGRATION_ORDER.md`
- `docs/superpowers/plans/2026-06-21-wave1-foundation-stabilization.md`
- `docs/superpowers/plans/2026-06-21-wave2-core-requirements.md`
- `docs/superpowers/plans/2026-06-22-wave3-manikin-allocation.md`
- `docs/superpowers/plans/2026-06-22-public-borrower-request-flow.md`
- `docs/CURRENT_MVP_SYSTEM.md`
- `docs/GITHUB_RELEASE_CHECKLIST.md`
- `docs/RELEASE_ROLLBACK_2026-06-28.md`
- `docs/RELEASE_SOURCE_SET.md`

## Historical Or Planning Material

These paths can remain in the repository, but should not be treated as release behavior unless updated to reference `docs/CURRENT_MVP_SYSTEM.md`:

- `docs/*PLAN*.md`
- `docs/*SPEC*.md`
- `docs/*AUDIT*.md`
- `docs/UI_*`
- `supabase/phase1_domain_state_machine.sql`
- `supabase/phase2_borrower_flow.sql`
- `supabase/lock_data_supabase_only.sql`
- `website_legacy/`
- `testsprite_tests/`

## Local Scratch Or Generated Output

These should not be staged for release:

- `.wrangler/`
- `cloudflare-worker/.wrangler/`
- `cloudflare-worker/dist/`
- `cloudflare-worker/check_url.txt`
- `cloudflare-worker/SUPABASE_URL.txt`
- `supabase/.temp/`
- `tmp_*.txt`
- `tmp_*.png`
- `test_out.txt`
- `check-output.txt`
- `.backups/`
- `.claude/`
- `delete-all-deployments/`
- `delete-all-deployments.zip`
- `encoding_scan_report.txt`
- `pages_list.txt`
- `patch_style_css.py`
- `remove_loader.py`
- `__pycache__/`

## Release Gate

Before release, run:

```bash
npm run verify:current-mvp
npm run smoke:main-pages
npm run smoke:deploy-workflow
npm audit --audit-level=high
```

Then deploy the Worker, set `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_TARGET_STAFF`, `LINE_TARGET_HEAD`, and `LINE_DISPATCH_SECRET` as Cloudflare secrets, and run:

```bash
npm run verify:live-worker
```
