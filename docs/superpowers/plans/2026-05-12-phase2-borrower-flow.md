# Phase 2 Borrower Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the authenticated borrower flow: Magic Link login for `@mahidol.ac.th`, multi-item cart checkout, authenticated request submission, receipt, history, and pending cancellation.

**Architecture:** Keep Phase 1 as the state-machine source of truth. Add a Phase 2 SQL migration for authenticated submit/history RPCs and frontend pages that call RPCs through the Cloudflare Worker. Store cart state in `localStorage` so Magic Link redirects can restore checkout in the same browser; show a clear empty-cart recovery path when users open the link on another device.

**Tech Stack:** Static HTML/CSS/JS, Supabase JS Auth, Supabase Postgres RPCs, Cloudflare Worker proxy, Playwright smoke tests, Node static verifiers.

---

## Constraints

- Only `@mahidol.ac.th` borrower emails are allowed.
- Enforce the domain twice:
  - Supabase Dashboard/Auth configuration where available for hosted Auth.
  - RPC hard gate using `lower(auth.jwt() ->> 'email') LIKE '%@mahidol.ac.th'`.
- Keep `submit_public_borrow_request(...)` for backward compatibility, but mark it deprecated in SQL comments and remove frontend usage.
- No frontend state-changing direct table writes.
- Checkout submit must call `submit_borrow_request(...)` and write `borrower_id = auth.uid()`.
- Borrower cancel must call `transition_borrow_request_status(..., 'pending', 'cancelled', auth.uid(), 'borrower', reason)`.
- Availability validation at submit time is the database source of truth for Phase 2.
- Custom SMTP must be configured before production borrower login is considered release-ready.

## File Structure

- Create `supabase/phase2_borrower_flow.sql`: authenticated submit RPC, borrower history RPC, public submit deprecation comment, grants.
- Modify `cloudflare-worker/worker.js`: allow new RPC endpoints.
- Create `scripts/verify-phase2-borrower-flow.js`: static contract verifier for SQL, Worker allowlist, frontend pages, and no stale public submit usage.
- Modify `package.json`: add `verify:phase2`.
- Create `website/js/auth.js`: Magic Link session helpers, Mahidol email validation, redirect handling, sign-out helpers.
- Modify `website/js/cart.js`: localStorage cart with multiple items, quantity updates, remove/clear, badge count.
- Modify `website/js/catalog.js`: add-to-cart behavior instead of item-only URL routing.
- Modify `website/js/checkout.js`: restore cart, require session, send Magic Link, submit authenticated RPC.
- Create `website/success.html` and `website/js/success.js`: receipt, tracking ID, QR, print action.
- Create `website/history.html` and `website/js/history.js`: list own requests and cancel pending requests with reason.
- Modify `website/cart.html`, `website/checkout.html`, `website/product-details.html`, `website/index.html`: include auth/cart controls and new navigation.
- Modify `scripts/smoke-main-pages.js`: include success/history pages and mock Phase 2 RPCs.
- Create or update docs checklist after implementation: SMTP, redirect URLs, preview/prod verify.

---

### Task 1: Phase 2 SQL Contract Verifier

**Files:**
- Create: `scripts/verify-phase2-borrower-flow.js`
- Modify: `package.json`

- [ ] **Step 1: Write the failing verifier**

Create a Node verifier that fails until Phase 2 source exists:

