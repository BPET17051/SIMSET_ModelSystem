# Public Borrower Request Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace borrower Mahidol-email login with a simple public request form that matches the paper borrow form while keeping staff, approver, and admin login protected.

**Architecture:** Public borrowers submit through a narrow anon RPC that stores contact/form fields and creates a tracking ID. Staff-side workflows remain authenticated and unchanged: L1 approval, Staff dashboard, condition snapshots, KPI, audit, and LINE events still require `approver_l1`, `staff`, or `admin` roles.

**Tech Stack:** Static HTML/CSS/JS frontend, Supabase Postgres/RLS/RPC, Cloudflare Worker allowlist, Playwright smoke checks.

---

## Decision Summary

Borrower flow becomes:

1. User selects equipment from catalog/cart.
2. User fills paper-form fields online:
   - `borrower_name`
   - `borrower_position`
   - `department`
   - `phone`
   - `borrow_purpose_owner`
   - `work_purpose`
   - `usage_location`
   - `start_date`
   - `end_date`
   - selected item list
3. System returns `tracking_id`.
4. User tracks by `tracking_id`; no borrower account is required.
5. Staff/L1/Admin continue to login.

Non-goals for this change:

- No OTP.
- No borrower account creation.
- No borrower history by login.
- No digital signature in this step.
- No L2 digital role.

## File Map

- `supabase/current_mvp_release.sql`: add public submit RPC and borrower form fields.
- `cloudflare-worker/worker.js`: allow the new public submit RPC.
- `website/checkout.html`: remove borrower auth panel and add fields from the paper form.
- `website/js/checkout.js`: remove magic-link submit gating and call the public RPC.
- `website/js/history.js`: de-emphasize account history or keep it staff/internal only.
- `website/js/success.js` and `website/js/track.js`: continue to use `tracking_id`.
- `scripts/verify-current-mvp-contracts.js`: assert public borrower flow contract.
- `scripts/smoke-main-pages.js`: update mocks so checkout works without auth.
- `docs/CURRENT_MVP_SYSTEM.md`: update source-of-truth route description.

---

### Task 1: Contract First

**Files:**
- Modify: `scripts/verify-current-mvp-contracts.js`
- Modify: `scripts/smoke-main-pages.js`

- [ ] **Step 1: Add failing contract assertions**

Expected assertions:

```js
assertContains(workerJs, /\/rest\/v1\/rpc\/submit_public_borrow_request_v2/, 'cloudflare-worker/worker.js public borrower submit RPC');
assertContains(checkoutJs, /\.rpc\(['"]submit_public_borrow_request_v2['"]/, 'website/js/checkout.js');
assertNotContains(checkoutJs, /sendMagicLink|magic_email|getSession\(\)/, 'website/js/checkout.js borrower auth removal');
assertContains(currentMvpSql, /CREATE OR REPLACE FUNCTION public\.submit_public_borrow_request_v2/i, 'public borrower submit RPC');
assertContains(currentMvpSql, /borrower_position/i, 'borrower position field');
assertContains(currentMvpSql, /usage_location/i, 'usage location field');
```

- [ ] **Step 2: Run RED check**

Run:

```bash
npm run verify:current-mvp
```

Expected: fail on missing `submit_public_borrow_request_v2`.

- [ ] **Step 3: Update smoke mock**

Add mock RPC:

```js
if (name === 'submit_public_borrow_request_v2') return { data: 'SIM-REQ-002', error: null };
```

Expected: smoke will still fail until checkout JS calls the new RPC.

---

### Task 2: Database Contract

**Files:**
- Modify: `supabase/current_mvp_release.sql`

- [ ] **Step 1: Add borrower-form columns**

Add columns to `public.borrow_requests`:

```sql
ALTER TABLE public.borrow_requests
    ADD COLUMN IF NOT EXISTS borrower_position text,
    ADD COLUMN IF NOT EXISTS borrower_phone text,
    ADD COLUMN IF NOT EXISTS borrower_department text,
    ADD COLUMN IF NOT EXISTS borrow_purpose_owner text,
    ADD COLUMN IF NOT EXISTS work_purpose text,
    ADD COLUMN IF NOT EXISTS usage_location text;
```

- [ ] **Step 2: Add public submit RPC**

Create `public.submit_public_borrow_request_v2(...)` with this signature:

```sql
CREATE OR REPLACE FUNCTION public.submit_public_borrow_request_v2(
    p_borrower_name text,
    p_borrower_position text,
    p_department text,
    p_phone text,
    p_borrow_purpose_owner text,
    p_work_purpose text,
    p_usage_location text,
    p_start_date date,
    p_end_date date,
    p_items jsonb
)
RETURNS text
```

Minimum validation:

```sql
IF length(trim(COALESCE(p_borrower_name, ''))) = 0 THEN
    RAISE EXCEPTION 'Borrower name is required';
END IF;

IF length(trim(COALESCE(p_department, ''))) = 0 THEN
    RAISE EXCEPTION 'Department is required';
END IF;

IF length(regexp_replace(COALESCE(p_phone, ''), '[^0-9+]', '', 'g')) < 9 THEN
    RAISE EXCEPTION 'Phone number is required';
END IF;

IF p_start_date IS NULL OR p_end_date IS NULL OR p_end_date < p_start_date THEN
    RAISE EXCEPTION 'Invalid borrow date range';
END IF;
```

Behavior:

