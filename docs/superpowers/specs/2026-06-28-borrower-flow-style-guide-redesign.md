# Spec: Borrower Flow Style Guide Redesign

## Objective

ปรับ borrower-facing flow ให้ตรงกับ SIMSET Borrow Style Guide และลดข้อมูลที่ผู้ยืมไม่ต้องใช้ เช่น UUID, metadata ภายใน, และข้อความซ้ำที่เพิ่ม cognitive load โดยไม่เปลี่ยน workflow, database schema, RPC, หรือระบบอนุมัติที่ทดสอบผ่านแล้ว

## Context

จาก PDF style guide และ feedback ผู้ทดสอบ:

- หน้า catalog ยังแสดงข้อมูลที่ผู้ยืมไม่ใช้ เช่น `รหัสรายการ: <uuid>`
- ข้อความอย่าง `ประเภทอุปกรณ์: ทั่วไป`, `เงื่อนไข: หมุนเวียน - ยืมได้ตามปกติ`, และ `จากทั้งหมด X` ไม่ช่วยการตัดสินใจยืมในบริบทผู้ยืมทั่วไป
- Style guide ใช้ brand teal เป็นหลัก ไม่ใช่ black-heavy UI
- Borrower flow ควรใช้ recognition มากกว่า recall: ผู้ใช้เห็นตัวเลือกและ action ที่จำเป็นทันที โดยไม่ต้องตีความรหัสหรือสถานะภายใน

Reference artifacts:

- `C:\Users\Apisit Tangla\Downloads\565C32~1.PDF`
- `D:\Jedi_EX_HDX_BAC01\01.Jedi_SIMSET\SIMSET_Project\SIMSET_ModelSystem\docs\mockups\catalog-styleguide-comparison.html`
- `D:\Jedi_EX_HDX_BAC01\01.Jedi_SIMSET\SIMSET_Project\SIMSET_ModelSystem\docs\mockups\catalog-styleguide-comparison.png`

## Scope

In scope:

- `website/index.html` catalog
- `website/product-details.html`
- `website/cart.html`
- `website/checkout.html`
- `website/success.html`
- `website/track.html`
- `website/history.html`
- Shared borrower CSS and small presentation helpers used by those pages

Out of scope:

- Supabase schema changes
- RPC or Worker API contract changes
- staff / approver / report / admin workflow changes
- authentication changes
- official borrow-form PDF generation
- inventory assignment rules

## Design Decisions

1. ผู้ยืมเห็นชื่ออุปกรณ์และสถานะที่ใช้ตัดสินใจเท่านั้น
   - ไม่แสดง UUID ใน catalog card
   - ถ้าต้องการ debug/internal ID ให้ย้ายไป detail page หรือ dev-only context เท่านั้น

2. Catalog card ใช้ information hierarchy แบบสั้น
   - ชื่ออุปกรณ์
   - badge ประเภทที่ผู้ยืมเข้าใจได้ เช่น `ทั่วไป`, `ผู้ใหญ่`, `ทารก`
   - availability แบบ action-oriented เช่น `พร้อมยืม 13`
   - แสดง warning เฉพาะเมื่อมีข้อจำกัดจริง เช่น ต้องอนุมัติพิเศษ หรือไม่พร้อมยืม
   - primary CTA เดียว: `เพิ่มรายการยืม`

3. ตัดข้อความที่ไม่เพิ่มคุณค่าใน catalog
   - ไม่แสดง `จากทั้งหมด X` ใน card หลัก
   - ไม่แสดง `ประเภทอุปกรณ์: ทั่วไป` เมื่อ badge บน card บอก category อยู่แล้ว
   - ไม่แสดง `เงื่อนไข: หมุนเวียน - ยืมได้ตามปกติ` สำหรับเคสปกติ

4. Detail page รองรับข้อมูลเสริม
   - ใช้ detail page สำหรับรายละเอียดที่ผู้ยืมอาจต้องดูเพิ่ม
   - แสดงข้อจำกัด/หมายเหตุเฉพาะรายการที่มีความเสี่ยงหรือเงื่อนไขพิเศษ

5. Cart และ checkout ลด task switching
   - แสดงรายการยืมแบบสรุปชัดเจนด้านข้างหรือด้านบนตาม viewport
   - ใช้ label ภาษาไทยที่ตรงกับแบบฟอร์ม เช่น ชื่อผู้ยืม, ตำแหน่ง, หน่วยงาน, เบอร์โทร, วันที่ยืม, วันที่คืน, ยืมพัสดุของ, เพื่อใช้ในงาน, สถานที่ใช้งาน
   - validation message บอก field ที่ต้องแก้แบบเฉพาะเจาะจง

6. Success, Track, History ใช้ receipt/status pattern
   - Tracking ID เป็นข้อมูลหลักที่ต้องเก็บ
   - Status ใช้ภาษาไทยและสีสถานะ
   - รายการยืมแสดงชื่อและจำนวน ไม่แสดง internal ID

## UI Tokens

Use the style guide tokens already extracted:

- Brand primary: `#0f766e`
- Brand dark: `#064e3b`
- Hero gradient: `linear-gradient(135deg, #0f766e, #064e3b)`
- Font: `'Noto Sans Thai', system-ui, sans-serif`
- Card radius: `8px-12px`
- Card shadow: `0 1px 3px rgba(0,0,0,.05)`
- Hover shadow: `0 4px 16px rgba(0,0,0,.10)`
- Primary button shadow: `0 4px 12px rgba(15,118,110,.35)`

## Accessibility And Safety

- Buttons must have visible focus states
- Disabled/unavailable items must not rely on color alone
- Thai labels must remain visible and associated with form inputs
- User-entered text must be rendered via safe text assignment, not HTML injection
- Mobile layout must keep cart summary and submit action reachable without horizontal scroll

## Implementation Boundaries

Always:

- Keep current API/RPC/database contract
- Keep existing submit, approve, pickup, return, and track flow behavior
- Remove internal IDs from borrower catalog cards
- Prefer CSS/helper changes over large rewrites

Ask first:

- Changing schema, RPC names, or worker endpoints
- Changing role/auth flow
- Adding new dependencies
- Changing staff workflow semantics

Never:

- Edit `AGENTS.md` without explicit instruction
- Commit secrets or `.env` values
- Remove auth gates from staff/approver/admin pages

## Verification Plan

Run after implementation:

```powershell
npm run verify:current-mvp
npm run smoke:main-pages
```

Manual checks:

- Catalog card does not show UUID
- Catalog card does not show `จากทั้งหมด X` for normal borrower view
- Normal rotating items do not show verbose condition text
- Item can still be added to cart
- Checkout can still submit a request
- Tracking page can still find the request
- Existing staff approval/pickup/return flow remains unchanged

## Success Criteria

- Borrower-facing pages visually align with the PDF style guide
- Catalog is simpler: name, ready count, useful badge, and action
- No production behavior regression in MVP smoke flow
- Staff-facing workflow remains untouched unless a test reveals a direct regression

