# borrower-staff-redesign.md

**Project:** SIMSET Model System — Borrower & Staff Operations Redesign  
**Type:** WEB (Vanilla JS + Supabase, Cloudflare Pages)  
**Agent:** frontend-specialist + backend-specialist  
**Plan Date:** 2026-03-20  
**Status:** PLANNING — Ready for Phase 1 Implementation

---

## Overview

ระบบปัจจุบันนำเสนอตัวเองเป็น 3 ผลิตภัณฑ์แยกจากกัน (Showroom, Borrow, Tracking) ซึ่งสร้างความสับสนให้กับผู้ยืม แผนนี้ทำให้กลายเป็นหนึ่ง service ในสามโหมด: **ยืมอุปกรณ์ / ติดตามคำขอ / สำหรับเจ้าหน้าที่**

**ข้อมูลนำเข้าที่ใช้ในการวางแผนนี้:**
- `docs/IA_USER_FLOW_BLUEPRINT.md` — IA และ User Flow blueprint ที่ได้รับการอนุมัติ
- `docs/PLAN-borrower-staff-redesign.md` — Workstream breakdown (A/B/C, P0/P1/P2)
- `docs/LOW_FIDELITY_WIREFRAME_SPEC.md` — Screen specs (P1–P5 public, S1–S6 staff)
- `docs/EXECUTION_ROADMAP_BORROWER_STAFF.md` — Milestone map (M0–M4)
- `feasibility_audit.md` — การประเมินความเป็นไปได้ต่อ codebase จริง

---

## Success Criteria

- [ ] ผู้ใช้ใหม่เข้าหน้าแรก → เห็น CTA "ยืมอุปกรณ์" และ "ติดตามคำขอ" ภายใน 5 วินาที
- [ ] ไม่มีหน้า passive showroom เป็น entry point หลักอีกต่อไป
- [ ] หลังส่ง request → มี success page แสดง tracking ID + next steps อย่างชัดเจน
- [ ] tracking.html แสดง cancellation option เมื่อยังอยู่ในสถานะ pending
- [ ] Staff เห็น pending approvals + upcoming returns บน dashboard ทันทีเมื่อ login
- [ ] Status language ตรงกันระหว่างฝั่ง borrower และ staff ทุกจุด

---

## Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| Frontend | Vanilla JS + HTML/CSS | คงเดิม, selector-safe |
| Backend/DB | Supabase (PostgreSQL + RLS + RPC) | มีอยู่แล้ว, เพิ่ม RPC ใหม่บางตัว |
| Hosting | Cloudflare Pages | มีอยู่แล้ว |
| Print | CSS `@media print` | Browser-print-first, ไม่ต้องการ PDF service ใน Phase 1 |
| Cancellation | Client rule + Supabase RLS | cutoff = pending status เท่านั้น (ไม่มี date cutoff ใน MVP) |

---

## File Structure — Current vs Target

| Current File | Target Role | Action |
|---|---|---|
| `website/index.html` | Screen P1: Public Service Entry | **MODIFY** — เพิ่ม hero CTA block + process strip |
| `website/borrow.html` | Screen P2: Catalog & Selection + P3: Review | **KEEP** — เพิ่ม progress bar, ปรับ cart drawer เป็น full review step |
| `website/borrow.js` | Borrow flow logic | **MODIFY** — หลัง submit → redirect ไป `success.html` แทน tracking |
| `website/success.html` | Screen P4: Submission Success | **NEW** — สร้างใหม่ |
| `website/success.js` | Success page logic | **NEW** — อ่าน tracking_id จาก URL, แสดงข้อมูล, print support |
| `website/tracking.html` | Screen P5: Tracking | **MODIFY** — เพิ่ม cancellation button, status vocabulary, print block |
| `website/track.js` | Tracking logic | **MODIFY** — เพิ่ม cancel RPC call, lifecycle labels |
| `website/admin/dashboard.html` | Screen S2: Operations Dashboard | **MODIFY** — integrate borrow stats เข้า main dashboard |
| `website/admin/admin.js` | Admin shell + tab navigation | **MODIFY** — ย้าย borrow stats integration, tab re-label |
| `website/admin/borrow-admin.js` | Screen S3: Request Queue | **MODIFY** — เพิ่ม risk flags (near-due highlight) |
| `website/admin/borrow-admin.js` | Screen S4: Return/Inspection | **MODIFY** — ขยาย receiveReturn() รองรับ per-item condition |
| `supabase/rpc_functions.sql` | Backend RPCs | **MODIFY** — เพิ่ม `cancel_borrow_request`, `admin_receive_return_detailed` |

