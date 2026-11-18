# IA and User Flow Blueprint

Project: SIMSET Model System  
Scope: Public borrower experience, tracking, staff operations  
Objective: Redesign the system around the real job-to-be-done: `borrow equipment easily, track requests clearly, and support staff operations + documentation with less friction`

## 0. Approved Baseline Decisions

The following decisions are already approved and must be treated as baseline constraints for all future wireframes, redesign plans, and implementation work.

| Area | Approved Decision |
|---|---|
| Product direction | The system's main purpose is `easy borrowing and return`, not a separate passive showroom |
| Borrower journey | `ค้นหา > เลือกวัน > เลือกอุปกรณ์ > ส่งคำขอ > ติดตามสถานะ` |
| Submission completion | Use a dedicated success page such as `success.html`, not an inline success state inside `borrow.html` |
| Cancellation policy | Borrower can cancel a request until the request is approved |
| Printable document | Use browser print based on HTML + `@media print` in the first redesign phase |
| Staff tab regrouping | Do not rename/regroup admin tabs yet; perform it only in the formal redesign phase |

## 1. Executive Summary

The current system behaves like three parallel products:
- `Showroom` for browsing inventory
- `Borrow` for creating requests
- `Tracking` for follow-up

This structure is technically workable but cognitively expensive for users. A borrower can start in the showroom, but the system does not clearly tell them how to continue into the borrowing process. Staff operations are also organized more by data structure than by daily operational tasks.

The recommended direction is:
- present one public borrowing portal
- keep tracking as a continuation of the same request lifecycle
- organize staff operations by work mode, not by table/model names

The system should feel like one service with three role-based entry modes:
- `Borrow equipment`
- `Track my request`
- `Staff operations`

## 2. Core Design Principles

| Principle | Rule |
|---|---|
| One primary job | Public UX must optimize for borrowing, not showroom browsing alone |
| One lifecycle | Browse, request, approve, receive, return, and document status must feel connected |
| Progressive disclosure | Show only the next needed action, not every tool at once |
| Role clarity | Borrower and staff should each see task-first surfaces |
| Document-first operations | Tracking ID, request status, printable references, and return state must stay consistent across all roles |
| Safe transition | Existing technical selectors and logic can stay, but the information architecture must stop presenting duplicate mental models |

## 3. Primary Personas

### Persona A: Borrower

Needs:
- find the right equipment
- know whether it is available in the desired period
- submit a request quickly
- get a reference/tracking number
- know what happens next
- print or show supporting documents when needed

Pain today:
- starts in showroom but does not know how to transition to borrowing
- sees two similar catalogs with different interaction patterns
- tracking feels detached from the original request

### Persona B: Staff / Operations Team

Needs:
- process incoming requests
- approve or reject with clear reasons
- prepare equipment
- receive returns
- record condition and update stock
- produce auditable records and reports

Pain today:
- admin IA is functional but grouped by modules more than by daily work
- high-frequency tasks compete visually with reference data management

## 4. Proposed Information Architecture

### Level 1 Navigation

The system should expose only three top-level paths to end users:

1. `ยืมอุปกรณ์`
2. `ติดตามคำขอ`
3. `สำหรับเจ้าหน้าที่`

### Public IA

| Level | Section | Purpose |
|---|---|---|
| L1 | Borrow equipment | Main borrower entry point |
| L2 | Search and select | Find equipment and inspect availability |
| L2 | Review request | Confirm dates, purpose, and selected items |
| L2 | Submit complete request | Generate tracking and document reference |
| L2 | After submission | Next-step guidance: wait, receive, print, track |
| L1 | Track request | Search by tracking ID and manage eligible cancellation |

### Staff IA

| Level | Section | Purpose |
|---|---|---|
| L1 | Staff operations | Main staff entry point |
| L2 | Work queue | Pending approvals, upcoming pickups, returns today |
| L2 | Returns and inspection | Return intake, damaged/maintenance routing |
| L2 | Inventory management | Manikins, status, locations, teams |
| L2 | Reference data | Locations, capabilities, team definitions |
| L2 | Reports and audit | Export, metrics, history, traceability |

## 5. Recommended Screen Model

## Public Borrower Experience

### Screen A: Borrowing Portal Home

Purpose:
- replace the split identity between showroom and borrow
- give one obvious starting point

Primary blocks:
- headline: what the service is
- two primary actions:
  - `เริ่มค้นหาอุปกรณ์เพื่อยืม`
  - `ติดตามคำขอที่ส่งแล้ว`
- trust/info strip:
  - how borrowing works
  - lead time and eligibility
  - tracking/document note

### Screen B: Equipment Selection

Purpose:
- merge showroom-like browse behavior into borrowing context

Primary blocks:
- date selection summary at top
- search and category filters
- equipment cards with:
  - name
  - type/group
  - availability in selected date range
  - quick action
  - optional detail drawer
- sticky request summary / cart

Important rule:
- this screen is not a passive showroom
- every result should answer “can I request this now?”

### Screen C: Request Review and Submission

Purpose:
- turn browsing into a formal request

Primary blocks:
- selected date range
- selected equipment list
- purpose/course/project
- verification/captcha
- request policy note
- submit action

