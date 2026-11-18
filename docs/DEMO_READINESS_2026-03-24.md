# Demo Readiness - 2026-03-24

Scope: tracking page readiness for demo, current frontend/worker endpoint alignment, and a short handoff checklist for review with management.

## Tracking Demo Status

Status: Ready for demo with caveats

- `website/tracking.html`: cleaned user-facing Thai copy and labels
- `website/js/tracking.js`: cleaned runtime messages, history text, cancel flow text, and fallback labels
- `website/track.html`: cleaned redirect page copy so legacy URL no longer shows mojibake before redirect

What was verified locally:

- `npm run smoke:main-pages` passed
- tracking page smoke passed
- tablet tracking layout smoke passed
- history page mobile smoke passed
- JS syntax checks passed for tracking files

## Frontend / Worker Alignment

Current state is mixed. The application does not consistently route all frontend traffic through the Cloudflare Worker.

### Direct to Supabase

- `website/borrow.js`
- `website/js/tracking.js`
- `website/admin/admin.js`
- `website/admin/login.js`
- `website/history.js`
- `website/success.js`

These files currently use `https://ifogcvymwhcfbfjzhwsl.supabase.co` directly.

### Via Worker

- `website/app.js` realtime client uses `https://simset-showroom-proxy.simset-admin.workers.dev`
- `website/track.js` legacy script still points to worker, but `track.html` now redirects away from that path

### Worker Source Expectation

`cloudflare-worker/worker.js` allows the main borrow, tracking, and admin REST/RPC paths in source.

### Runtime Risk

`node scripts/smoke-endpoints.mjs` against the configured worker returned `404` for all tested API endpoints, while the public Pages URLs still returned `200`.

Interpretation:

- The deployed worker may not match local source
- Or the smoke target worker URL is not the worker actually used by the current frontend
- Or the frontend is bypassing the worker for critical flows, which hides worker deployment drift

For tomorrow's demo, do not switch tracking to the worker unless the live worker is revalidated first.

## Short Checklist For Management Review

Use this as the demo readiness checklist.

- `PASS` Public pages load and render without syntax-level breakage
- `PASS` Tracking page copy is readable and ready for user-facing demo
- `PASS` Legacy tracking URL redirects to the new tracking page
- `PASS` Local smoke coverage for public, borrow, tracking, history, success, and admin UI shell
- `WATCH` Tracking, borrow, admin, history, and success pages currently rely on direct Supabase access
- `WATCH` Worker/source alignment is not yet proven in production
- `WATCH` Production worker smoke still reports 404 on allowed API routes
- `WATCH` Full end-to-end environment verification still needs one last run on the exact demo target

## Recommended Demo Plan

- Demo `index.html` only as entry context
- Focus on `borrow.html` -> `success.html` -> `tracking.html`
- Treat admin as optional demo content unless the live environment is rechecked right before the session
- Keep the worker alignment issue as a known technical follow-up, not a demo talking point unless asked

## Immediate Pre-Demo Steps

- Run `npm run smoke:main-pages`
- Open `website/tracking.html` on the actual demo environment and confirm readable Thai text
- Test one real tracking ID on the exact environment that will be shown
- If admin must be shown, verify login and one read-only dashboard path right before demo
