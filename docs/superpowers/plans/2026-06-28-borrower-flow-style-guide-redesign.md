# Borrower Flow Style Guide Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ปรับ borrower-facing pages ให้ตรงกับ style guide แบบ C โดยลดข้อมูลภายในที่ผู้ยืมไม่ใช้ และคง workflow/API/database เดิมทั้งหมด

**Architecture:** ทำแบบ presentation-only: แก้ rendering helper ใน JavaScript และ shared CSS โดยไม่เปลี่ยน Supabase query/RPC contract ยกเว้นเลือก field ที่มีอยู่เดิมเพื่อแสดง label ให้เหมาะขึ้น หน้า catalog เป็น priority แรกเพราะเป็นจุดที่ผู้ทดสอบเจอ UUID และข้อความรบกวนมากที่สุด

**Tech Stack:** Static HTML, vanilla JavaScript, Bootstrap CSS bundle เดิม, `website/css/simset-borrow.css`, Supabase client เดิม

---

## File Map

- Modify: `website/js/catalog.js`
  - ตัด UUID ออกจาก catalog card
  - ทำ helper สำหรับ borrower-facing availability/status copy
  - แสดง notice เฉพาะข้อจำกัดจริง
  - ปรับ detail page ให้ไม่เด่นด้วย UUID
- Modify: `website/js/cart.js`
  - ตัด equipment UUID จาก cart table
  - เปลี่ยน English fallback/buttons เป็น Thai ตาม borrower flow
- Modify: `website/js/checkout.js`
  - ตัด equipment UUID จาก checkout item summary
  - แสดง allocation badge เฉพาะกรณีไม่ใช่ normal rotating หรือเมื่อเป็น warning/block
  - ปรับ message ภาษาไทยให้เฉพาะเจาะจงขึ้น
- Modify: `website/js/success.js`, `website/js/track.js`, `website/js/history.js`
  - ตรวจและตัด internal equipment IDs จาก borrower-facing receipt/status/history ถ้ามี
- Modify: `website/css/simset-borrow.css`
  - เพิ่ม compact borrower card styles ตาม PDF: teal brand, less shadow, readable spacing, single primary CTA
- Test: `scripts/smoke-main-pages.js`
  - ใช้ smoke เดิมตรวจว่า pages หลักยังโหลดได้
- Test: `scripts/verify-current-mvp-contracts.js`
  - ใช้ contract เดิมตรวจว่า schema/RPC ที่สำคัญยังไม่โดนเปลี่ยน

---

### Task 1: Catalog Card Cleanup

**Files:**
- Modify: `website/js/catalog.js`
- Modify: `website/css/simset-borrow.css`

- [ ] **Step 1: Add a tiny display helper in `website/js/catalog.js`**

Add these helpers near `availabilityText`:

```javascript
  function borrowerAvailabilityText(available) {
    if (available <= 0) return 'ยังไม่พร้อมให้ยืม';
    return `พร้อมยืม ${available}`;
  }

  function borrowerRestrictionText(allocationType) {
    if (!allocationType || allocationType === 'rotating') return '';
    return allocationHelp(allocationType);
  }
```

- [ ] **Step 2: Replace catalog card noisy summary**

In `renderCatalog()`, replace the current `availableLabel` and `notice` assignments with:

```javascript
      const availableLabel = borrowerAvailabilityText(available);
      const notice = borrowerRestrictionText(item.allocationType);
```

Then keep the card body to only:

```javascript
                <h5 class="fw-bolder equipment-card-title">${esc(item.name)}</h5>
                <div class="equipment-choice-summary mt-3">
                  <strong>${esc(availableLabel)}</strong>
                  ${notice ? `<div class="equipment-choice-note mt-2">${esc(notice)}</div>` : ''}
                </div>
```

This intentionally does not render `item.id`, `จากทั้งหมด X`, normal allocation copy, or duplicated category text.

- [ ] **Step 3: Use brand button class**

In catalog card footer, change:

```html
<button class="btn btn-dark" type="button" data-add-to-cart="${esc(item.id)}" ${disabled ? 'disabled' : ''}>เพิ่มรายการยืม</button>
```

