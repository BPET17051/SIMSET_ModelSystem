# SiMSET Showroom — Cloudflare Worker Proxy

Proxies browser requests to Supabase, hiding the API key entirely from client code.

```
Browser → Worker → Supabase
         (no key)  (key in secret)
```

---

## Prerequisites

- [Cloudflare account](https://dash.cloudflare.com/sign-up) (free plan works)
- Node.js installed

---

## Deploy Steps

### 1. Install Wrangler CLI

```bash
npm install -g wrangler
wrangler login
```

### 2. Deploy the Worker

```bash
cd cloudflare-worker
wrangler deploy
```

After deploy, Wrangler will print your Worker URL:
```
https://simset-showroom-proxy.<your-subdomain>.workers.dev
```

### 3. Set Secrets (run these 2 commands)

```bash
wrangler secret put SUPABASE_URL
# → paste: https://ifogcvymwhcfbfjzhwsl.supabase.co

wrangler secret put SUPABASE_KEY
# → paste: sb_publishable_DZyIDHVZ-kfD1o3baz0qmw_tTyRCJG8
```

> **Note:** Secrets are encrypted and never appear in your code or Cloudflare dashboard.

### 4. Update app.js

Open `website/app.js` and set `WORKER_URL` to your Worker URL:

```js
const WORKER_URL = 'https://simset-showroom-proxy.<your-subdomain>.workers.dev/api';
```

### 5. (Optional) Lock CORS to your domain

In `worker.js`, change:
```js
const ALLOWED_ORIGIN = '*';
```
to:
```js
const ALLOWED_ORIGIN = 'https://your-showroom-domain.com';
```
Then redeploy with `wrangler deploy`.

---

## Test the Worker

```bash
# Should return JSON array of manikins
curl "https://simset-showroom-proxy.<your>.workers.dev/api/public_manikins?order=asset_name.asc&limit=5"

# Should return 403 Forbidden
curl "https://simset-showroom-proxy.<your>.workers.dev/api/secret_admin_table"
```

---

## Worker Behaviour

| Feature | Detail |
|---|---|
| Allowed endpoints | `public_manikins`, `locations`, `capabilities`, `manikin_capabilities` |
| Cache | 60 seconds (Cloudflare edge cache) |
| Rate limit | 60 requests / minute per IP → HTTP 429 |
| CORS | Configurable via `ALLOWED_ORIGIN` in `worker.js` |
| Secrets | `SUPABASE_URL`, `SUPABASE_KEY` — never in source code |

---

## Local Development

```bash
wrangler dev
# Worker runs at http://localhost:8787
# Set .dev.vars for local secrets:
```

Create `cloudflare-worker/.dev.vars`:
```
SUPABASE_URL=https://ifogcvymwhcfbfjzhwsl.supabase.co
SUPABASE_KEY=sb_publishable_DZyIDHVZ-kfD1o3baz0qmw_tTyRCJG8
```

> `.dev.vars` is gitignored automatically by Wrangler. **Never commit this file.**
