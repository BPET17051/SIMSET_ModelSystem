# UI Baseline Spec v1 Checklist

Project: SIMSET Model System  
Version: v1.0  
Date: 2026-04-19  
Audience: Product, UX, Frontend Dev, QA  
Status: Ready for implementation

## 1) Objective

ตั้ง baseline กลางสำหรับ redesign ให้ระบบเปลี่ยนจาก form-first ไปเป็น list-workspace ที่ใช้งานจริงได้ดีขึ้น โดยยังคง logic เดิมและ selector สำคัญที่ระบบใช้อยู่

## 2) Scope

In scope (รอบ v1):
- Public Borrowing page (`/borrow`)
- Admin runtime list pages:
  - Dashboard summary
  - Borrow requests
  - Approve incoming stock
  - Locations
  - Recycle history
  - Reports and analytics

Out of scope (รอบ v1):
- เปลี่ยน schema database
- เปลี่ยน business rules หลักของการอนุมัติ ยืม คืน
- ย้าย framework

## 3) Baseline UX Contract

- Light-first layout เท่านั้น ห้ามใช้ dark mode เป็น default
- Layout ต้องแยก filter/context กับ result area ชัดเจน
- Active filters ต้องมองเห็นได้เป็น chips และลบรายตัวได้
- ต้องมี `Clear all filters` ทุกจุดที่มี multi-filter
- Sort ต้องอยู่ชิดบริบทของผลลัพธ์
- รองรับ Grid/List หรือ Table บน data set เดียวกัน และ state ต้องคงอยู่ตอนสลับ
- Empty state ต้องมี next action ที่ชัดเจน
- Pagination ต้องเป็นระบบเดียวกันทั้งหน้า list หลัก
- Multi-select ต้องมี bulk action bar
- Selection semantics ต้องชัดว่าเลือกเฉพาะหน้าหรือข้ามทุกหน้า
- รองรับ responsive ทั้ง desktop, tablet, mobile
- Thai copy ต้องอ่านได้จริง และห้ามมี mojibake

## 4) Non-Regression Rules

- ห้ามเปลี่ยน ID หรือ data hooks ที่ JS ใช้อยู่โดยไม่ทำ backward-compatible alias
- ห้ามเปลี่ยน API contract โดยไม่ผ่าน review
- ต้องคง flow หลัก: เลือกวัน -> เลือกอุปกรณ์ -> ยืนยันคำขอ
- การแก้ UI ต้องไม่ทำให้ smoke tests หลักตก

## 5) Implementation Checklist (Dev)

Legend:
- `P0` = Critical
- `P1` = High
- `P2` = Medium

### A. Information Architecture and Layout

| ID | Priority | Requirement | Dev Checklist | Acceptance Criteria |
|---|---|---|---|---|
| IA-01 | P0 | หน้าหลักของการยืมต้องเป็น task-flow ก่อน catalog | เพิ่ม section `Step 1/2/3` แบบ persistent ด้านบนรายการ | ผู้ใช้ใหม่เข้าแล้วเข้าใจลำดับงานภายใน 5 วินาที |
| IA-02 | P0 | แยกพื้นที่ Filter กับ Result ชัดเจน | โครงสร้างสองคอลัมน์บน desktop และ collapse บน mobile | ไม่มีองค์ประกอบสำคัญซ้อนกันหรือทับ flow |
| IA-03 | P1 | Sort, view mode, chips ต้องอยู่เหนือผลลัพธ์แบบชิดบริบท | จัด toolbar ผลลัพธ์ไว้ top-of-grid | มองเห็น sort และ chips ได้โดยไม่ต้องเลื่อนกลับขึ้นบน |
| IA-04 | P1 | Admin list pages ใช้ pattern เดียวกัน | สร้าง layout template กลางของ table pages | ทุกหน้า admin list มี hierarchy เดียวกัน |

### B. Filter, Search, Sort, Active Chips

| ID | Priority | Requirement | Dev Checklist | Acceptance Criteria |
|---|---|---|---|---|
| FS-01 | P0 | Active chips แสดงทุกเงื่อนไขที่เลือก | map filter state -> chip list | chips ตรงกับ state จริง 100% |
| FS-02 | P0 | ลบ filter รายตัวได้ | เพิ่ม action remove ต่อ chip | ลบรายตัวแล้วผลลัพธ์ update ทันที |
| FS-03 | P0 | Clear all filters | เพิ่มปุ่มเดียว clear ทุกเงื่อนไข | state กลับ default ครบทุกตัว |
| FS-04 | P1 | Search + filter + sort ต้องทำงานร่วมกัน | สร้าง query-state เดียว | ไม่มี state drift ระหว่าง controls |
| FS-05 | P1 | Mobile filter sheet ต้องมี Apply/Clear | ใช้ mobile drawer มาตรฐาน | ปิด drawer แล้ว state ถูกต้องตาม Apply |

### C. View Mode (Grid/List/Table)

