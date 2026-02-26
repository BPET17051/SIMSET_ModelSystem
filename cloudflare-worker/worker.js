/**
 * SiMSET Showroom — Cloudflare Worker Proxy
 *
 * Sits between the browser and Supabase.
 * - Allowlists only the 4 endpoints the showroom needs
 * - Caches responses for 60 seconds (Cloudflare Cache API)
 * - Rate-limits per IP: 60 requests / minute
 * - Keeps SUPABASE_URL and SUPABASE_KEY secret (Worker env vars)
 *
 * Secrets to set via: wrangler secret put SUPABASE_URL
 *                     wrangler secret put SUPABASE_KEY
 */

// Only these Supabase table paths may be proxied
const ALLOWED_PATHS = new Set([
    '/public_manikins',
    '/locations',
    '/capabilities',
    '/manikin_capabilities',
]);

const RATE_LIMIT = 60;          // max requests per window per IP
const RATE_WINDOW_MS = 60_000;      // 1 minute window
const CACHE_TTL_S = 60;          // cache lifetime in seconds

// In-memory rate-limit store (per Worker isolate — fine for low-traffic showroom)
const rateLimitMap = new Map();     // ip → { count, resetAt }

// ── CORS ──────────────────────────────────────────────────────────────────────
// TODO: change '*' to your actual showroom origin for tighter security
// e.g. 'https://simset.yourdomain.com'
const ALLOWED_ORIGIN = '*';

function corsHeaders(origin) {
    return {
        'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default {
    async fetch(request, env, ctx) {
        const cors = corsHeaders();

        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: cors });
        }

        // Only GET requests allowed
        if (request.method !== 'GET') {
            return new Response('Method Not Allowed', { status: 405, headers: cors });
        }

        const url = new URL(request.url);

        // Strip /api prefix: /api/locations → /locations
        let path = url.pathname.startsWith('/api')
            ? url.pathname.slice(4) || '/'
            : url.pathname;

        // Allowlist enforcement
        if (!ALLOWED_PATHS.has(path)) {
            return new Response('Forbidden', { status: 403, headers: cors });
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

        // ── Cache check ───────────────────────────────────────────────────────────
        const cache = caches.default;
        const cacheKey = new Request(url.toString());
        const cached = await cache.match(cacheKey);

        if (cached) {
            const hit = new Response(cached.body, cached);
            hit.headers.set('X-Cache', 'HIT');
            Object.entries(cors).forEach(([k, v]) => hit.headers.set(k, v));
            return hit;
        }

        // ── Proxy to Supabase ─────────────────────────────────────────────────────
        const supabaseTarget = `${env.SUPABASE_URL}/rest/v1${path}${url.search}`;

        let upstream;
        try {
            upstream = await fetch(supabaseTarget, {
                headers: {
                    apikey: env.SUPABASE_KEY,
                    Authorization: `Bearer ${env.SUPABASE_KEY}`,
                    'Content-Type': 'application/json',
                },
            });
        } catch {
            return new Response('Bad Gateway', { status: 502, headers: cors });
        }

        if (!upstream.ok) {
            return new Response('Upstream Error', { status: 502, headers: cors });
        }

        const body = await upstream.text();
        const response = new Response(body, {
            status: 200,
            headers: {
                ...cors,
                'Content-Type': 'application/json',
                'Cache-Control': `public, max-age=${CACHE_TTL_S}`,
                'X-Cache': 'MISS',
            },
        });

        // Store in Cloudflare cache (background)
        ctx.waitUntil(cache.put(cacheKey, response.clone()));

        return response;
    },
};