---

## Decisions Locked (from Execution Roadmap + Feasibility Audit)

| # | Decision | Value |
|---|---|---|
| 1 | success page delivery | `success.html` (หน้าแยก ตาม wireframe spec P4) |
| 2 | cancellation cutoff policy | `pending` status เท่านั้น — ไม่มี date cutoff ใน Phase 1 |
| 3 | printable reference | CSS `@media print` — ไม่ต้องการ PDF service |
| 4 | staff tab re-grouping | Phase 1 = integrate stats เข้า dashboard เท่านั้น, ยังไม่ rename tabs |
| 5 | return inspection MVP | Phase 1 = bulk OK, Phase 2 = per-item condition + damaged routing |

---

## Task Breakdown

### PHASE 0: Foundation (Backend + Shared Vocabulary)

> ทำก่อนทุกอย่าง เพราะ frontend ต้องการ RPC และ copy map

---

#### TASK-B01 — สร้าง `cancel_borrow_request` RPC
- **Agent:** backend-specialist
- **Priority:** P0
- **Dependencies:** ไม่มี
- **File:** `supabase/rpc_functions.sql`
- **INPUT:** ไม่มี RPC cancel ในระบบ
- **OUTPUT:** Function `cancel_borrow_request(p_tracking_id TEXT)` ที่อนุญาตให้ update status = 'cancelled' เฉพาะเมื่อ status = 'pending' และ auth.uid() ตรงกับ requester (ถ้ามี auth) หรือ open (ถ้าไม่มี auth)
- **VERIFY:** รัน SQL: `SELECT cancel_borrow_request('TEST-ID')` → ต้องได้ error ถ้า status ไม่ใช่ pending

---

#### TASK-B02 — สร้าง `admin_receive_return_detailed` RPC (Phase 2 prep)
- **Agent:** backend-specialist
- **Priority:** P1
- **Dependencies:** TASK-B01
- **File:** `supabase/rpc_functions.sql`
- **INPUT:** `receiveReturn()` ใน borrow-admin.js เป็น bulk OK เท่านั้น
- **OUTPUT:** RPC ที่รับ array of `{item_id, qty_ok, qty_damaged, qty_maintenance}` แล้ว update borrow_request_items และ set status ของ manikin ที่ damaged → `maintenance`
- **VERIFY:** ส่ง damaged item → ตรวจว่า manikin.status = 'maintenance'

---

#### TASK-B03 — เขียน Status Vocabulary / Copy Map
- **Agent:** frontend-specialist
- **Priority:** P0
- **Dependencies:** ไม่มี
- **File:** `website/js/status-labels.js` (ไฟล์ใหม่ shared module)
- **INPUT:** status values: `pending`, `approved`, `returned_pending_inspection`, `completed`, `cancelled`, `rejected`
- **OUTPUT:** Object `STATUS_LABELS_TH` ที่ map แต่ละ status → `{short, long, nextAction}` ภาษาไทย ใช้ได้ทั้ง tracking.html และ borrow-admin
- **VERIFY:** Import ใน browser console → ต้องได้ label สำหรับทุก status

---

### PHASE 1: Public Homepage (index.html)

> ตาม Screen P1 ใน wireframe spec

---

