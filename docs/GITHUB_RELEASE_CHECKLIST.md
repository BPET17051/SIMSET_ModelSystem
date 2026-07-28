# GitHub Release Checklist

Use this when running `Actions > Deploy Production` for the current SIMSET Borrow MVP.

## Before Clicking Run

1. Confirm the release branch is `main` or `master`.
2. Confirm the target Cloudflare Pages project is `simset-showroom`.
3. Confirm `git remote -v` does not contain a plaintext token. The URL should look like `https://github.com/BPET17051/SIMSET_ModelSystem.git`.
4. Confirm GitHub secrets exist:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
5. Confirm Cloudflare Worker secrets exist by running `npx wrangler secret list` from `cloudflare-worker`:
   - `SUPABASE_URL`
   - `SUPABASE_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `LINE_CHANNEL_ACCESS_TOKEN`
   - `LINE_DISPATCH_SECRET`
   - `LINE_TARGET_STAFF`
   - `LINE_TARGET_HEAD`
6. Confirm GitHub environment `production` has required reviewers enabled.

## What Must Pass Automatically

1. Encoding guard
2. JavaScript syntax checks
3. `npm run verify:current-mvp`
4. `npm run smoke:main-pages`
5. `npm run smoke:deploy-workflow`

## Supabase Preflight

1. Apply `supabase/current_mvp_release.sql` to the preview Supabase project first.
2. Run the verification queries at the end of `supabase/current_mvp_release.sql`.
3. Confirm `admin_update_borrow_request_status`, `submit_public_borrow_request_v2`, and `get_borrow_request_status` exist and have the expected grants.
4. Only apply the same SQL to production after preview verification passes.

## Worker Preflight

1. Run `wrangler deploy` from `cloudflare-worker`.
2. Confirm the deployed Worker origin is `https://simset-showroom-proxy.simset-admin.workers.dev`.
3. Run `npx wrangler secret list` and confirm the Worker has the secrets listed above. An empty list means the browser will fail against Supabase even if Pages deploys correctly.
4. Run `npm run verify:live-worker`.
5. Confirm a blocked table path returns `403 Forbidden`.

## Approval Step

1. Open the pending `production` deployment approval in GitHub.
2. Review the workflow logs from `preflight`.
3. Approve only if smoke, contract, syntax, and encoding checks are green.

## After Deploy

1. Open `/`.
2. Open `/cart.html`.
3. Open `/checkout.html`.
4. Open `/track.html`.
5. Open `/admin-login.html`.
6. Open `/admin.html` with an admin account.
7. Confirm Thai text renders correctly and no layout break is visible.