to:

```html
<button class="btn btn-brand" type="button" data-add-to-cart="${esc(item.id)}" ${disabled ? 'disabled' : ''}>เพิ่มรายการยืม</button>
```

- [ ] **Step 4: Add compact card CSS**

Add to `website/css/simset-borrow.css`:

```css
.equipment-card-title {
  min-height: 3rem;
  margin-bottom: 0;
}

.equipment-choice-summary {
  border: 1px solid rgba(15, 118, 110, 0.12);
  border-radius: 10px;
  background: #f8fbfa;
  color: #0f172a;
  padding: 0.85rem;
  text-align: left;
}

.equipment-choice-summary strong {
  color: var(--sb-brand);
}

.equipment-choice-note {
  color: #475569;
  font-size: 0.95rem;
}
```

- [ ] **Step 5: Verify catalog source no longer renders internal ID**

Run:

```powershell
rg -n "รหัสรายการ|item\\.id|จากทั้งหมด|เงื่อนไข:" website/js/catalog.js
```

Expected:
- `item.id` remains only in links, `data-add-to-cart`, search, and detail page internals
- no `รหัสรายการ` inside catalog card markup
- no `จากทั้งหมด` in catalog card markup

---

### Task 2: Product Detail Cleanup

**Files:**
- Modify: `website/js/catalog.js`

- [ ] **Step 1: Demote internal ID on detail page**

In `renderDetails()`, replace:

```html
          <div class="small mb-1 text-muted">รหัสรายการ: ${esc(item.id)}</div>
```

with:

```html
          <div class="small mb-2 text-muted">รายละเอียดอุปกรณ์</div>
```

- [ ] **Step 2: Keep useful detail metadata**

Keep type and restriction in detail page because the user explicitly clicked for details:

```html
            <div>ประเภท: ${esc(readableType)}</div>
            ${notice ? `<div class="equipment-choice-note">${esc(notice)}</div>` : ''}
```

- [ ] **Step 3: Verify UUID is not visible in detail header**

Run:

```powershell
rg -n "รหัสรายการ" website/js/catalog.js
```

Expected: no match.

---

### Task 3: Cart Borrower Copy Cleanup

**Files:**
- Modify: `website/js/cart.js`

- [ ] **Step 1: Remove equipment ID from cart row**

Replace this cart item block:

```html
              <div class="fw-semibold">${esc(equipment?.name_th || 'Unknown equipment')}</div>
              <div class="small text-muted">${esc(cartItem.equipment_id)}</div>
```

with:

```html
              <div class="fw-semibold">${esc(equipment?.name_th || 'ไม่พบชื่ออุปกรณ์')}</div>
```

- [ ] **Step 2: Translate generic labels**

Replace:

```html
            <td>Equipment</td>
```

with:

```html
            <td>อุปกรณ์</td>
```

Replace empty/error English copy with Thai:

```javascript
tbody.innerHTML = '<tr><td colspan="4" class="text-center py-5">ยังไม่มีรายการยืม</td></tr>';
if (summary) summary.textContent = '0 รายการ';
```

```javascript
tbody.innerHTML = `<tr><td colspan="4" class="text-center py-5 text-danger">โหลดรายการยืมไม่สำเร็จ: ${esc(error.message)}</td></tr>`;
if (summary) summary.textContent = 'โหลดข้อมูลไม่สำเร็จ';
```

- [ ] **Step 3: Keep cart state behavior unchanged**

Do not change `getItems()`, `addItem()`, `updateQty()`, `removeItem()`, or localStorage key.

- [ ] **Step 4: Verify cart source no longer shows equipment IDs in row body**

Run:

```powershell
rg -n "equipment_id\\)|cartItem\\.equipment_id|Unknown equipment|Equipment" website/js/cart.js
```

Expected:
- `cartItem.equipment_id` remains in data attributes and update/remove logic
- no small muted UUID row in visible cell
- no visible `Equipment` fallback text

---

### Task 4: Checkout Summary Cleanup

**Files:**
- Modify: `website/js/checkout.js`

- [ ] **Step 1: Remove equipment ID from checkout list**

In `renderCheckoutItems()`, replace:

