# Master Redesign Plan: Borrower, Tracking, Staff Ops

Project: SIMSET Model System  
Mode: Planning only  
Goal: Reorganize the system around a unified borrowing lifecycle for borrowers and staff without changing code in this phase

## 0. Approved Baseline

These decisions are approved and no longer open for discussion in this plan unless the project owner reopens them explicitly.

| Area | Approved Decision |
|---|---|
| Product direction | Primary product purpose is easy borrowing and return, not a separate showroom |
| Borrower journey | `ค้นหา > เลือกวัน > เลือกอุปกรณ์ > ส่งคำขอ > ติดตามสถานะ` |
| Success state | Dedicated success page such as `success.html` |
| Cancellation policy | Borrower can cancel until request approval |
| Print strategy | Browser print first, using HTML + `@media print` |
| Staff IA rollout | Admin tab regrouping waits for formal redesign phase |

## 1. Planning Outcome

This plan breaks redesign work into three streams:
- `Public Borrower Flow`
- `Tracking`
- `Staff Ops`

Priorities:
- `P0` must happen to fix the core user confusion and establish one service model
- `P1` should happen in the main redesign cycle
- `P2` improves polish, trust, and long-term maintainability

## 2. Strategic Direction

### Product Decision

The system should be repositioned as:
- one borrowing service
- one request lifecycle
- one operations backend

Not as:
- one showroom product
- one borrowing product
- one tracking utility
- one separate admin product with weak lifecycle continuity

## 3. Workstream A: Public Borrower Flow

### Objective

Make borrowing the obvious public entry point and remove confusion between showroom browsing and request creation.

### P0

| ID | Task | Outcome |
|---|---|---|
| A-P0-01 | Redefine public IA so homepage offers `Borrow` and `Track` as primary choices | User knows where to start immediately |
| A-P0-02 | Collapse showroom and borrowing catalog into one conceptual flow | No more duplicate catalog mental model |
| A-P0-03 | Define one primary borrower journey: dates -> select items -> review -> submit | Team has a single canonical flow |
| A-P0-04 | Rewrite CTA logic and copy map so every public page clearly indicates the next action | No dead-end showroom experience |
| A-P0-05 | Define dedicated success page after request submission with tracking/document handoff | Borrower understands what happens next |

### P1

| ID | Task | Outcome |
|---|---|---|
| A-P1-01 | Standardize catalog card information hierarchy around availability and requestability | Users can decide faster from list view |
| A-P1-02 | Define sticky request summary behavior across desktop and mobile | Users retain context while selecting |
| A-P1-03 | Simplify date selection UX and make booking state always visible | Date state is never hidden |
| A-P1-04 | Add onboarding/helper copy for first-time borrowers | Reduced support questions |
| A-P1-05 | Define mobile-first behavior for cart, drawers, and review summary | Public UX remains usable at narrow widths |

### P2

| ID | Task | Outcome |
|---|---|---|
| A-P2-01 | Add contextual recommendations or quick categories for common borrowing scenarios | Faster path for frequent needs |
| A-P2-02 | Add saved filters or recent request shortcuts | Better repeat-user efficiency |
| A-P2-03 | Create richer trust content: rules, lead time, who can borrow, print/document guidance | Lower ambiguity before submission |

## 4. Workstream B: Tracking

### Objective

Make tracking a continuation of the borrow lifecycle rather than a detached tool.

### P0

| ID | Task | Outcome |
|---|---|---|
| B-P0-01 | Reposition tracking as a top-level public entry alongside borrowing | Returning users know where to go |
| B-P0-02 | Define tracking page content model: status, summary, next action, print/doc, cancel eligibility until approval | Users can interpret status without support |
| B-P0-03 | Map request lifecycle language consistently between submit success, tracking, and staff screens | Same status means the same thing everywhere |
| B-P0-04 | Define post-submit handoff from borrow confirmation to tracking | No gap after request creation |

### P1

| ID | Task | Outcome |
|---|---|---|
| B-P1-01 | Add plain-language status explanations and expected next steps | Reduced uncertainty |
| B-P1-02 | Define cancellation communication rules for the approved policy: cancellable until approval | Users understand when they can or cannot cancel |
| B-P1-03 | Standardize printable/reference document layout and metadata using browser print first | Better front-desk and borrower document use |
| B-P1-04 | Add a request history mental model for signed-in borrowers | Better continuity for repeat usage |

### P2

| ID | Task | Outcome |
|---|---|---|
| B-P2-01 | Add contextual contact/help escalation for blocked requests | Better recovery path |
| B-P2-02 | Add proactive reminders or timeline indicators | Better transparency |