| ID | Priority | Requirement | Dev Checklist | Acceptance Criteria |
|---|---|---|---|---|
| VM-01 | P0 | รองรับสลับมุมมองใน data set เดียวกัน | เพิ่ม segmented control view mode | สลับแล้วไม่ reset filters, sort, page |
| VM-02 | P1 | Persist view preference | เก็บค่าใน URL query หรือ local storage | รีเฟรชหน้าแล้วอยู่โหมดเดิม |
| VM-03 | P1 | Empty state แยกตาม view mode | เตรียม empty template grid/list/table | ข้อความและ CTA เหมาะกับโหมดนั้น |

### D. Pagination and Result State

| ID | Priority | Requirement | Dev Checklist | Acceptance Criteria |
|---|---|---|---|---|
| PG-01 | P0 | Pagination component กลาง | ใช้รูปแบบเดียวทั้ง borrower/admin list | UX pagination สม่ำเสมอทุกหน้า |
| PG-02 | P1 | แสดง count และ page size ชัดเจน | เพิ่ม `x-y of n` และ items/page | ผู้ใช้รู้ว่ากำลังดู subset ไหน |
| PG-03 | P1 | เปลี่ยน sort/filter แล้ว behavior ต้อง predictable | reset page ตามกติกาที่ระบุ | ไม่มีหน้าว่างปลอมหรือ subset เพี้ยน |

### E. Selection and Bulk Actions (Admin First)

| ID | Priority | Requirement | Dev Checklist | Acceptance Criteria |
|---|---|---|---|---|
| SL-01 | P0 | Multi-select ต้องมี selected count ชัดเจน | เพิ่ม selected summary bar | เห็นจำนวนที่เลือกทันที |
| SL-02 | P0 | Bulk action bar ต้องมี action ที่ปลอดภัย | แยก primary, secondary, destructive | ไม่มี destructive action โดยไม่ confirm |
| SL-03 | P1 | รองรับเลือกทั้งหน้าและทั้งผลลัพธ์ | เพิ่ม semantic `select page` และ `select all results` | ผู้ใช้ไม่สับสนขอบเขตการเลือก |
| SL-04 | P1 | เปลี่ยน page/filter/sort แล้ว selection behavior ต้องชัด | เขียนกติกา persistence และเตือนเมื่อ context เปลี่ยน | ไม่มีการลบ selection แบบเงียบ |

### F. Saved Filters and Column Customization (Admin)

| ID | Priority | Requirement | Dev Checklist | Acceptance Criteria |
|---|---|---|---|---|
| SF-01 | P1 | Save current filter set เป็น preset ได้ | add save/update/delete preset actions | เรียก preset แล้วผลเหมือนเดิม |
| SF-02 | P1 | รองรับ default preset ต่อ user | เก็บค่าตั้งต้นใน profile settings | เปิด page ใหม่แล้ว preset default ถูกใช้ |
| CL-01 | P1 | เลือก show/hide columns ได้ | add column chooser dialog | ตารางเปลี่ยนคอลัมน์ได้จริง |
| CL-02 | P2 | reorder/freeze columns | รองรับ drag reorder และ freeze | ผู้ใช้ควบคุม column priority ได้ |

### G. Empty, Loading, Error States

| ID | Priority | Requirement | Dev Checklist | Acceptance Criteria |
|---|---|---|---|---|
| ES-01 | P0 | Empty state ต้องมีข้อความและ CTA | ทำ empty blueprint กลาง | ผู้ใช้รู้ว่าต้องทำอะไรต่อ |
| ES-02 | P0 | Empty state หลัง filter/search ต้องมี clear action | แสดง clear-filter CTA ตรงจุด | กดแล้วกลับเห็นข้อมูลทันที |
| ES-03 | P1 | Loading และ Error ต้องใช้ style เดียวกัน | ใช้ skeleton + inline error pattern | ลดการกระพริบและลดความสับสน |

### H. Visual System and Content Quality

| ID | Priority | Requirement | Dev Checklist | Acceptance Criteria |
|---|---|---|---|---|
| VS-01 | P0 | Light-first surfaces ทั้ง public/admin | ลดพื้นที่พื้นเข้มให้เหลือเฉพาะที่จำเป็น | อ่านง่ายและ contrast ผ่านเกณฑ์ |
| VS-02 | P0 | Secondary text contrast ต้องสูงพอ | ปรับ token สีข้อความรอง | อ่านรายละเอียดได้จริงบนจอปกติ |
| VS-03 | P0 | ห้ามมี mojibake | ตรวจและแก้ทุกหน้าที่พบอักขระเพี้ยน | ไม่พบอักขระเพี้ยนใน runtime |
| VS-04 | P1 | CTA hierarchy ต้องชัด | ใช้ primary เพียงหนึ่งต่อ context | user ไม่งงว่าต้องกดอะไรหลัก |

## 6) QA Checklist (Test Cases)

### QA-A: Borrower Runtime

