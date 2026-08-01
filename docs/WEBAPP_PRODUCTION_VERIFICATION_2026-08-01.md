# SIMSET Borrow Webapp Verification - 2026-08-01

## Decision

**CONDITIONAL GO for frontend shell only. NO-GO for production borrow/return workflow.**

## Evidence

- `npm run verify:current-mvp`: passed.
- `npm run verify:phase1`: passed.
- `npm run verify:phase2`: passed after updating the test contract to the current MVP guest checkout and identity-claim flow.
- `npm run smoke:main-pages`: passed for 12 local static pages.
- `python .agent/skills/webapp-testing/scripts/playwright_runner.py https://simset-showroom.pages.dev/ --screenshot`: production home page loaded with HTTP 200.
- `npm run verify:live-worker`: failed because `https://simset-showroom-proxy.simset-admin.workers.dev/rest/v1/equipments?select=id&limit=1` returned 404.
- `node scripts/smoke-endpoints.mjs --site=https://simset-showroom.pages.dev --worker=https://simset-showroom-proxy.simset-admin.workers.dev`: frontend page checks passed, 19 API checks failed with 404.
- `npx wrangler secret list --name simset-showroom-proxy`: returned `[]`.

## Confirmed Findings

### P0 - Backend proxy URL is not serving the Worker API

The configured frontend API base is `https://simset-showroom-proxy.simset-admin.workers.dev`, but the root of that host returns the frontend HTML document and `/rest/v1/*` endpoints return 404. This prevents catalog data, checkout submit, tracking, staff, approver, and report flows from being validated as working production flows.

### P0 - Worker secrets are not configured in the current Cloudflare Worker context

`wrangler secret list --name simset-showroom-proxy` returned an empty list. The Worker code requires at minimum `SUPABASE_KEY`; service operations also require `SUPABASE_SERVICE_ROLE_KEY`, and LINE dispatch requires LINE secrets. Deploying the Worker without those secrets would not make the production flow usable.

### P2 - Phase 2 verification script was stale

`scripts/verify-phase2-borrower-flow.js` still expected the older authenticated-only `submit_borrow_request` flow. The current release uses public guest checkout via `submit_public_borrow_request_v2`, optional `borrower_email`, and authenticated claim/history via `claim_borrow_request_identity` and `get_my_borrow_requests`. The script was updated to verify the current architecture instead of the old one.

## Catalog UI Check

The active `website/js/catalog.js` and the production `https://simset-showroom.pages.dev/js/catalog.js` no longer contain:

- `รหัสรายการ:`
- `ประเภทอุปกรณ์:`
- `เงื่อนไข:`
- `จากทั้งหมด`

If testers still see those strings, the likely cause is browser cache. Use hard refresh or an incognito window before retesting.

## Required Next Actions

1. Fix Cloudflare routing so `simset-showroom-proxy.simset-admin.workers.dev` runs `cloudflare-worker/worker.js`, not the frontend site.
2. Set Worker secrets: `SUPABASE_KEY` and `SUPABASE_SERVICE_ROLE_KEY` at minimum.
3. Re-run `npm run verify:live-worker`.
4. Re-run `node scripts/smoke-endpoints.mjs --site=https://simset-showroom.pages.dev --worker=https://simset-showroom-proxy.simset-admin.workers.dev`.
5. Run one real production E2E: catalog -> checkout -> approval -> pickup -> return -> status/audit verification.

## Deploy Decision

No frontend or Worker production deploy was performed in this verification run. The blocker is production backend routing/secrets, so deploying frontend-only changes would not prove the borrow/return workflow works.