```js
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertExists(relativePath) {
  assert(fs.existsSync(path.join(ROOT, relativePath)), `Expected file to exist: ${relativePath}`);
}

function assertContains(text, pattern, label) {
  assert(pattern.test(text), `${label} is missing ${pattern}`);
}

function assertNotContains(text, pattern, label) {
  assert(!pattern.test(text), `${label} still contains ${pattern}`);
}

assertExists('supabase/phase2_borrower_flow.sql');
assertExists('website/success.html');
assertExists('website/history.html');
assertExists('website/js/auth.js');
assertExists('website/js/success.js');
assertExists('website/js/history.js');

const sql = read('supabase/phase2_borrower_flow.sql');
const worker = read('cloudflare-worker/worker.js');
const checkout = read('website/js/checkout.js');
const cart = read('website/js/cart.js');
const history = read('website/js/history.js');

assertContains(sql, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.submit_borrow_request\s*\(/i, 'phase2 SQL');
assertContains(sql, /auth\.uid\(\)\s+IS\s+NULL/i, 'phase2 SQL');
assertContains(sql, /borrower_id\s*=\s*auth\.uid\(\)|auth\.uid\(\)\s*,/i, 'phase2 SQL');
assertContains(sql, /auth\.jwt\(\)\s*->>\s*'email'/i, 'phase2 SQL');
assertContains(sql, /@mahidol\.ac\.th/i, 'phase2 SQL');
assertContains(sql, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.get_my_borrow_requests\s*\(/i, 'phase2 SQL');
assertContains(sql, /submit_public_borrow_request[\s\S]{0,120}deprecated/i, 'phase2 SQL');

assertContains(worker, /\/rest\/v1\/rpc\/submit_borrow_request/, 'worker allowlist');
assertContains(worker, /\/rest\/v1\/rpc\/get_my_borrow_requests/, 'worker allowlist');

assertContains(checkout, /\.auth\.signInWithOtp/, 'checkout auth flow');
assertContains(checkout, /\.rpc\(['"]submit_borrow_request['"]/, 'checkout submit');
assertNotContains(checkout, /submit_public_borrow_request/, 'checkout submit');
assertContains(cart, /localStorage/, 'cart persistence');
assertContains(history, /\.rpc\(['"]get_my_borrow_requests['"]/, 'history load');
assertContains(history, /\.rpc\(['"]transition_borrow_request_status['"]/, 'history cancel');

console.log('Phase 2 borrower flow contract checks passed');
```

- [ ] **Step 2: Run verifier to confirm RED**

Run:

```powershell
node scripts\verify-phase2-borrower-flow.js
```

Expected: FAIL because `supabase/phase2_borrower_flow.sql` does not exist yet.

- [ ] **Step 3: Add npm script**

Add to `package.json`:

```json
"verify:phase2": "node scripts/verify-phase2-borrower-flow.js"
```

- [ ] **Step 4: Run syntax check**

Run:

```powershell
node --check scripts\verify-phase2-borrower-flow.js
```

Expected: PASS.

---

### Task 2: Authenticated Borrower SQL RPCs

**Files:**
- Create: `supabase/phase2_borrower_flow.sql`

- [ ] **Step 1: Add authenticated submit RPC**

Create `public.submit_borrow_request(...)` with this contract:

