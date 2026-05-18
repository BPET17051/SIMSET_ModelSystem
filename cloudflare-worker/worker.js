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
    '/rest/v1/notification_logs',
    '/rest/v1/audit_logs',
    '/rest/v1/teams',
    '/rest/v1/team_capabilities',
    '/rest/v1/vw_active_borrow_items',
    '/rest/v1/rpc/get_next_available_date',
    '/rest/v1/rpc/get_borrow_availability',
    '/rest/v1/rpc/get_borrow_request_status',
    '/rest/v1/rpc/get_admin_kpis',
    '/rest/v1/rpc/submit_public_borrow_request',
    '/rest/v1/rpc/submit_borrow_request',
    '/rest/v1/rpc/cancel_borrow_request',
    '/rest/v1/rpc/cancel_borrow_request_public',
    '/rest/v1/rpc/admin_update_borrow_request_status',
    '/rest/v1/rpc/admin_approve_request',
    '/rest/v1/rpc/admin_reject_request',
    '/rest/v1/rpc/admin_cancel_request',
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

function jsonResponse(body, init = {}) {
    return new Response(JSON.stringify(body), {
        ...init,
        headers: {
            'Content-Type': 'application/json',
            ...(init.headers || {}),
        },
    });
}

async function verifyTurnstile(token, request, env) {
    if (!env.TURNSTILE_SECRET_KEY) {
        return { success: false, error: 'Turnstile secret is not configured' };
    }

    const form = new FormData();
    form.append('secret', env.TURNSTILE_SECRET_KEY);
    form.append('response', token || '');
    const ip = request.headers.get('CF-Connecting-IP');
    if (ip) form.append('remoteip', ip);

    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body: form,
    });

    if (!response.ok) {
        return { success: false, error: 'Turnstile verification service failed' };
    }

    return response.json();
}

async function requireAdmin(request, env) {
    const authHeader = request.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) return null;

    const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
        headers: {
            apikey: env.SUPABASE_KEY,
            Authorization: authHeader,
        },
    });

    if (!response.ok) return null;
    const user = await response.json();
    return user?.app_metadata?.role === 'admin' ? authHeader : null;
}

async function supabaseJson(env, path, init = {}) {
    const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_KEY;
    const response = await fetch(`${env.SUPABASE_URL}${path}`, {
        ...init,
        headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
            ...(init.headers || {}),
        },
    });
    const text = await response.text();
    let data = null;
    if (text) {
        try {
            data = JSON.parse(text);
        } catch {
            data = text;
        }
    }
    return { response, data };
}

async function handleBorrowRequestNotification(request, env, cors) {
    const adminAuth = await requireAdmin(request, env);
    if (!adminAuth) {
        return jsonResponse({ error: 'Admin authentication required' }, { status: 401, headers: cors });
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return jsonResponse({ error: 'Invalid JSON body' }, { status: 400, headers: cors });
    }

    const requestId = body.request_id;
    const type = body.type;
    const force = body.force === true;
    if (!requestId || !['approved', 'rejected'].includes(type)) {
        return jsonResponse({ error: 'request_id and valid type are required' }, { status: 400, headers: cors });
    }

    const existingPath = `/rest/v1/notification_logs?request_id=eq.${encodeURIComponent(requestId)}&type=eq.${encodeURIComponent(type)}&status=eq.success&select=id,sent_at&limit=1`;
    const existing = await supabaseJson(env, existingPath, { method: 'GET' });
    if (existing.response.ok && Array.isArray(existing.data) && existing.data.length && !force) {
        return jsonResponse({ status: 'skipped', reason: 'already_sent', log: existing.data[0] }, { headers: cors });
    }

    const select = 'id,tracking_id,borrower_name,borrower_email,purpose,status,cancel_reason,created_at,borrow_request_items(qty_borrowed,start_date,end_date,equipments(name_th))';
    const requestPath = `/rest/v1/borrow_requests?id=eq.${encodeURIComponent(requestId)}&select=${encodeURIComponent(select)}&limit=1`;
    const requestResult = await supabaseJson(env, requestPath, { method: 'GET' });
    if (!requestResult.response.ok || !Array.isArray(requestResult.data) || !requestResult.data.length) {
        return jsonResponse({ error: 'Borrow request not found' }, { status: 404, headers: cors });
    }

    const borrowRequest = requestResult.data[0];
    if (borrowRequest.status !== type) {
        return jsonResponse({ error: 'Borrow request status does not match notification type' }, { status: 409, headers: cors });
    }

    const recipient = borrowRequest.borrower_email;
    if (!recipient) {
        await supabaseJson(env, '/rest/v1/notification_logs', {
            method: 'POST',
            body: JSON.stringify({
                request_id: requestId,
                recipient_email: null,
                type,
                status: 'failed',
                retry_count: force ? 1 : 0,
                error_message: 'Borrower email is missing',
            }),
        });
        return jsonResponse({ error: 'Borrower email is missing' }, { status: 422, headers: cors });
    }

    let webhookStatus = 'success';
    let errorMessage = null;
    if (!env.EMAIL_WEBHOOK_URL) {
        webhookStatus = 'failed';
        errorMessage = 'EMAIL_WEBHOOK_URL is not configured';
    } else {
        const webhookResponse = await fetch(env.EMAIL_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type,
                recipient_email: recipient,
                tracking_url: `https://simset-showroom.pages.dev/track.html?id=${encodeURIComponent(borrowRequest.tracking_id)}`,
                request: borrowRequest,
            }),
        });
        if (!webhookResponse.ok) {
            webhookStatus = 'failed';
            errorMessage = `Email webhook returned ${webhookResponse.status}`;
        }
    }

    const logResult = await supabaseJson(env, '/rest/v1/notification_logs', {
        method: 'POST',
        body: JSON.stringify({
            request_id: requestId,
            recipient_email: recipient,
            type,
            status: webhookStatus,
            retry_count: force ? 1 : 0,
            sent_at: webhookStatus === 'success' ? new Date().toISOString() : null,
            error_message: errorMessage,
        }),
    });

    return jsonResponse({
        status: webhookStatus,
        log: logResult.data?.[0] || null,
        error: errorMessage,
    }, { status: webhookStatus === 'success' ? 200 : 502, headers: cors });
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

        if (path === '/notifications/borrow-request') {
            if (request.method !== 'POST') {
                return new Response('Method Not Allowed', { status: 405, headers: cors });
            }
            return handleBorrowRequestNotification(request, env, cors);
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

        let proxyBody;
        if (request.method === 'POST') {
            proxyBody = await request.arrayBuffer();
            if (path === '/rest/v1/rpc/submit_public_borrow_request') {
                let payload;
                try {
                    payload = JSON.parse(new TextDecoder().decode(proxyBody));
                } catch {
                    return jsonResponse({ error: 'Invalid JSON body' }, { status: 400, headers: cors });
                }

                const turnstileResult = await verifyTurnstile(payload.p_turnstile_token, request, env);
                if (!turnstileResult.success) {
                    return jsonResponse({ error: 'Turnstile verification failed' }, { status: 403, headers: cors });
                }

                delete payload.p_turnstile_token;
                proxyBody = new TextEncoder().encode(JSON.stringify(payload));
                fetchHeaders.set('Content-Type', 'application/json');
            }
        }

        let upstream;
        try {
            upstream = await fetch(supabaseTarget, {
                method: request.method,
                headers: fetchHeaders,
                body: proxyBody,
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