#### TASK-FE01 — เพิ่ม Primary Action Block ใน index.html
- **Agent:** frontend-specialist  
- **Priority:** P0
- **Dependencies:** TASK-B03
- **File:** `website/index.html`
- **INPUT:** Hero section ปัจจุบันมีแค่ stats และ CTA ซ่อนอยู่ใน `display:none`
- **OUTPUT:** เพิ่ม block ใต้ hero stats:
  - Primary button: `เริ่มยืมอุปกรณ์` → `borrow.html`
  - Secondary button: `ติดตามคำขอ` → `tracking.html`
  - Process strip: ค้นหา → เลือกวัน → เลือกอุปกรณ์ → ส่งคำขอ → ติดตามสถานะ
  - Borrowing rules snapshot: ยืมได้ถึงก่อนอนุมัติ, ต้องระบุวัตถุประสงค์
- **VERIFY:** เปิด `website/index.html` ใน browser → เห็น 2 ปุ่มชัดเจนบน viewport โดยไม่ต้อง scroll

---

### PHASE 2: Submission Success Page (success.html)

> ตาม Screen P4 ใน wireframe spec — High value, ไม่มี dependency backend ใหม่

---

#### TASK-FE02 — สร้าง success.html
- **Agent:** frontend-specialist
- **Priority:** P0
- **Dependencies:** ไม่มี
- **File:** `website/success.html`
- **INPUT:** ไม่มีหน้านี้ในระบบ
- **OUTPUT:** หน้าใหม่ประกอบด้วย:
  1. Success header + checkmark icon
  2. Tracking ID block (visually dominant, copy-to-clipboard)
  3. Request summary (dates, items, purpose) — โหลดจาก URL param `?tid=XXX`
  4. Status block: "รอการอนุมัติ — เจ้าหน้าที่จะพิจารณาภายใน 1-2 วันทำการ"
  5. Print button (CSS @media print)
  6. CTA: "ดูสถานะคำขอ" → tracking.html?tid=XXX | "ยืมอุปกรณ์เพิ่ม" → borrow.html
- **VERIFY:** เปิด `success.html?tid=TEST123` → เห็น tracking ID และสามารถ print ได้

---

#### TASK-FE03 — สร้าง success.js
- **Agent:** frontend-specialist
- **Priority:** P0
- **Dependencies:** TASK-FE02, TASK-B03
- **File:** `website/success.js`
- **INPUT:** ไม่มี
- **OUTPUT:** 
  - อ่าน `tracking_id` จาก URL param
  - Query Supabase `borrow_requests` + `borrow_request_items` ด้วย tracking_id
  - แสดงข้อมูลใน DOM
  - ถ้าไม่มี tracking_id → redirect ไป borrow.html
  - Open Graph: `window.print()` สำหรับ print button
- **VERIFY:** Query สำเร็จ + ข้อมูลแสดงถูกต้อง + print dialog เปิดได้

---

#### TASK-FE04 — แก้ borrow.js: redirect ไป success.html หลัง submit
- **Agent:** frontend-specialist
- **Priority:** P0
- **Dependencies:** TASK-FE02
- **File:** `website/borrow.js`
- **INPUT:** หลัง submit สำเร็จ redirect ไป tracking.html
- **OUTPUT:** เปลี่ยน redirect ให้ไปที่ `success.html?tid=${tracking_id}` แทน
- **VERIFY:** ส่ง request จำลอง → browser ไปที่ success.html พร้อม tracking_id ใน URL

---

### PHASE 3: Tracking Page Enhancement (tracking.html + track.js)

> ตาม Screen P5 ใน wireframe spec

---

#### TASK-FE05 — เพิ่ม Cancellation UI ใน tracking.html
- **Agent:** frontend-specialist
- **Priority:** P0
- **Dependencies:** TASK-B01, TASK-B03
- **File:** `website/tracking.html`, `website/track.js`
- **INPUT:** tracking.html แสดงสถานะแต่ไม่มีปุ่มยกเลิก
- **OUTPUT:**
  - เพิ่ม Cancel button ที่ visible เฉพาะเมื่อ `status === 'pending'`
  - เมื่อกด → แสดง confirm dialog → เรียก `cancel_borrow_request(tracking_id)`
  - หลัง cancel สำเร็จ → refresh status + แสดง "ยกเลิกคำขอแล้ว"
  - ถ้า status ไม่ใช่ pending → แสดง note ว่าไม่สามารถยกเลิกได้อีกต่อไป
