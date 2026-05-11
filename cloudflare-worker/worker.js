/**
 * SiMSET Showroom & Borrowing System — Cloudflare Worker Proxy
 *
 * - Proxies GET and POST requests securely to Supabase.
 * - Enforces allowed paths to prevent arbitrary DB queries.
 * - Rate-limits per IP: 60 requests / minute.
 * - Caches GET responses for 60 seconds (Cloudflare Cache API).
 * - Bypasses cache for POST requests (RPCs).
 * - Preserves user's JWT Authorization header for DB Row-Level Security.
 *
 * Secrets to set via: wrangler secret put SUPABASE_URL
 *                     wrangler secret put SUPABASE_KEY
 */

const ALLOWED_PATHS = new Set([
    // Legacy Showroom paths (GET)
    '/public_manikins',
    '/locations',
    '/capabilities',
    '/manikin_capabilities',

    // Borrowing System paths (GET & POST)
    '/rest/v1/equipments',
    '/rest/v1/manikins',
    '/rest/v1/locations',
    '/rest/v1/capabilities',
    '/rest/v1/manikin_capabilities',
    '/rest/v1/borrow_requests',
    '/rest/v1/borrow_request_items',
    '/rest/v1/audit_logs',
    '/rest/v1/teams',
    '/rest/v1/team_capabilities',
    '/rest/v1/vw_active_borrow_items',
    '/rest/v1/rpc/get_next_available_date',
    '/rest/v1/rpc/get_borrow_availability',
    '/rest/v1/rpc/get_borrow_request_status',
    '/rest/v1/rpc/submit_public_borrow_request',
    '/rest/v1/rpc/submit_borrow_request',
    '/rest/v1/rpc/cancel_borrow_request',
    '/rest/v1/rpc/admin_update_borrow_request_status',
    '/rest/v1/rpc/admin_approve_request',
    '/rest/v1/rpc/admin_reject_request',
    '/rest/v1/rpc/admin_receive_return',
    '/rest/v1/rpc/admin_receive_return_detailed',
    '/rest/v1/rpc/sync_manikin_capabilities',
    '/rest/v1/rpc/delete_location_atomic',
]);

const ALLOWED_PREFIXES = [
    '/auth/v1/',     // Allow all Supabase SDK Auth native endpoints
    '/realtime/v1/'  // Realtime websocket and polling endpoints
];

const RATE_LIMIT = 60;          // max requests per window per IP
const RATE_WINDOW_MS = 60_000;  // 1 minute window
const CACHE_TTL_S = 60;         // cache lifetime in seconds
const CLIENT_PLACEHOLDER_KEY = 'worker-managed-key';

const rateLimitMap = new Map(); // ip → { count, resetAt }

const ALLOWED_ORIGINS = new Set([
    'https://simset-showroom.pages.dev',
    'https://encoding-preview.simset-showroom.pages.dev',
    'http://localhost:8788',   // wrangler pages dev
    'http://127.0.0.1:5500',  // local live-server dev
]);

function corsHeaders(origin) {
    const allowedOrigin = ALLOWED_ORIGINS.has(origin)
        ? origin
        : 'https://simset-showroom.pages.dev';

    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, apikey, Authorization, x-client-info, Prefer, x-supabase-api-version, content-profile, accept-profile, range, range-unit',
        'Vary': 'Origin',
    };
}

export default {
    async fetch(request, env, ctx) {
        const origin = request.headers.get('Origin') || '';
        const cors = corsHeaders(origin);

        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: cors });
        }

        if (request.method !== 'GET' && request.method !== 'POST') {
            return new Response('Method Not Allowed', { status: 405, headers: cors });
        }

        const url = new URL(request.url);
        let path = url.pathname;

        // Legacy strip /api prefix
        if (path.startsWith('/api/')) {
            path = path.slice(4);
        }

        let isAllowed = ALLOWED_PATHS.has(path) || ALLOWED_PREFIXES.some(prefix => path.startsWith(prefix));

        if (!isAllowed) {
            return new Response('Forbidden Access', { status: 403, headers: cors });
        }

        // ── Rate limiting ─────────────────────────────────────────────────────────
        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
        const now = Date.now();
        let rl = rateLimitMap.get(ip);

        if (!rl || now > rl.resetAt) {
            rl = { count: 0, resetAt: now + RATE_WINDOW_MS };
            rateLimitMap.set(ip, rl);
        }
        rl.count++;

        if (rl.count > RATE_LIMIT) {
            return new Response('Too Many Requests', {
                status: 429,
                headers: { ...cors, 'Retry-After': '60' },
            });
        }

        // ── Cache check (GET only) ────────────────────────────────────────────────
        const cache = caches.default;
        const cacheKey = new Request(url.toString());

        if (request.method === 'GET') {
            const cached = await cache.match(cacheKey);
            if (cached) {
                const hit = new Response(cached.body, cached);
                hit.headers.set('X-Cache', 'HIT');
                Object.entries(cors).forEach(([k, v]) => hit.headers.set(k, v));
                return hit;
            }
        }

        // ── Proxy to Supabase ─────────────────────────────────────────────────────
        // If path is a legacy showroom path (doesn't start with /rest/ or /auth/), prepend /rest/v1
        let upstreamPath = path;
        if (!upstreamPath.startsWith('/rest/') && !upstreamPath.startsWith('/auth/')) {
            upstreamPath = '/rest/v1' + upstreamPath;
        }

        const supabaseTarget = `${env.SUPABASE_URL}${upstreamPath}${url.search}`;

        // Forward headers properly
        const fetchHeaders = new Headers(request.headers);
        fetchHeaders.set('apikey', env.SUPABASE_KEY);

        const authHeader = fetchHeaders.get('Authorization') || '';
        const hasClientSession = authHeader.startsWith('Bearer ')
            && authHeader !== `Bearer ${CLIENT_PLACEHOLDER_KEY}`;

        // Preserve real user JWTs for RLS. Replace the public placeholder used by the browser SDK.
        if (!hasClientSession) {
            fetchHeaders.set('Authorization', `Bearer ${env.SUPABASE_KEY}`);
        }

        // Strip CF headers to prevent conflicts
        fetchHeaders.delete('host');
        fetchHeaders.delete('cf-connecting-ip');

        let upstream;
        try {
            upstream = await fetch(supabaseTarget, {
                method: request.method,
                headers: fetchHeaders,
                body: request.method === 'POST' ? await request.arrayBuffer() : undefined,
                redirect: 'manual'
            });
        } catch {
            return new Response('Bad Gateway', { status: 502, headers: cors });
        }

        const responseHeaders = new Headers(upstream.headers);
        Object.entries(cors).forEach(([k, v]) => responseHeaders.set(k, v));

        const isError = !upstream.ok;

        if (!isError && request.method === 'GET' && upstream.status === 200) {
            responseHeaders.set('Cache-Control', `public, max-age=${CACHE_TTL_S}`);
            responseHeaders.set('X-Cache', 'MISS');
        } else {
            responseHeaders.set('Cache-Control', 'no-store');
        }

        const response = new Response(upstream.body, {
            status: upstream.status,
            statusText: upstream.statusText,
            headers: responseHeaders,
        });

        // Store in Cloudflare cache (background) if successful GET
        if (!isError && request.method === 'GET' && upstream.status === 200) {
            ctx.waitUntil(cache.put(cacheKey, response.clone()));
        }

        return response;
    },
};
