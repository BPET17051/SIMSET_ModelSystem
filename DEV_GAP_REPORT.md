# รายงานช่องว่างและจุดแก้ไขระบบ SIMSET Borrow
**อัปเดตล่าสุด:** 2026-05-18 (รอบที่ 6 — หลังนักพัฒนาแก้ไขรอบห้าเสร็จ)
**อ้างอิง:** `docs/PLAN-equipment-borrowing.md`, `docs/PLAN-security-fixes.md`, `docs/CURRENT_MVP_SYSTEM.md`
**วิธีวิเคราะห์:** เปรียบเทียบ Plan Phase 1 MVP กับโค้ดที่ implement จริง ไม่ใช้มาตรฐานภายนอก

---

## คะแนนเปรียบเทียบ 6 รอบ

| ด้าน | รอบ 1 | รอบ 2 | รอบ 3 | รอบ 4 | รอบ 5 | รอบ 6 | เหตุผลรอบ 6 |
|------|--------|--------|--------|--------|--------|--------|-------------|
| Infrastructure / Hosting | 9 | 9 | 9 | 9 | 9 | 9 | = |
| Database Design | 7 | 7.5 | 8 | 8.5 | 6.5 | 9 | ▲▲▲ `generate_secure_tracking_id` ครบ + `admin_cancel_request` ครบ |
| Admin Workflow | 3 | 8 | 8.5 | 9 | 8.5 | 9 | ▲ Cancel path ครบทุก non-terminal status |
| Borrower Flow | 6 | 7 | 6.5 | 8.5 | 6 | 8.5 | ▲▲▲ Submit ไม่พังอีกแล้ว + catalog wording ชัดเจน |
| Security | 5 | 7.5 | 8 | 8.5 | 8.5 | 8.5 | = |
| Business Rules | 4 | 7 | 7 | 9 | 9 | 9 | = |
| Email Notification | 1 | 6 | 6 | 6 | 6 | 6 | = operational เท่านั้น |
| Analytics / KPI | 1 | 6 | 7.5 | 8.5 | 8.5 | 8.5 | = |

### คะแนนรวม: 8.5 / 10
*ขยับขึ้นจาก 7.0 → 8.5 — GAP-12 ถึง GAP-14 ปิดครบทุกรายการ, code feature-complete ตาม Phase 1 Plan*

---

## รายการที่ปิดแล้วทุกรอบ (ไม่ต้องทำซ้ำ)

<details>
<summary>ดูรายการ 31 รายการที่ปิดแล้ว</summary>

