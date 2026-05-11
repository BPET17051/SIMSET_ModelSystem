# Current SIMSET Borrow MVP

This document is the current source of truth for the MVP route and release shape.

## Current Routes

| Route | Purpose |
| --- | --- |
| `/` / `/index.html` | Equipment catalog |
| `/product-details.html?id=<equipment_id>` | Equipment details |
| `/cart.html` | Borrow list review |
| `/checkout.html?equipment_id=<equipment_id>&qty=1` | Public borrow request submission |
| `/track.html?id=<tracking_id>` | Request tracking |
| `/admin-login.html` | Admin login |
| `/admin.html` | Admin request workflow |

## Current Runtime Path

Browser traffic uses `website/js/supabase-client.js`, which points the Supabase JS client at:

```text
https://simset-showroom-proxy.simset-admin.workers.dev
```

The browser uses `worker-managed-key` as a placeholder. The Worker injects the real Supabase key from Cloudflare secrets and preserves real user JWTs for RLS.

## Current Verification Commands

```bash
npm run verify:current-mvp
npm run smoke:main-pages
npm run smoke:deploy-workflow
```

## Historical Docs

Older planning documents may mention previous routes and files from the redesign branch. Treat those as historical unless they explicitly reference this MVP route map.

For release staging, use `docs/RELEASE_SOURCE_SET.md` to decide what belongs in the release source set and what is local/generated output.