- **VERIFY:** เปิด request ที่ status = pending → เห็นปุ่มยกเลิก → กด → status เปลี่ยนเป็น cancelled

---

#### TASK-FE06 — เพิ่ม Status Labels + Print Block ใน tracking.html
- **Agent:** frontend-specialist
- **Priority:** P0
- **Dependencies:** TASK-B03
- **File:** `website/tracking.html`, `website/track.js`
- **INPUT:** status แสดงเป็น raw string ภาษาอังกฤษ
- **OUTPUT:**
  - ใช้ `STATUS_LABELS_TH` จาก status-labels.js แสดง label ภาษาไทย + คำอธิบาย next step
  - เพิ่ม print button + CSS `@media print` สำหรับ tracking reference
- **VERIFY:** ดู tracking page ของ request ที่ approved → เห็น "อนุมัติแล้ว" + คำอธิบายต่อไป

---

### PHASE 4: Admin Dashboard Enhancement

> ตาม Screen S2 ใน wireframe spec

---

#### TASK-FE07 — Integrate Borrow Stats เข้า Admin Dashboard
- **Agent:** frontend-specialist
- **Priority:** P0
- **Dependencies:** ไม่มี (borrow stats มีอยู่แล้วใน borrow-admin.js)
- **File:** `website/admin/admin.js`, `website/admin/dashboard.html`
- **INPUT:** loadDashboard() แสดงแค่ inventory stats, borrow stats อยู่แยกใน tab
- **OUTPUT:**
  - เพิ่ม "Urgent Work" strip บน dashboard: pending approvals count, returns due today, overdue pickups
  - ดึง data จาก `renderBorrowStats()` หรือ query ตรง
  - เพิ่ม quick action link: "ดูคำร้องทั้งหมด" → switch tab to borrow-requests
- **VERIFY:** Login admin → dashboard tab → เห็น pending count + returns due today ทันที

---

#### TASK-FE08 — เพิ่ม Risk Flags ใน Request Table
- **Agent:** frontend-specialist
- **Priority:** P1
- **Dependencies:** TASK-FE07
- **File:** `website/admin/borrow-admin.js`
- **INPUT:** request rows ไม่มี visual cue เรื่อง urgency
- **OUTPUT:**
  - ถ้า start_date ≤ 2 วันข้างหน้า → row highlight สีเหลือง + badge "ใกล้เปิดใช้"
  - ถ้า start_date ผ่านไปแล้วและ status ยัง approved → badge "เกินกำหนดคืน"
- **VERIFY:** สร้าง request ที่ start_date = วันพรุ่งนี้ → เห็น highlight ใน table

---

### PHASE 5: Print Stylesheet

---

#### TASK-FE09 — สร้าง print.css สำหรับ success.html และ tracking.html
- **Agent:** frontend-specialist
- **Priority:** P1
- **Dependencies:** TASK-FE02, TASK-FE06
- **File:** `website/print.css`
- **INPUT:** ไม่มี print stylesheet
- **OUTPUT:**
  - `@media print`: ซ่อน nav, ปุ่ม action, footer
  - แสดง tracking ID, รายการอุปกรณ์, วันที่, วัตถุประสงค์, QR หรือ barcode text (optional)
  - A4 layout
- **VERIFY:** Ctrl+P บน success.html → เห็นเฉพาะเนื้อหา reference document

---

## Phase X: Verification Checklist

### Automated Checks

```powershell
# Encoding guard (before deploy)
python .agent\scripts\encoding_guard.py website

# JS syntax check (all modified files)
node --check website\index.html  # (ผ่าน node --check ไม่ได้ แต่ตรวจ JS ใน script tags)
node --check website\success.js
node --check website\borrow.js
node --check website\track.js
node --check website\js\status-labels.js
node --check website\admin\admin.js
node --check website\admin\borrow-admin.js
```

### Manual Acceptance Tests