| รายการ | ไฟล์หลัก |
|--------|----------|
| ✅ Admin Tab `รออนุมัติ` (pending) | `website/js/admin.js:4`, `website/admin.html:63` |
| ✅ Approve/Reject RPC + Modal Dropdown + free text | `website/js/admin.js:243–304`, `website/admin.html:76–100` |
| ✅ KPI Widgets 5 ตัวบนหน้า Admin | `website/js/admin.js:142–163`, `website/admin.html:30–61` |
| ✅ ปุ่ม Resend Email | `website/js/admin.js:357–365` |
| ✅ Email Webhook Infrastructure + idempotent logs | `cloudflare-worker/worker.js:157–251` |
| ✅ `notification_logs` table + RLS + Unique Index | `supabase/current_mvp_release.sql:15–36` |
| ✅ Pending Expiration Cron (pg_cron every 15 min) | `supabase/current_mvp_release.sql:580+` |
| ✅ Cancel Date Cutoff (ห้ามยกเลิกถ้าเหลือ < 1 วัน) | `supabase/current_mvp_release.sql:338` |
| ✅ Late Approval Rule (ห้าม Approve ถ้า start_date เลยแล้ว) | `supabase/current_mvp_release.sql:394` |
| ✅ Checkout รองรับหลายรายการจาก cart | `website/js/checkout.js:30–59`, `website/js/cart.js:41–45` |
| ✅ Turnstile widget + token + server-side verify | `website/checkout.html:58–69`, `cloudflare-worker/worker.js:354–363` |
| ✅ Error message ไม่โชว์ internal DB error | `website/js/admin.js:50–63`, `checkout.js:17–25`, `track.js:16–22` |
| ✅ `get_borrow_request_status` ไม่คืน PII (purpose) | `supabase/current_mvp_release.sql:48–77` |
| ✅ `borrower_email` required (HTML + JS + SQL) | `checkout.html:39`, `checkout.js:88–96`, `current_mvp_release.sql:111–117` |
| ✅ Anti-Hoarding by email (≤2 requests, ≤5 items) | `supabase/current_mvp_release.sql:127–144` |
| ✅ `get_admin_kpis` RPC — คำนวณทั้งหมดใน DB | `supabase/current_mvp_release.sql:223–302` |
| ✅ `pendingAll` นับ pending ทั้งหมด ไม่มี date filter | `supabase/current_mvp_release.sql:248–251`, `website/admin.html:33–34`, `website/js/admin.js:158` |
| ✅ `loadKpis()` เรียก single RPC แทน full table scan | `website/js/admin.js:147` |
| ✅ `get_admin_kpis` อยู่ใน Worker ALLOWED_PATHS | `cloudflare-worker/worker.js:38` |
| ✅ Smoke mock ครอบทุก RPC จริง | `scripts/smoke-main-pages.js:110–141` |
| ✅ Smoke test ตรวจ `[data-admin-tab="pending"]` + `[data-kpi="avgLeadTime"]` | `scripts/smoke-main-pages.js:185–189` |
| ✅ Cart single-item backward compat | `website/js/cart.js:41–45` |
| ✅ Contract guards ครอบทุก GAP ทุกรอบ | `scripts/verify-current-mvp-contracts.js` |
| ✅ **[GAP-07]** `cancel_borrow_request_public` + Worker + Cancel button tracking page | `supabase/current_mvp_release.sql:305–363`, `worker.js:42`, `track.js:32–88` |
| ✅ **[GAP-08]** Smoke mock ครอบ `admin_approve_request` + `admin_reject_request` | `scripts/smoke-main-pages.js:137–138` |
| ✅ **[GAP-09]** ตัด `pending→approved` ออกจาก `admin_update_borrow_request_status` | `supabase/current_mvp_release.sql:549–554` |
| ✅ **[GAP-10]** `pendingAll` นับครบ ไม่กรอง created_at | `supabase/current_mvp_release.sql:248–251` |
| ✅ **[GAP-11]** Soft phone validation | `website/js/checkout.js:98–101` |
| ✅ **[GAP-12]** `generate_secure_tracking_id()` นิยามครบ + pgcrypto + contract guard | `supabase/current_mvp_release.sql:38–49` |
| ✅ **[GAP-13]** `admin_cancel_request` RPC + Worker allowlist + Cancel button admin | `supabase/current_mvp_release.sql:483–525`, `worker.js:46`, `admin.js:26–36`, `admin.js:306–327` |
| ✅ **[GAP-14]** Catalog wording: `"มีในระบบ N"` + `"ตรวจช่วงวันที่ตอนส่งคำขอ"` | `website/js/catalog.js:80–81` |

</details>

---

## สถานะปัจจุบัน: Code Feature-Complete ตาม Phase 1 Plan

ทุก feature ใน Phase 1 MVP Plan ถูก implement ครบแล้ว ที่เหลือเป็น **Operational** ล้วนๆ ก่อนเปิด production จริง

---

## สิ่งที่ยังต้องทำก่อน Go-Live

### 🔴 Operational — บังคับทำก่อน Production

#### [OPS-01] Turnstile Site Key ยังเป็น test key
**ไฟล์:** `website/checkout.html:58`
```html
<div class="cf-turnstile" data-sitekey="1x00000000000000000000AA">
```
Test key ผ่าน verify เสมอ — ไม่มี bot protection จริง

- [ ] Cloudflare Dashboard → Turnstile → เพิ่ม site → copy Site Key จริง
- [ ] เปลี่ยน `data-sitekey` ใน `website/checkout.html:58`

#### [OPS-02] Worker Secrets ยังไม่ได้ตั้งค่า
- [ ] `wrangler secret put SUPABASE_SERVICE_ROLE_KEY`
- [ ] `wrangler secret put TURNSTILE_SECRET_KEY` (คู่กับ site key ที่เปลี่ยน)
- [ ] `wrangler secret put EMAIL_WEBHOOK_URL` — เลือก provider: Resend / Brevo / n8n / Make / Zapier

