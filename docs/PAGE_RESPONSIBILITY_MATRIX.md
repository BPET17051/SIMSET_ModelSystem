# Page Responsibility Matrix

Project: SIMSET Model System  
Purpose: Map current pages to future responsibilities under the approved borrowing-first service model

## 1. Decision Model

| Decision | Meaning |
|---|---|
| `Keep` | Keep the page as a distinct page with the same core responsibility |
| `Merge` | Merge the page's responsibility into another page or flow |
| `Retire` | Remove the page from the future user-facing architecture |
| `Replace` | Replace the page with a new page or new responsibility model |

## 2. Approved Baseline Used by This Matrix

- Primary product purpose is easy borrowing and return
- Borrower journey is `ค้นหา > เลือกวัน > เลือกอุปกรณ์ > ส่งคำขอ > ติดตามสถานะ`
- Submission completion must use a dedicated success page
- Cancellation remains available until approval
- Print strategy uses browser print first
- Admin tab regrouping happens only during formal redesign

## 3. Public Pages

| Current Page | Current Role | Future Role | Decision | Reason | Owner | Migration Risk |
|---|---|---|---|---|---|---|
| `website/index.html` | Showroom / public inventory browse | Public service entry page for borrowing and tracking | `Replace` | Current showroom-first role conflicts with approved borrowing-first direction | UX + Frontend | High |
| `website/borrow.html` | Borrow catalog + request creation | Equipment selection and request creation core flow | `Keep` | This is already closest to the target borrower flow | UX + Frontend + Product | Medium |
| `website/tracking.html` | Request tracking | Tracking and post-submit lifecycle continuation | `Keep` | Still needed as a distinct returning-user path | UX + Frontend + Ops | Low |
| `website/track.html` | Legacy tracking UI | No future user-facing role | `Retire` | Legacy duplicate of tracking lifecycle | Frontend | Medium |
| `website/track.js` | Legacy tracking logic | No future role | `Retire` | Duplicate logic should not remain in future architecture | Frontend | Medium |

## 4. New Public Page Required

| Future Page | Purpose | Source Responsibility | Decision | Reason | Owner | Migration Risk |
|---|---|---|---|---|---|---|
| `success.html` or equivalent route | Submission success, tracking handoff, printable confirmation | Extracted from post-submit behavior currently embedded in borrow lifecycle | `Create / Replace missing responsibility` | Approved baseline requires a dedicated success page | UX + Frontend + Product | Medium |

## 5. Public Flow Mapping

| Approved Journey Step | Future Responsible Page |
|---|---|
| ค้นหา | `index.html` replacement or new public entry page, then handoff to `borrow.html` |
| เลือกวัน | `borrow.html` |
| เลือกอุปกรณ์ | `borrow.html` |
| ส่งคำขอ | `borrow.html` |
| สำเร็จ / รับ Tracking ID | `success.html` |
| ติดตามสถานะ | `tracking.html` |

## 6. Admin / Staff Pages

| Current Page | Current Role | Future Role | Decision | Reason | Owner | Migration Risk |
|---|---|---|---|---|---|---|
| `website/admin/index.html` | Staff login | Staff login | `Keep` | Login responsibility remains correct | Frontend + Security | Low |
| `website/admin/dashboard.html` | Unified admin shell with many tabs | Unified admin shell during transition, then regrouped by work mode | `Keep` | Baseline says regrouping waits for formal redesign phase, not immediate rename | UX + Frontend + Ops | Medium |
| `tab-dashboard` | Generic dashboard | Operations dashboard / urgent work overview | `Replace` | Must become task-first rather than generic summary-first | UX + Ops | Medium |
| `tab-borrow-requests` | Borrow requests module | Core work queue for approvals and request actions | `Keep` | This is already a high-value operational surface | UX + Ops + Frontend | Low |
| `tab-review` | Pending review for new items | Secondary operational queue | `Keep` | Still needed, but not primary borrower-facing work | Ops + Frontend | Low |
| `tab-manikins` | Inventory management | Inventory management | `Keep` | Still needed as a separate back-office task | Ops + Frontend | Low |
| `tab-recycle` | History / recycle | Audit/history support | `Keep` | Still needed, but lower priority in new IA | Ops | Low |
| `tab-locations` | Reference data | Reference data | `Keep` | Still needed | Ops | Low |
| `tab-teams` | Team management | Reference data / inventory support | `Keep` | Still needed | Ops | Low |
| `tab-reports` | Reports | Reports and audit | `Keep` | Still needed | Ops + Data | Low |

## 7. Admin Logic Files

| Current File | Current Role | Future Role | Decision | Reason |
|---|---|---|---|---|
| `website/admin/admin.js` | Admin shell and multi-tab logic | Admin shell logic during transition, later task-first IA support | `Keep` |
| `website/admin/borrow-admin.js` | Borrow queue actions | Core operational queue logic | `Keep` |
| `website/admin/login.js` | Login behavior | Login behavior | `Keep` |

## 8. Supporting Assets and Risk Notes

| Item | Decision | Reason |
|---|---|---|
| Shared print styles for request references | `Keep and expand` | Approved baseline uses browser print first |
| Showroom-only copy such as “เพื่อการแสดงผลเท่านั้น” on public primary entry | `Retire or rewrite` | Conflicts with borrowing-first service model |
| Hidden CTA from showroom to borrow | `Retire as a pattern` | Future public entry must make borrowing explicit, not hidden |

## 9. Recommended Transition Order

1. Replace `index.html` responsibility from passive showroom to borrower portal entry
2. Keep `borrow.html` as the main request creation page, but align it to the approved borrower journey
3. Create `success.html` for post-submit handoff
4. Keep `tracking.html` as the lifecycle continuation page
5. Retire legacy `track.html` and `track.js`
6. Keep admin shell and current tab IDs during transition
7. Redesign admin IA formally in the next phase without ad-hoc tab renaming beforehand

## 10. Implementation Use

This matrix should be used before any redesign work to answer:
- Which page remains?
- Which page changes responsibility?
- Which page should disappear?
- Which new page must be introduced?

No implementation should start without aligning wireframes and task breakdowns to this matrix.