| # | Scenario | Steps | Expected |
|---|---|---|---|
| T1 | First-time borrower | เปิด index.html → คลิก "เริ่มยืมอุปกรณ์" → เลือกวัน → เลือกหุ่น → submit | เห็น success.html + tracking ID |
| T2 | Success page loads properly | เปิด `success.html?tid=<real-id>` | แสดง dates, items, status ถูกต้อง |
| T3 | Print reference | success.html → Ctrl+P | เห็น print preview ที่สะอาด ไม่มี nav/buttons |
| T4 | Tracking via homepage | index.html → "ติดตามคำขอ" → ใส่ tracking ID | เห็น request status + cancellation option ถ้า pending |
| T5 | Cancel pending request | tracking.html + pending request → กด "ยกเลิกคำขอ" | Status เปลี่ยนเป็น cancelled |
| T6 | Cancel denied for approved | tracking.html + approved request | ไม่เห็นปุ่มยกเลิก เห็น explanatory note แทน |
| T7 | Staff dashboard urgency | Admin login → dashboard tab | เห็น pending count + returns due today |
| T8 | Staff risk flag | Admin → borrow-requests tab → request ที่ start_date ≤ 2 วัน | เห็น row highlight / badge "ใกล้เปิดใช้" |
| T9 | Thai text rendering | เปิดทุกหน้าที่เปลี่ยนแปลง | ไม่มี mojibake |

### Post-Deploy Verification

```powershell
python .agent\scripts\encoding_guard.py website
Invoke-WebRequest https://simset-showroom.pages.dev/ -UseBasicParsing | Select-Object -ExpandProperty StatusCode
Invoke-WebRequest https://simset-showroom.pages.dev/success.html -UseBasicParsing | Select-Object -ExpandProperty StatusCode
Invoke-WebRequest https://simset-showroom.pages.dev/tracking.html -UseBasicParsing | Select-Object -ExpandProperty StatusCode
```

---

## Implementation Order (Sprint Sequence)

```
Sprint 1 (Backend Foundation)
  TASK-B03  → status-labels.js (shared vocabulary)
  TASK-B01  → cancel_borrow_request RPC

Sprint 2 (Public Flow — High Value)
  TASK-FE01 → index.html CTA block
  TASK-FE02 → success.html
  TASK-FE03 → success.js
  TASK-FE04 → borrow.js redirect fix

Sprint 3 (Tracking Enhancement)
  TASK-FE05 → cancellation UI
  TASK-FE06 → status labels + print block

Sprint 4 (Admin Enhancement)
  TASK-FE07 → dashboard borrow stats
  TASK-FE08 → risk flags in request table

Sprint 5 (Polish + Release)
  TASK-FE09 → print.css
  TASK-B02  → admin_receive_return_detailed RPC (Phase 2 prep)
  Phase X verification + deploy
```

---

## Risks and Mitigations

| Risk | Level | Mitigation |
|---|---|---|
| success.html ไม่มี tracking_id ใน URL (direct access) | Low | Redirect ไป borrow.html ถ้าไม่มี param |
| cancel_borrow_request ถูกเรียกซ้ำ (double-click) | Low | ปิดปุ่มหลังเรียก + ใช้ DB guard ที่ RPC level |
| index.html CTA block กระทบ realtime update ของ inventory | Low | CTA block เป็น static HTML ไม่ interact กับ WebSocket |
| per-item return inspection ต้องการ DB migration ใหม่ | Medium | Defer ไป Phase 2 (TASK-B02), Phase 1 ใช้ bulk MVP |
| Thai encoding ใน success.js / status-labels.js | Low | ใช้ `charset="utf-8"` ใน script tags + encoding_guard.py |

---

## Open Items (ยังไม่ต้องการใน Phase 1)

- Staff tab re-grouping (rename: Work Queue / Returns / Inventory / Reference / Reports)
- Per-item return inspection UI (Screen S4 full)
- Printable PDF service
- Request history for signed-in users
- Repeat-user shortcuts / saved filters

---
> Plan generated: 2026-03-20 | Phase 1 target