#### [OPS-03] SQL Release ยังไม่ได้ Apply บน Supabase
- [ ] Apply `supabase/current_mvp_release.sql` ใน Supabase **preview** branch ก่อน
- [ ] Run `npm run verify:live-worker` ตรวจ Worker endpoint จริง
- [ ] Apply บน **production** Supabase project
- [ ] ตรวจสอบ `pg_cron` extension เปิดในโปรเจกต์ (ใช้สำหรับ expire-pending cron job)

---

### 🟡 ข้อสังเกต Low Priority — ยอมรับได้สำหรับ Phase 1

#### [NOTE-01] Admin Cancel ใช้ `window.prompt()` แทน Modal

`admin.js:307` — `cancelAdminRequest()` ใช้ `window.prompt('ระบุเหตุผลการยกเลิก', ...)` ซึ่งต่างจาก reject flow ที่ใช้ Bootstrap Modal พร้อม dropdown เหตุผล

ไม่มีผลต่อ correctness แต่ UX ไม่สม่ำเสมอ สำหรับ Phase 2 ควรเปลี่ยนเป็น modal + dropdown

#### [NOTE-02] `cancel_borrow_request` (ตัวเดิม) ยังอยู่ใน `rpc_functions.sql`

Dead code สำหรับ public borrower MVP แต่ไม่เป็นภัย — อาจใช้ใน Phase 2 สำหรับ authenticated borrower

#### [NOTE-03] Catalog ยังไม่มี Real-time Date-Range Availability

Catalog แสดง `baselineStock = total - maintenance` (ไม่หัก pending/approved/borrowed ตาม date range) ผู้ใช้เห็น "มีในระบบ N" แต่ submit จริงอาจถูก reject จาก SQL overlap check — UX gap ไม่ใช่ security gap (SQL ป้องกัน double-booking แล้ว) — defer เป็น Phase 2

---

## Checklist ทดสอบ End-to-End หลัง Apply SQL จริง

- [ ] Submit คำขอผ่าน UI → ได้รับ tracking_id รูปแบบ `SIM-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX` (SIM- + 32 hex chars)
- [ ] ใส่ tracking_id บน track.html → เห็นสถานะและรายการอุปกรณ์ถูกต้อง
- [ ] Submit 3 คำขอด้วยอีเมลเดียวกัน → คำขอที่ 3 ต้อง reject "Too many pending requests"
- [ ] Submit overlap วันที่กับคำขอ pending อยู่แล้ว → ต้อง reject "Equipment does not have enough stock"
- [ ] Cancel public (pending) → status เปลี่ยนเป็น cancelled
- [ ] Cancel public เมื่อ start_date = พรุ่งนี้ → ต้อง block
- [ ] Admin Approve → อีเมลถึง inbox (ถ้าตั้งค่า EMAIL_WEBHOOK_URL)
- [ ] Admin Cancel (approved/ready/borrowed) → status เปลี่ยนเป็น cancelled ทันที
- [ ] Admin Approve คำขอที่ start_date เลยแล้ว → ต้อง block "วันยืมเลยแล้ว"
- [ ] KPI "รออนุมัติทั้งหมด" นับครบทุก pending ไม่จำกัดวัน

---

## Feature ที่ Plan defer เป็น Phase 2 — ไม่ต้องทำใน Sprint นี้

- ระบบตรวจสอบสภาพรายชิ้น (Partial Return / Damage Tracking)
- Server-side PDF Generation + QR Code + `document_artifacts`
- Date Picker Calendar View + Real-time Availability Matrix บนหน้า Catalog
- Cart แบบ Advanced (หลายช่วงวัน หลายชิ้น)
- Admin Cancel Modal พร้อม dropdown เหตุผล (แทน `window.prompt`)
- Dashboard Reports เชิงลึก (Export Excel, รายภาควิชา)
- OIDC Login (Google/Microsoft) + Domain Restriction

---

*รายงานนี้สร้างจากการวิเคราะห์โค้ดเปรียบเทียบกับ Plan เอกสารของระบบ*
*ไม่มีการแก้ไข source code ใดๆ ในขั้นตอนการวิเคราะห์*
