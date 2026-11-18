# Low-Fidelity Wireframe Spec

Project: SIMSET Model System  
Scope: Public borrower flow, tracking, staff operations  
Purpose: Translate the approved IA and page responsibility matrix into screen-level wireframe specifications before visual design and implementation

## 1. Wireframe Rules

| Rule | Requirement |
|---|---|
| Low fidelity only | Focus on layout, hierarchy, actions, and content blocks. No visual styling decisions here |
| Borrowing-first | Every public screen must reinforce the approved borrower journey |
| Document continuity | Tracking ID, request summary, and print blocks must stay consistent across success, tracking, and staff views |
| No duplicate mental model | Do not design a passive showroom separate from the borrowing flow |
| Transition-safe | Future implementation must still respect selector and logic constraints already documented elsewhere |

## 2. Public Flow Wireframes

## Screen P1: Public Service Entry

Future page role:
- replacement responsibility for current `index.html`

Primary purpose:
- give users a clear choice between starting a new borrowing request or tracking an existing request

Wireframe blocks:
1. Header
   - brand
   - optional login/status
2. Hero / purpose statement
   - one sentence that explains the service
3. Primary action group
   - primary button: `เริ่มยืมอุปกรณ์`
   - secondary button: `ติดตามคำขอ`
4. Process summary strip
   - `ค้นหา`
   - `เลือกวัน`
   - `เลือกอุปกรณ์`
   - `ส่งคำขอ`
   - `ติดตามสถานะ`
5. Borrowing rules snapshot
   - who can borrow
   - lead time
   - cancellation rule: until approval
   - print/reference note
6. Optional quick categories
   - common equipment groups

Must not include:
- passive inventory-heavy showroom as the main first impression
- hidden CTA to the real borrowing flow

## Screen P2: Borrowing Catalog and Selection

Future page role:
- core role of current `borrow.html`

Primary purpose:
- allow the borrower to choose dates and select equipment in one continuous flow

Wireframe zones:
1. Top progress/context bar
   - current step
   - selected dates summary
   - request/cart summary access
2. Date selection block
   - start date
   - end date
   - apply action
   - inline validation
3. Filter and search row
   - search
   - age/type filters
   - optional availability cues
4. Equipment results grid/list
   - card title
   - group/type
   - availability in selected dates
   - quick action
   - optional detail drawer trigger
5. Sticky request summary
   - item count
   - selected dates
   - CTA to review request
6. Inline system feedback
   - missing dates
   - unavailable item
   - item cannot be submitted

Interaction notes:
- user should understand immediately whether an item can be requested
- date state must remain visible at all times once selected
- cart/request summary must not be hidden behind an ambiguous icon-only control

## Screen P3: Request Review and Submit

Future page role:
- can remain within `borrow.html` as final review step or route-level section, but still before success page

Primary purpose:
- convert selected equipment into a formal request

Wireframe blocks:
1. Step header
   - review your request
2. Request summary
   - dates
   - selected items
   - quantities
3. Borrower context
   - signed-in identity or prompt to sign in
4. Purpose section
   - purpose / course / project
5. Verification section
   - captcha / confirmation requirement
6. Policy summary
   - cancellation until approval
   - print/reference after submit
7. Submit action row
   - back/edit
   - submit request

## Screen P4: Submission Success

Future page role:
- new dedicated page such as `success.html`

Primary purpose:
- formal post-submit handoff

Wireframe blocks:
1. Success header
   - success state
   - request created confirmation
2. Tracking ID block
   - visually dominant
   - copy-to-clipboard
3. Request summary block
   - dates
   - items
   - purpose
4. Current status block
   - initial status and next action
5. Print/reference block
   - print button
6. Navigation actions
   - go to tracking
   - start new request

Critical note:
- this page must make the user feel the request is now safely recorded

## Screen P5: Tracking

Future page role:
- keep current `tracking.html`

Primary purpose:
- let the borrower retrieve, understand, and act on an existing request

Wireframe blocks:
1. Search block
   - tracking input
   - submit button
2. Request state header
   - tracking ID
   - status
   - plain-language explanation
3. Request facts
   - created date
   - purpose
   - request summary
4. Item list
   - items and dates
5. Action area
   - print reference
   - cancel request if still pending/unapproved
6. Support/help area
   - if request is no longer cancellable

Cancellation logic in wireframe:
- visible only while eligible
- hidden or replaced with explanatory note after approval

## 3. Staff Operations Wireframes

## Screen S1: Staff Login

Future page role:
- keep current `admin/index.html`

Primary purpose:
- secure and clear entry point

Wireframe blocks:
1. logo and system name
2. email/password form
3. error state
4. restricted access note

## Screen S2: Operations Dashboard

Future page role:
- replacement responsibility for current admin dashboard overview tab

Primary purpose:
- orient staff around urgent work today

Wireframe blocks:
1. top summary strip
   - pending approvals
   - upcoming pickups
   - returns waiting inspection
   - blocked stock/issues
2. urgent work modules
   - requests needing decision
   - returns due today
   - inventory risk alerts
3. quick actions
   - open request queue
   - open return queue
   - open reports
4. last sync / status

Must avoid:
- over-prioritizing generic stats over action-required work

## Screen S3: Request Queue

Future page role:
- core role of current `tab-borrow-requests`

Primary purpose:
- process approvals and rejections

Wireframe blocks:
1. queue header
   - search
   - status filter
   - quick counts
2. request table/list
   - tracking/document ref
   - borrower
   - request dates
   - purpose
   - flags
   - primary actions
3. action modal pattern
   - approve
   - reject with reason
4. audit/footer note

## Screen S4: Return and Inspection

Future page role:
- future dedicated work mode extracted from current borrow/admin return handling

Primary purpose:
- handle return intake and post-return condition processing

Wireframe blocks:
1. returns queue
   - due today
   - overdue
   - recently returned pending inspection
2. selected request summary
3. item condition grid
   - returned ok
   - damaged
   - maintenance
4. completion action
5. documentation note

## Screen S5: Inventory and Reference Data

Future page role:
- keep `manikins`, `locations`, `teams`, and related support tabs under a slower back-office mode

Primary purpose:
- manage stock/reference data without interrupting live queue work

Wireframe blocks:
1. subsection tabs or left navigation within staff shell
2. toolbar
3. data table or master-detail region
4. edit/create modal
5. change confirmation and toast

## Screen S6: Reports and Audit

Future page role:
- keep `reports` and historical review responsibilities

Primary purpose:
- support utilization review, audit, and management visibility

Wireframe blocks:
1. KPI summary row
2. trend modules
3. export tools
4. audit/history access

## 4. Mobile Wireframe Behavior

| Screen | Mobile Rule |
|---|---|
| Public entry | Keep only two primary actions above the fold |
| Borrow selection | Date summary and request summary stay visible without relying on hover |
| Review submit | Single-column order: summary -> purpose -> verification -> submit |
| Success | Tracking ID and print action remain above the fold |
| Tracking | Search stays first, action area collapses under request summary |
| Staff queue | Filters collapse, row summary becomes stacked cards if needed |

## 5. Wireframe Approval Checklist

Approve the wireframes only when:
- the public entry clearly points to `Borrow` and `Track`
- no passive showroom-first layout remains
- the borrower journey follows the approved sequence exactly
- a dedicated success page is present
- cancellation behavior is represented as “allowed until approval”
- staff work starts from urgent queues and returns, not generic module browsing