```sql
CREATE OR REPLACE FUNCTION public.submit_borrow_request(
    p_borrower_name text,
    p_borrower_email text,
    p_purpose text,
    p_start_date date,
    p_end_date date,
    p_items jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    new_request_id uuid;
    new_tracking_id text;
    item jsonb;
    eq_id uuid;
    req_qty integer;
    locked_eq record;
    used_qty integer;
    available_qty integer;
    v_email text := lower(COALESCE(auth.jwt() ->> 'email', ''));
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF v_email NOT LIKE '%@mahidol.ac.th' THEN
        RAISE EXCEPTION 'Only Mahidol organization email is allowed';
    END IF;

    IF lower(trim(COALESCE(p_borrower_email, ''))) IS DISTINCT FROM v_email THEN
        RAISE EXCEPTION 'Borrower email must match authenticated email';
    END IF;

    IF p_borrower_name IS NULL OR length(trim(p_borrower_name)) = 0 THEN
        RAISE EXCEPTION 'Borrower name is required';
    END IF;

    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'At least one borrow item is required';
    END IF;

    IF p_start_date IS NULL OR p_end_date IS NULL OR p_end_date < p_start_date THEN
        RAISE EXCEPTION 'Invalid borrow date range';
    END IF;

    new_tracking_id := public.generate_secure_tracking_id();

    INSERT INTO public.borrow_requests (
        tracking_id,
        borrower_id,
        borrower_name,
        borrower_email,
        purpose,
        status,
        expires_at
    ) VALUES (
        new_tracking_id,
        auth.uid(),
        trim(p_borrower_name),
        v_email,
        NULLIF(trim(COALESCE(p_purpose, '')), ''),
        'pending',
        timezone('utc', now()) + interval '24 hours'
    )
    RETURNING id INTO new_request_id;

    FOR item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        eq_id := (item->>'equipment_id')::uuid;
        req_qty := COALESCE((item->>'qty')::integer, 0);

        IF eq_id IS NULL OR req_qty <= 0 THEN
            RAISE EXCEPTION 'Invalid borrow item';
        END IF;

        SELECT *
        INTO locked_eq
        FROM public.equipments
        WHERE id = eq_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Equipment not found';
        END IF;

        SELECT COALESCE(SUM(bri.qty_borrowed), 0)
        INTO used_qty
        FROM public.borrow_request_items bri
        JOIN public.borrow_requests br ON br.id = bri.request_id
        WHERE bri.equipment_id = eq_id
          AND bri.start_date <= p_end_date
          AND bri.end_date >= p_start_date
          AND br.status IN ('pending', 'approved', 'ready', 'borrowed');

        available_qty := (locked_eq.total_quantity - locked_eq.maintenance_quantity) - used_qty;

        IF available_qty < req_qty THEN
            RAISE EXCEPTION 'Equipment does not have enough stock';
        END IF;

        INSERT INTO public.borrow_request_items (
            request_id,
            equipment_id,
            start_date,
            end_date,
            qty_borrowed
        ) VALUES (
            new_request_id,
            eq_id,
            p_start_date,
            p_end_date,
            req_qty
        );
    END LOOP;

    RETURN new_tracking_id;
END;
$$;
```

- [ ] **Step 2: Add borrower history RPC**

Add a read-only RPC:

```sql
CREATE OR REPLACE FUNCTION public.get_my_borrow_requests()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    result jsonb;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', br.id,
            'tracking_id', br.tracking_id,
            'status', br.status,
            'created_at', br.created_at,
            'purpose', br.purpose,
            'can_cancel', br.status = 'pending',
            'items', (
                SELECT COALESCE(jsonb_agg(jsonb_build_object(
                    'equipment_name', e.name_th,
                    'start_date', bri.start_date,
                    'end_date', bri.end_date,
                    'qty_borrowed', bri.qty_borrowed
                )), '[]'::jsonb)
                FROM public.borrow_request_items bri
                JOIN public.equipments e ON e.id = bri.equipment_id
                WHERE bri.request_id = br.id
            )
        )
        ORDER BY br.created_at DESC
    ), '[]'::jsonb)
    INTO result
    FROM public.borrow_requests br
    WHERE br.borrower_id = auth.uid();

    RETURN result;
END;
$$;
```

- [ ] **Step 3: Add grants and deprecation comment**

Add:

```sql
REVOKE ALL ON FUNCTION public.submit_borrow_request(text, text, text, date, date, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_borrow_request(text, text, text, date, date, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_borrow_request(text, text, text, date, date, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.get_my_borrow_requests() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_borrow_requests() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_borrow_requests() TO authenticated;

COMMENT ON FUNCTION public.submit_public_borrow_request(text, text, text, date, date, jsonb)
IS 'DEPRECATED after Phase 2: frontend must use authenticated submit_borrow_request so borrower_id = auth.uid().';
```

- [ ] **Step 4: Run verifier**

Run:

```powershell
npm run verify:phase2
```

Expected: still FAIL until Worker/frontend tasks are complete.

---

### Task 3: Worker Allowlist

**Files:**
- Modify: `cloudflare-worker/worker.js`

- [ ] **Step 1: Add RPC paths**

Add these paths to `ALLOWED_PATHS`:

```js
'/rest/v1/rpc/submit_borrow_request',
'/rest/v1/rpc/get_my_borrow_requests',
```

- [ ] **Step 2: Run syntax check**

Run:

```powershell
node --check cloudflare-worker\worker.js
```

Expected: PASS.

---

