# SiMSET Showroom - Cloudflare Worker Proxy

Proxies browser requests to Supabase. The current `website` app points the Supabase JS client at the Worker URL and uses the placeholder key `worker-managed-key`; the Worker injects the real Supabase key from its environment.

```
Browser -> Worker -> Supabase
         (no key)  (key in secret)
```

## Prerequisites

- Cloudflare account
- Node.js installed
- Wrangler CLI authenticated with `wrangler login`

## Deploy Steps

### 1. Deploy the Worker

```bash
cd cloudflare-worker
wrangler deploy
```

Expected production Worker origin:

```text
https://simset-showroom-proxy.simset-admin.workers.dev
```

### 2. Set Secrets

```bash
wrangler secret put SUPABASE_URL
# paste your Supabase project URL

wrangler secret put SUPABASE_KEY
# paste your Supabase publishable or anon key
```

### 3. Configure the Frontend Client

Open `website/js/supabase-client.js` and set the client URL to the Worker origin:

```js
const SIMSET_SUPABASE_URL = 'https://simset-showroom-proxy.simset-admin.workers.dev';
const SIMSET_SUPABASE_ANON = 'worker-managed-key';
```

The placeholder key is intentionally not a Supabase key. `worker.js` overwrites `apikey` and replaces the placeholder `Authorization` header with `env.SUPABASE_KEY`, while preserving real user JWTs for RLS.

### 4. Keep CSP and CORS Aligned

- `website/_headers` should allow `connect-src` only to the Worker origin for Supabase traffic.
- `worker.js` should keep `ALLOWED_ORIGINS` aligned with production and local development origins.

## Test the Worker

```bash
curl "https://simset-showroom-proxy.simset-admin.workers.dev/rest/v1/equipments?select=id&limit=1"
curl "https://simset-showroom-proxy.simset-admin.workers.dev/rest/v1/secret_admin_table"
```

The first request should return JSON. The second request should return `403 Forbidden`.

## Worker Behaviour

| Feature | Detail |
| --- | --- |
| Allowed endpoints | Explicit REST and RPC allowlist in `worker.js` |
| Cache | 60 seconds for successful GET responses |
| Rate limit | 60 requests per minute per IP |
| CORS | Configurable via `ALLOWED_ORIGINS` in `worker.js` |
| Secrets | `SUPABASE_URL`, `SUPABASE_KEY` are stored in Cloudflare Worker env/secrets |

## Local Development

```bash
wrangler dev
```

Create `cloudflare-worker/.dev.vars` locally:

```text
SUPABASE_URL=<your Supabase project URL>
SUPABASE_KEY=<your Supabase publishable or anon key>
```

Do not commit `.dev.vars`.
