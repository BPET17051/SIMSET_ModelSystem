# UI Admin Parity Audit v1

Project: SIMSET Model System  
Date: 2026-04-26  
Baseline source: [UI_BASELINE_SPEC_V1_CHECKLIST.md](./UI_BASELINE_SPEC_V1_CHECKLIST.md)

## 1. Purpose

ตรวจ parity ของ admin runtime นอกเหนือจาก Borrow Requests เพื่อยืนยันว่าพฤติกรรมหลักของ list-workspace ตรง baseline ระดับ v1 แล้วหรือยัง

## 2. Resolved v1 Policy

Section 10 decisions for v1:

- Grid/List toggle: ใช้เฉพาะ public borrowing page ใน v1. Admin operational pages คง `table-only` เพราะข้อมูลหนาแน่นและ action-oriented
- Selection persistence policy: คง selection ข้าม pagination ได้ภายใน filtered dataset เดียวกัน. ถ้า filter หรือ sort ใหม่ทำให้บาง row หลุดจาก result set ต้องแจ้งเตือนก่อน prune selection ที่หลุด scope
- Saved filters: v1 ใช้ `localStorage` เป็น local user preference ใน browser/device เดียว ยังไม่ sync ข้าม device
- Column freeze: v1 รองรับเฉพาะ admin table ที่มี column customization แล้วเท่านั้น โดยเริ่มที่ Borrow Requests

## 3. Parity Matrix

| Page | Search | Sort | Active chips | Clear all | Empty state CTA | Pagination | Multi-select | Saved filters | Column customization | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| Borrow Requests | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes + freeze | Pass |
| Approve Incoming Stock | Yes | Yes | Yes | Yes | Yes | Yes | No | No | No | Partial by design |
| Locations | Yes | Yes | Yes | Yes | Yes | Yes | No | No | No | Partial by design |
| Recycle History | Yes | Yes | Yes | Yes | Yes | Yes | No | No | No | Partial by design |
| Reports and Analytics | n/a list table | n/a list table | n/a chips | n/a chips | Yes analytics empty state | n/a pagination | No | No | No | Pass for analytics pattern |
| Dashboard Summary | n/a list table | n/a | n/a | n/a | task guidance state present | n/a | No | No | No | Pass for summary pattern |

## 4. Findings

- Borrow Requests is the only admin page that fully reaches the advanced baseline set: selection semantics, saved presets, column chooser, frozen columns, and scoped bulk actions
- Review, Locations, and Recycle already share the same core list-workspace pattern: search, sort, active chips, clear-all, pagination, and empty state CTA
- Reports is not a list page in runtime practice; it should not be forced into table parity because the current analytics workspace matches the checklist intent better than a fake grid/table toggle
- Dashboard is also not a list page; parity target here is hierarchy and actionable summary, not table mechanics

## 5. Remaining Gaps

Non-blocking gaps still open after this audit:

- Admin non-borrow list pages do not yet share saved filters
- Admin non-borrow list pages do not yet expose multi-select and bulk actions
- Column customization is still isolated to Borrow Requests
- There is no shared explicit page-size selector across all admin list pages, even though pagination behavior is already standardized

## 6. Recommendation

For checklist closure:

- Treat Borrow Requests as the `full-featured admin reference page`
- Treat Review, Locations, and Recycle as `core parity pass` for search/sort/chips/clear/pagination/empty
- Do not block release on Grid/List for admin pages in v1
- Open a separate v1.1 ticket if product wants saved filters or column customization expanded beyond Borrow Requests