### Task 4: Auth Helper

**Files:**
- Create: `website/js/auth.js`

- [ ] **Step 1: Add Magic Link/session helpers**

Create helpers:

```js
(function () {
  const app = window.SimsetBorrow = window.SimsetBorrow || {};
  const ALLOWED_DOMAIN = '@mahidol.ac.th';

  function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
  }

  function isAllowedBorrowerEmail(email) {
    return normalizeEmail(email).endsWith(ALLOWED_DOMAIN);
  }

  async function getSession() {
    const { data, error } = await app.supabase.auth.getSession();
    if (error) throw error;
    return data.session || null;
  }

  async function getUserEmail() {
    const session = await getSession();
    return session?.user?.email || '';
  }

  async function sendMagicLink(email, redirectTo) {
    const normalized = normalizeEmail(email);
    if (!isAllowedBorrowerEmail(normalized)) {
      throw new Error('Only Mahidol organization email is allowed');
    }
    const { error } = await app.supabase.auth.signInWithOtp({
      email: normalized,
      options: { emailRedirectTo: redirectTo }
    });
    if (error) throw error;
  }

  app.auth = {
    normalizeEmail,
    isAllowedBorrowerEmail,
    getSession,
    getUserEmail,
    sendMagicLink
  };
}());
```

- [ ] **Step 2: Include auth helper before checkout/history scripts**

Add:

```html
<script src="js/auth.js"></script>
```

before `checkout.js` and `history.js`.

---

### Task 5: Multi-Item Cart

**Files:**
- Modify: `website/js/cart.js`
- Modify: `website/js/catalog.js`
- Modify: `website/cart.html`
- Modify: `website/product-details.html`

- [ ] **Step 1: Replace URL-only cart with localStorage cart**

Use key:

```js
const CART_KEY = 'simset.borrow.cart.v2';
```

Cart shape:

```js
{
  "items": [
    { "equipment_id": "uuid", "qty": 1 }
  ]
}
```

- [ ] **Step 2: Add cart API on `window.SimsetBorrow.cart`**

Implement:

```js
app.cart = {
  getItems,
  addItem,
  updateQty,
  removeItem,
  clear,
  count
};
```

- [ ] **Step 3: Change catalog/details buttons to buttons**

Use:

```html
<button class="btn btn-dark" type="button" data-add-to-cart="EQUIPMENT_ID">เพิ่มรายการยืม</button>
```

Global click handler:

```js
document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-add-to-cart]');
  if (!button) return;
  app.cart.addItem(button.getAttribute('data-add-to-cart'), 1);
  app.updateCartBadge();
});
```

- [ ] **Step 4: Render cart table from localStorage**

Fetch all equipment by ids:

```js
.from('equipments')
.select('id,name_th,total_quantity,maintenance_quantity')
.in('id', itemIds)
```

Render quantity input, remove button, and checkout button.

---

### Task 6: Authenticated Checkout

**Files:**
- Modify: `website/checkout.html`
- Modify: `website/js/checkout.js`

- [ ] **Step 1: Restore cart and date form**

Checkout reads cart items from `app.cart.getItems()`. If empty, show empty state and link back to catalog.

- [ ] **Step 2: Add Magic Link section**

If no session:

```js
await app.auth.sendMagicLink(email, `${location.origin}/checkout.html`);
```

Show message: check email and reopen link in same browser to preserve local cart.

- [ ] **Step 3: Submit authenticated RPC**

After session exists, submit:

```js
const { data: trackingId, error } = await app.supabase.rpc('submit_borrow_request', {
  p_borrower_name: name,
  p_borrower_email: session.user.email,
  p_purpose: purposeWithDepartmentAndPhone,
  p_start_date: startDate,
  p_end_date: endDate,
  p_items: app.cart.getItems().map((item) => ({
    equipment_id: item.equipment_id,
    qty: item.qty
  }))
});
```

On success:

```js
app.cart.clear();
location.href = `success.html?id=${encodeURIComponent(trackingId)}`;
```

---

### Task 7: Success Receipt With QR/Print