```html
            <small class="text-muted">${esc(item.equipment_id)}</small>
            <div class="mt-1"><span class="allocation-badge allocation-${esc(equipment?.allocation_type || 'rotating')}">${esc(allocationLabel(equipment?.allocation_type))}</span></div>
```

with:

```html
            ${equipment?.allocation_type && equipment.allocation_type !== 'rotating'
              ? `<div class="mt-1"><span class="allocation-badge allocation-${esc(equipment.allocation_type)}">${esc(allocationLabel(equipment.allocation_type))}</span></div>`
              : ''}
```

- [ ] **Step 2: Improve required-field message**

Replace:

```javascript
showMessage('warning', 'Complete all required fields before submitting.');
```

with:

```javascript
showMessage('warning', 'กรอกข้อมูลที่มีเครื่องหมาย * ให้ครบก่อนส่งคำขอ');
```

Replace:

```javascript
showMessage('warning', 'Return date cannot be before borrow date.');
```

with:

```javascript
showMessage('warning', 'วันที่คืนต้องไม่อยู่ก่อนวันที่ยืม');
```

- [ ] **Step 3: Keep rule warning behavior**

Do not remove `renderRuleAlerts()`; it is still needed for real blocked/warning conditions from Supabase.

- [ ] **Step 4: Verify checkout source no longer displays UUID in summary**

Run:

```powershell
rg -n "item\\.equipment_id|Complete all required|Return date cannot" website/js/checkout.js
```

Expected:
- `item.equipment_id` remains only for RPC payload/rule lookup
- no visible `<small>` ID in checkout list
- English validation text removed

---

### Task 5: Receipt, Tracking, And History Cleanup

**Files:**
- Modify: `website/js/success.js`
- Modify: `website/js/track.js`
- Modify: `website/js/history.js`

- [ ] **Step 1: Search current visible IDs**

Run:

```powershell
rg -n "equipment_id|assigned_unit_code|tracking_id|item\\.id|uuid|รหัสรายการ" website/js/success.js website/js/track.js website/js/history.js
```

Expected:
- Tracking ID may remain visible
- equipment UUID/internal IDs should not be visible in borrower item lists

- [ ] **Step 2: Remove only internal equipment IDs from borrower item rows**

For each item row, keep:

```html
${esc(item.name || item.equipment_name || 'อุปกรณ์')} <span class="text-muted">x${esc(item.qty || item.quantity || 1)}</span>
```

Do not remove tracking ID from success/track/history; users need it.

- [ ] **Step 3: Verify Tracking ID still works**

Run:

```powershell
rg -n "tracking_id|Tracking ID|ติดตามสถานะ" website/js/success.js website/js/track.js website/js/history.js
```

Expected: tracking ID remains available in receipt/status UI.

---

### Task 6: Browser Smoke Verification

**Files:**
- Test only

- [ ] **Step 1: Run source-level contract check**

Run:

```powershell
npm run verify:current-mvp
```

Expected: exits 0.

- [ ] **Step 2: Run page smoke**

Run:

```powershell
npm run smoke:main-pages
```

Expected: exits 0.

- [ ] **Step 3: Manual browser check**

Open:

```text
https://simset-showroom.pages.dev/
```

Check:
- catalog card does not show UUID
- catalog card does not show `จากทั้งหมด X`
- normal rotating items do not show verbose normal-condition copy
- item can be added to cart
- checkout can submit a request
- tracking page can find the request

---

### Task 7: Commit UI Changes

**Files:**
- Stage only files modified by Tasks 1-6

- [ ] **Step 1: Check dirty worktree**

Run:

```powershell
git status --short
```

Expected:
- unrelated existing dirty files may remain
- only borrower UI files from this plan should be staged

- [ ] **Step 2: Stage exact files**

Run:

```powershell
git add -- website/js/catalog.js website/js/cart.js website/js/checkout.js website/js/success.js website/js/track.js website/js/history.js website/css/simset-borrow.css
```

- [ ] **Step 3: Commit**

Run:

```powershell
git commit -m "style: simplify borrower flow UI"
```

Expected: commit succeeds with only planned borrower UI files.