| TC | Priority | Scenario | Expected |
|---|---|---|---|
| QA-BR-01 | P0 | เปิด `/borrow` ครั้งแรก | เห็น Step flow และ CTA หลักเดียวชัดเจน |
| QA-BR-02 | P0 | เลือกวัน -> ดูรายการว่าง | รายการ update ตามวันที่เลือก |
| QA-BR-03 | P0 | ใช้ filter หลายตัว | มี active chips ครบ และลบรายตัวได้ |
| QA-BR-04 | P0 | กด clear all filters | filters ทุกตัว reset |
| QA-BR-05 | P1 | สลับ grid/list | filter/sort/page คงอยู่ |
| QA-BR-06 | P0 | ผลลัพธ์ว่างจาก filter | แสดง empty state + clear action |
| QA-BR-07 | P0 | ยังไม่ login แล้วพยายามยืนยัน | ระบบ block อย่างชัดเจนและบอกสาเหตุ |
| QA-BR-08 | P1 | มือถือ 390px | filter เปิดเป็น sheet และใช้งานได้ครบ |

### QA-B: Admin Runtime List Pages

| TC | Priority | Scenario | Expected |
|---|---|---|---|
| QA-AD-01 | P0 | Borrow requests: search + status + sort | state ตรงกัน ไม่มี drift |
| QA-AD-02 | P0 | multi-select หลายแถว | มี bulk action bar และ selected count |
| QA-AD-03 | P1 | select all page -> select all results | ขอบเขตการเลือกแสดงชัด |
| QA-AD-04 | P1 | เปลี่ยนหน้าแล้วกลับมา | selection persistence ตรงตามกติกา |
| QA-AD-05 | P1 | save filter preset แล้วเรียกใช้ | ผลลัพธ์กลับมาเหมือนเดิม |
| QA-AD-06 | P1 | customize columns แล้วรีเฟรช | คอลัมน์ยังคงตาม preference |
| QA-AD-07 | P0 | empty table ใน review/approve | แสดง empty state ที่แนะนำทางไปต่อ |
| QA-AD-08 | P1 | มือถือ/tablet | sidebar + table overflow ยังใช้งานได้ |

### QA-C: Regression and Quality

| TC | Priority | Scenario | Expected |
|---|---|---|---|
| QA-RG-01 | P0 | `smoke:main-pages` | ผ่านทั้งหมด |
| QA-RG-02 | P0 | `smoke:nav` | ผ่านทั้งหมด |
| QA-RG-03 | P0 | `smoke:deploy-workflow` | ผ่านทั้งหมด |
| QA-RG-04 | P0 | ตรวจ copy ไทยทุกหน้าหลัก | ไม่พบ mojibake |
| QA-RG-05 | P1 | keyboard navigation | tab order และ focus-visible ถูกต้อง |

## 7) Release Gate (Definition of Done)

ปล่อยได้เมื่อครบทุกข้อ:
- P0 Dev checklist ผ่าน 100%
- P0 QA test cases ผ่าน 100%
- P1 ผ่านอย่างน้อย 80% และไม่มี blocker
- Smoke tests 3 ชุดผ่านครบ
- ไม่มี mojibake ในหน้า production runtime
- ไม่มี JS error ที่กระทบ flow หลัก

## 8) Execution Order

Sprint 1:
- IA-01, IA-02, FS-01..03, ES-01..02, VS-01..03, QA-BR P0

Sprint 2:
- VM-01..03, PG-01..03, SL-01..03, QA-AD P0/P1 ครึ่งแรก

Sprint 3:
- SF-01..02, CL-01..02, SL-04, QA-AD ที่เหลือ + regression ปิดรอบ

## 9) Required Artifacts Per Ticket

ทุก ticket ต้องแนบ:
- Before/After screenshot (desktop + mobile)
- URL หรือ route ที่ทดสอบ
- State matrix สั้นๆ (filter/sort/view/page)
- QA evidence ว่าผ่าน TC ที่เกี่ยวข้อง

Current baseline artifacts:

- [UI_BASELINE_EVIDENCE_PACK_V1.md](./UI_BASELINE_EVIDENCE_PACK_V1.md)
- [UI_ADMIN_PARITY_AUDIT_V1.md](./UI_ADMIN_PARITY_AUDIT_V1.md)

## 10) Resolved v1 Policies

- Grid/List toggle: เปิดใช้ใน public borrowing page เท่านั้นใน v1 ส่วน admin operational pages คง table-only
- Selection persistence policy: คง selection ข้าม pagination ได้ภายใน filtered dataset เดียวกัน และเมื่อ filter/sort ใหม่ทำให้บาง row หลุดจาก result set ต้องแจ้งเตือนก่อนล้าง selection ส่วนนั้น
- Saved filters: v1 ใช้ local user preference ใน browser/device เดียวก่อน โดยเก็บใน local storage ยังไม่ sync ข้าม device
- Column freeze: รองรับเฉพาะ admin table ที่มี column customization ใน v1 โดยเริ่มที่ Borrow Requests

## 11) Owner Recommendation

- Product: ยืนยัน policy ในหัวข้อ Open Questions
- Frontend Dev: เริ่ม Sprint 1 ตาม Execution Order
- QA: ใช้หัวข้อ QA Checklist สร้าง test run sheet ได้ทันที