### Screen D: Submission Success

Purpose:
- reduce uncertainty right after submission
- establish a formal handoff from request creation to tracking

Approved baseline:
- this must be a dedicated page, not an inline state in `borrow.html`

Primary blocks:
- tracking ID
- request summary
- current status
- what happens next
- print reference
- CTA to tracking page

### Screen E: Tracking

Purpose:
- continue the same lifecycle, not act as a disconnected utility

Approved baseline:
- borrower may cancel only while the request remains unapproved
- print behavior should use browser print layout first

Primary blocks:
- tracking search
- request status
- request facts
- item list
- cancellation eligibility
- print/download reference

## Staff Operations Experience

### Screen S1: Operations Dashboard

Purpose:
- staff should see work by urgency

Primary blocks:
- pending approvals
- pickups due soon
- returns waiting inspection
- stock issues / blocked items
- quick links to active queues

### Screen S2: Request Queue

Purpose:
- process borrow requests fast and consistently

Primary blocks:
- queue filters
- row summary:
  - borrower
  - dates
  - purpose
  - risk/issue flags
- approve / reject actions
- standard rejection reason flow

### Screen S3: Return and Inspection

Purpose:
- separate operational receiving work from approval work

Primary blocks:
- requests expected back today / overdue
- return intake summary
- inspection status
- damaged / maintenance routing
- document / audit notes

### Screen S4: Inventory and Reference Data

Purpose:
- keep slower maintenance tasks separate from live queue work

Subsections:
- manikins inventory
- locations
- teams
- capabilities
- media/images

### Screen S5: Reports and Audit

Purpose:
- support managers and compliance

Primary blocks:
- utilization
- turnaround
- approval / rejection trends
- damaged/maintenance history
- export and audit log access

## 6. End-to-End User Flow Blueprint

## Flow 1: First-time Borrower

1. Enters public portal
2. Chooses `ยืมอุปกรณ์`
3. Selects desired dates
4. Searches/browses equipment
5. Reviews details and adds items
6. Reviews request summary
7. Signs in if needed
8. Submits request
9. Is redirected to a dedicated success page
10. Receives tracking ID and printable confirmation
11. Uses tracking page for follow-up

Decision points:
- no dates selected
- item unavailable
- user not signed in
- item not eligible / not mapped for real submission
- request no longer cancellable because it is already approved

System responses:
- explain what is missing
- keep user in one flow
- do not force them into another catalog or disconnected page

## Flow 2: Returning Borrower Tracking Existing Request

1. Enters public portal
2. Chooses `ติดตามคำขอ`
3. Enters tracking ID
4. Sees current request state
5. Prints reference or cancels if allowed

## Flow 3: Staff Approves Request

1. Staff enters operations dashboard
2. Opens pending queue
3. Reviews request summary
4. Approves or rejects
5. System logs decision and updates lifecycle
6. Borrower sees updated status through tracking

## Flow 4: Staff Receives Return

1. Staff opens returns queue
2. Locates request by tracking/document
3. Confirms returned items
4. Records condition
5. Sends damaged items to maintenance path if needed
6. Closes request / updates inventory

## 7. Current IA Problems Mapped to Proposed Fixes

| Current Problem | Evidence in Current UI | Blueprint Fix |
|---|---|---|
| Showroom and borrow behave like separate products | Showroom CTA to borrow is hidden and borrow has its own separate catalog | Merge borrower browse + request into one borrowing portal |
| Borrower does not know where to start | Showroom emphasizes inventory display, not request creation | Public home gives two explicit choices: borrow or track |
| Tracking feels detached | Tracking is a separate page without strong lifecycle framing | Turn tracking into an explicit continuation of submission success |
| Staff dashboard is module-first | Tabs reflect data domains rather than daily work priority | Reorganize staff IA around work queue, returns, inventory, reports |
| Two catalogs create duplicate mental model | `index.html` and `borrow.html` both present catalog/filter concepts | Keep one borrower catalog experience, not two competing ones |

## 8. IA Decision: Merge or Keep Separate

### Recommendation

Do not merge everything into one literal page.

Do merge the experience into one coherent product:
- one borrower portal
- one lifecycle
- one staff operations area

### Keep Separate

Keep separate routes or screens for:
- borrower selection/submission
- submission success
- tracking
- staff operations

### Merge Conceptually

Merge conceptually:
- showroom browse and borrowing catalog
- request submission and its post-submit next step
- tracking and document retrieval

## 9. Success Criteria

The redesign is successful when:
- a new user can start from the public home and know within 5 seconds whether to borrow or track
- users no longer ask how to get from showroom to borrowing
- the borrower sees one continuous request lifecycle
- the borrower reaches a dedicated success page immediately after submission
- cancellation behavior is consistent everywhere: possible until approval, unavailable after approval
- staff can start the day from a work queue, not from a generic admin module list
- document and status language are consistent across borrower and staff surfaces

## 10. Recommended Next Deliverables

1. Public borrower IA wireframe
2. Staff operations IA wireframe
3. Shared lifecycle copy map
4. Page-by-page migration plan from current structure to target structure