- Insert `borrow_requests.borrower_id = NULL`.
- Store all form fields in first-class columns.
- Insert `borrow_request_items`.
- Preserve allocation rules:
  - room dedicated enqueues `room_dedicated_review`.
  - advance course conflicts raise an exception.
- Enqueue `order_created`.
- Return `tracking_id`.

- [ ] **Step 3: Grants**

```sql
REVOKE ALL ON FUNCTION public.submit_public_borrow_request_v2(text, text, text, text, text, text, text, date, date, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_public_borrow_request_v2(text, text, text, text, text, text, text, date, date, jsonb) TO anon, authenticated;
```

- [ ] **Step 4: Keep authenticated RPC temporarily**

Keep `submit_borrow_request` for backward compatibility during rollout, but mark checkout as using `submit_public_borrow_request_v2`.

---

### Task 3: Checkout UI

**Files:**
- Modify: `website/checkout.html`
- Modify: `website/js/checkout.js`

- [ ] **Step 1: Remove borrower auth requirement from checkout**

Remove visible magic-link panel and do not call:

```js
app.auth.getSession()
app.auth.sendMagicLink()
```

from checkout submission.

- [ ] **Step 2: Match paper form fields**

Checkout form should include:

```html
<input id="borrower_name" required>
<input id="borrower_position">
<input id="department" required>
<input id="phone" required>
<input id="borrow_purpose_owner" required>
<input id="work_purpose" required>
<input id="usage_location" required>
<input id="start_date" type="date" required>
<input id="end_date" type="date" required>
```

- [ ] **Step 3: Call public RPC**

Submit payload:

```js
const { data: trackingId, error } = await app.supabase.rpc('submit_public_borrow_request_v2', {
  p_borrower_name: name,
  p_borrower_position: position,
  p_department: department,
  p_phone: phone,
  p_borrow_purpose_owner: borrowPurposeOwner,
  p_work_purpose: workPurpose,
  p_usage_location: usageLocation,
  p_start_date: startDate,
  p_end_date: endDate,
  p_items: items.map((item) => ({ equipment_id: item.equipment_id, qty: item.qty }))
});
```

- [ ] **Step 4: Keep rule checks**

Keep `get_equipment_borrow_rules` before submit so room-dedicated and advance-course rules still show before request creation.

---

### Task 4: Tracking And History

**Files:**
- Modify: `website/history.html`
- Modify: `website/js/history.js`
- Verify: `website/track.html`
- Verify: `website/js/track.js`

- [ ] **Step 1: Keep tracking ID as borrower lookup**

No change required for `track.html` if it already calls:

```js
supabase.rpc('get_borrow_request_status', { p_tracking_id: trackingId })
```

- [ ] **Step 2: Change history page messaging**

Borrower history by login is no longer the primary MVP path. Either:

```html
<a href="track.html">ตรวจสอบสถานะด้วย Borrow ID</a>
```

or keep history hidden from public navigation.

---

### Task 5: Worker And Docs

**Files:**
- Modify: `cloudflare-worker/worker.js`
- Modify: `docs/CURRENT_MVP_SYSTEM.md`
- Modify: `docs/RELEASE_SOURCE_SET.md`

- [ ] **Step 1: Allow new RPC**

Add:

```js
'/rest/v1/rpc/submit_public_borrow_request_v2'
```

to `ALLOWED_PATHS`.

- [ ] **Step 2: Update source-of-truth docs**

Change route description:

```md
| `/checkout.html?equipment_id=<equipment_id>&qty=1` | Public borrow request submission; no borrower login required |
```

Add active RPC:

```md
- `submit_public_borrow_request_v2` from checkout
```

Clarify:

```md
Borrowers do not need Supabase Auth accounts in MVP. Staff, approver_l1, and admin still require login and app_metadata roles.
```

---

### Task 6: Verification

**Files:**
- Modify: `scripts/verify-current-mvp-contracts.js`
- Modify: `scripts/smoke-main-pages.js`

- [ ] **Step 1: Run contract**

```bash
npm run verify:current-mvp
```

Expected:

```text
Current MVP contract checks passed
```

- [ ] **Step 2: Run browser smoke**

```bash
npm run smoke:main-pages
```

Expected:

```text
PASS: Checkout page
PASS: Tracking page
PASS: Staff dashboard page
PASS: L1 approval page
PASS: KPI report page
```

- [ ] **Step 3: Run deploy smoke**

```bash
npm run smoke:deploy-workflow
```

Expected:

```text
PASS: Deploy workflow smoke
```

---

## Reporting Note For Stakeholders

Use this wording:

> ปรับแนวทางให้ผู้ยืมไม่ต้องสมัครสมาชิกหรือ login โดยกรอกข้อมูลตามแบบฟอร์มใบยืมเดิม ได้แก่ ชื่อ ตำแหน่ง ภาควิชา/หน่วยงาน เบอร์โทร วัตถุประสงค์ สถานที่ใช้งาน และวันที่ยืม-คืน ระบบจะออก Borrow ID สำหรับติดตามสถานะ ส่วนเจ้าหน้าที่ หัวหน้าอนุมัติ และแอดมินยังต้อง login เพื่อควบคุมการอนุมัติ การจ่าย-รับคืนหุ่น รูปสภาพหุ่น และ audit log

## Self-Review

- Spec coverage: covers public borrower form, tracking ID, staff-only login, existing approval/staff/report workflows, and paper-form fields.
- Placeholder scan: no `TBD`, no `TODO`, no undefined later-only function names.
- Type consistency: `submit_public_borrow_request_v2` signature matches checkout payload and Worker allowlist name.