## 5. Workstream C: Staff Ops

### Objective

Reorganize the admin area around operational work and documentation, not only around data modules.

### P0

| ID | Task | Outcome |
|---|---|---|
| C-P0-01 | Define a new staff IA with top-level groupings: Work Queue, Returns, Inventory, Reference Data, Reports | Admin starts from work, not structure |
| C-P0-02 | Design an operations dashboard focused on urgent tasks today | Staff sees what requires attention immediately |
| C-P0-03 | Separate approval queue from returns/inspection work | Distinct workflows become clearer and faster |
| C-P0-04 | Align admin request status and document states with borrower-facing lifecycle | Less translation between teams and users |
| C-P0-05 | Define standard action patterns for approve, reject, receive return, inspect damage | Consistent staff operation language |

### P1

| ID | Task | Outcome |
|---|---|---|
| C-P1-01 | Redesign request table row structure to include borrower, dates, purpose, risk flags | Better scanning speed |
| C-P1-02 | Add queue summaries by time and urgency | Better operational planning |
| C-P1-03 | Improve reject reason UX with standard templates and audit clarity | Better communication quality |
| C-P1-04 | Improve return inspection UX with totals and exception handling | Fewer errors during intake |
| C-P1-05 | Move reference data tasks away from the most urgent operational surfaces | Less dashboard clutter |

### P2

| ID | Task | Outcome |
|---|---|---|
| C-P2-01 | Add role-oriented dashboards for manager vs operator usage | Better specialization |
| C-P2-02 | Add richer reporting slices: turnaround, damaged returns, demand trends | Better decision support |
| C-P2-03 | Add audit/history surfacing optimized for forensic review | Easier incident review |

## 6. Cross-Workstream Dependencies

| Dependency | Why It Matters |
|---|---|
| Shared lifecycle vocabulary | Borrower, tracking, and staff screens must use the same status language |
| Shared document model | Tracking ID, request summary, and print references must stay consistent |
| Shared policy communication | Lead times, cancellation rules, and return handling must match everywhere |
| Shared navigation model | Public entry points and staff entry points must not compete or duplicate |

## 7. Proposed Delivery Phases

### Phase 1: Service Model Reset

Focus:
- settle target IA
- decide public entry points
- decide lifecycle language
- lock success-page and cancellation behavior across all roles

Scope:
- A-P0-01 to A-P0-05
- B-P0-01 to B-P0-04
- C-P0-01 to C-P0-05

Deliverables:
- IA sign-off
- journey maps
- naming/copy map
- page responsibility matrix
- approved decision baseline embedded into all downstream specs

### Phase 2: Borrower Experience Redesign

Focus:
- redesign borrower flow
- link submission to tracking clearly

Scope:
- A-P1 group
- B-P1 group

Deliverables:
- wireframes
- responsive behavior definition
- content and error-state spec

### Phase 3: Staff Operations Redesign

Focus:
- task-first dashboard
- request queue
- returns and inspection

Scope:
- C-P1 group

Deliverables:
- staff dashboard IA
- table/action standards
- modal/action copy standards

### Phase 4: Optimization and Extensions

Focus:
- reporting polish
- repeat-user efficiency
- long-term operational quality

Scope:
- A-P2
- B-P2
- C-P2

## 8. Deliverables Matrix

| Deliverable | Owner Type | Priority |
|---|---|---|
| Public IA map | UX/PO | P0 |
| Borrower lifecycle blueprint | UX/PO | P0 |
| Tracking lifecycle and status model | UX/PO/Ops | P0 |
| Staff IA and work queue model | UX/Ops | P0 |
| Copy and terminology dictionary | UX/Content/Ops | P0 |
| Public wireframes | UX/UI | P1 |
| Staff wireframes | UX/UI | P1 |
| Responsive behavior spec | UX/UI | P1 |
| Reporting optimization package | UX/Ops/Data | P2 |

## 9. Decision Checklist for Stakeholders

Before implementation starts, stakeholders should explicitly approve:

1. Is `Borrow equipment` the true primary public use case?
2. Should the public homepage lead with `Borrow` and `Track`, not a passive showroom?
3. Should showroom browsing become part of the borrowing flow instead of a separate product?
4. Should staff navigation be reorganized around work queues and returns?
5. Should request lifecycle language be standardized across borrower and admin screens?

Status:
- items 1-5 are effectively approved by the current baseline and should now drive planning artifacts

## 10. Recommended Immediate Next Step

The next planning artifacts are:
1. page responsibility matrix
2. low-fidelity wireframes
3. safe implementation plan