**Files:**
- Create: `website/success.html`
- Create: `website/js/success.js`

- [ ] **Step 1: Render receipt by tracking id**

Load status:

```js
const { data, error } = await app.supabase.rpc('get_borrow_request_status', { p_tracking_id: trackingId });
```

- [ ] **Step 2: Add QR confirmation**

Use a QR image service URL or a small local QR library only if already available. For Phase 2, acceptable first cut:

```js
const trackUrl = `${location.origin}/track.html?id=${encodeURIComponent(trackingId)}`;
qr.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(trackUrl)}`;
```

If external QR service is not acceptable for hospital deployment, defer to Phase 5 and render tracking URL as text only.

- [ ] **Step 3: Add print action**

Use:

```js
document.getElementById('print-receipt')?.addEventListener('click', () => window.print());
```

---

### Task 8: Borrower History and Cancel

**Files:**
- Create: `website/history.html`
- Create: `website/js/history.js`

- [ ] **Step 1: Require session**

If no session, show Magic Link form and send redirect to `history.html`.

- [ ] **Step 2: Load own history**

Call:

```js
const { data, error } = await app.supabase.rpc('get_my_borrow_requests');
```

- [ ] **Step 3: Cancel pending request**

Prompt for reason, then call:

```js
const { data, error } = await app.supabase.rpc('transition_borrow_request_status', {
  p_request_id: requestId,
  p_current_status: 'pending',
  p_next_status: 'cancelled',
  p_actor_user_id: session.user.id,
  p_actor_type: 'borrower',
  p_reason: reason
});
```

Reload history after success.

---

### Task 9: Smoke Tests

**Files:**
- Modify: `scripts/smoke-main-pages.js`
- Modify: `scripts/verify-current-mvp-contracts.js` if MVP route list needs Phase 2 pages.

- [ ] **Step 1: Add routes**

Add:

```js
{ path: '/success.html?id=SIM-TEST-001', title: /SIMSET Borrow/ },
{ path: '/history.html', title: /SIMSET Borrow/ }
```

- [ ] **Step 2: Mock Auth APIs**

In the browser mock, implement:

```js
auth: {
  getSession: async () => ({ data: { session: mockSession }, error: null }),
  signInWithOtp: async () => ({ data: {}, error: null })
}
```

- [ ] **Step 3: Mock Phase 2 RPCs**

Add mock handlers for:

```js
submit_borrow_request
get_my_borrow_requests
transition_borrow_request_status
```

---

### Task 10: Verification and Release Notes

**Files:**
- Modify: `docs/GITHUB_RELEASE_CHECKLIST.md`
- Modify: `docs/CURRENT_MVP_SYSTEM.md`

- [ ] **Step 1: Document Supabase Auth setup**

Add checklist entries:

```md
- Configure Magic Link redirect URLs:
  - https://simset-showroom.pages.dev/checkout.html
  - https://simset-showroom.pages.dev/history.html
  - preview deployment equivalents
- Configure Custom SMTP before production borrower login.
- Restrict borrower emails to @mahidol.ac.th at Auth configuration if available and always in RPC.
```

- [ ] **Step 2: Run full local verification**

Run:

```powershell
npm run verify:current-mvp
npm run verify:phase1
npm run verify:phase2
npm run test:smoke
```

Expected: all pass.

- [ ] **Step 3: Production/staging SQL verification**

After applying `supabase/phase2_borrower_flow.sql` to preview first, run:

```sql
SELECT proname, prosecdef, proacl
FROM pg_proc
WHERE proname IN ('submit_borrow_request', 'get_my_borrow_requests')
ORDER BY proname;
```

```sql
SELECT public.submit_borrow_request(
  'Phase 2 Smoke User',
  '<signed-in-mahidol-email>',
  'Phase 2 preview smoke test',
  current_date + 7,
  current_date + 8,
  jsonb_build_array(jsonb_build_object('equipment_id', '<equipment_id>', 'qty', 1))
);
```

Expected: succeeds only when run with an authenticated Mahidol user session, not as anonymous.

