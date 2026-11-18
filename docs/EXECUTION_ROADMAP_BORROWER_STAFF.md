# Execution Roadmap: Borrower, Tracking, Staff Ops

Project: SIMSET Model System  
Scope: UX/UI redesign planning to implementation readiness  
Purpose: Provide an owner-based roadmap with milestones for UX/UI, Frontend, Backend, and QA

## 1. Teams and Owner Model

| Team | Primary Responsibility |
|---|---|
| UX/UI | IA, wireframes, content hierarchy, interaction patterns, responsive behavior |
| Frontend | Page structure, component behavior, state flow, print layouts, selector-safe implementation |
| Backend | RPC rules, request lifecycle logic, cancellation policy enforcement, document/data support |
| QA | Acceptance criteria, regression checks, lifecycle validation, responsive and print validation |

## 2. Milestone Overview

| Milestone | Focus | Outcome |
|---|---|---|
| M0 | Alignment and baseline lock | Approved redesign scope and success criteria |
| M1 | Wireframe and content specification | Team-ready UX definition |
| M2 | Public borrower flow implementation readiness | Borrow/search/submit/tracking success path ready for build |
| M3 | Staff operations implementation readiness | Admin task-first redesign plan ready for build |
| M4 | Integrated validation and release readiness | Cross-team acceptance and rollout readiness |

## 3. Milestone Detail

## M0: Alignment and Baseline Lock

Objective:
- make sure all teams work from the same approved decisions

### UX/UI

| Task ID | Task | Priority |
|---|---|---|
| UX-M0-01 | Publish approved baseline in planning docs | P0 |
| UX-M0-02 | Confirm public service model is borrowing-first, not showroom-first | P0 |
| UX-M0-03 | Confirm staff IA regrouping is deferred until formal redesign phase | P0 |

### Frontend

| Task ID | Task | Priority |
|---|---|---|
| FE-M0-01 | Review current page inventory against page responsibility matrix | P0 |
| FE-M0-02 | Identify selector-safe constraints for future migration | P0 |

### Backend

| Task ID | Task | Priority |
|---|---|---|
| BE-M0-01 | Confirm request lifecycle states and transitions support approved journey | P0 |
| BE-M0-02 | Confirm cancellation policy: allowed until approval | P0 |
| BE-M0-03 | Confirm browser-print-first approach does not require new PDF service in phase 1 | P0 |

### QA

| Task ID | Task | Priority |
|---|---|---|
| QA-M0-01 | Draft acceptance checkpoints from approved baseline | P0 |
| QA-M0-02 | Define test coverage for public flow, tracking, and staff lifecycle | P0 |

### Exit Criteria

- all teams acknowledge the same baseline
- no open disagreement remains on success page, cancellation, print, or staff regrouping timing

## M1: Wireframe and Content Specification

Objective:
- produce the wireframes and content model required before visual design and implementation

### UX/UI

| Task ID | Task | Priority |
|---|---|---|
| UX-M1-01 | Finalize low-fidelity wireframes for public entry, borrow, success, tracking | P0 |
| UX-M1-02 | Finalize low-fidelity wireframes for staff dashboard, request queue, returns, inventory, reports | P0 |
| UX-M1-03 | Create shared terminology dictionary for borrower/staff lifecycle states | P0 |
| UX-M1-04 | Define responsive behavior notes per screen | P1 |
| UX-M1-05 | Define print content layout for success/tracking references | P1 |

### Frontend

| Task ID | Task | Priority |
|---|---|---|
| FE-M1-01 | Map wireframe zones to current DOM responsibilities | P0 |
| FE-M1-02 | Identify pages requiring replacement, merge, keep, or retirement | P0 |
| FE-M1-03 | Flag risk areas for selector preservation and route transitions | P1 |

### Backend

| Task ID | Task | Priority |
|---|---|---|
| BE-M1-01 | Validate data requirements for success page summary | P0 |
| BE-M1-02 | Validate tracking page data needs for cancel eligibility and status explanation | P0 |
| BE-M1-03 | Validate staff queue data needs for urgency-first dashboard | P1 |

### QA

| Task ID | Task | Priority |
|---|---|---|
| QA-M1-01 | Convert wireframe decisions into testable scenarios | P0 |
| QA-M1-02 | Define print verification checklist | P1 |
| QA-M1-03 | Define responsive checkpoint matrix | P1 |

### Exit Criteria

- wireframes are signed off
- shared copy/lifecycle dictionary exists
- implementation dependencies are known

## M2: Public Borrower Flow Implementation Readiness

Objective:
- prepare the full public user journey for implementation in a safe order

### UX/UI

| Task ID | Task | Priority |
|---|---|---|
| UX-M2-01 | Finalize page-level spec for public entry replacing showroom-first behavior | P0 |
| UX-M2-02 | Finalize borrow step flow and inline validation hierarchy | P0 |
| UX-M2-03 | Finalize success page structure and tracking handoff | P0 |
| UX-M2-04 | Finalize tracking page action hierarchy | P0 |

### Frontend

| Task ID | Task | Priority |
|---|---|---|
| FE-M2-01 | Prepare route strategy for replacing `index.html` responsibility | P0 |
| FE-M2-02 | Prepare `success.html` introduction plan | P0 |
| FE-M2-03 | Prepare deprecation plan for legacy `track.html` and `track.js` | P0 |
| FE-M2-04 | Prepare print stylesheet strategy for success/tracking pages | P1 |

### Backend

| Task ID | Task | Priority |
|---|---|---|
| BE-M2-01 | Ensure submit response supports success page summary and tracking handoff | P0 |
| BE-M2-02 | Ensure tracking/cancel rules reflect “until approval” exactly | P0 |
| BE-M2-03 | Ensure request lifecycle messages can be mapped consistently in UI | P1 |

### QA

| Task ID | Task | Priority |
|---|---|---|
| QA-M2-01 | Prepare borrower critical path regression suite | P0 |
| QA-M2-02 | Prepare tracking and cancellation scenario suite | P0 |
| QA-M2-03 | Prepare print layout verification set | P1 |

### Exit Criteria

- public journey is fully spec'd from entry to tracking
- success page dependency list is complete
- no unresolved blocker remains for borrower flow implementation

## M3: Staff Operations Implementation Readiness

Objective:
- prepare the task-first staff redesign without prematurely renaming tabs in production

### UX/UI

| Task ID | Task | Priority |
|---|---|---|
| UX-M3-01 | Finalize operations dashboard wireframe | P0 |
| UX-M3-02 | Finalize request queue and reject/approve interaction patterns | P0 |
| UX-M3-03 | Finalize return and inspection wireframe | P0 |
| UX-M3-04 | Define lower-priority inventory/reference/report layouts | P1 |

### Frontend

| Task ID | Task | Priority |
|---|---|---|
| FE-M3-01 | Map future staff work modes to current dashboard shell without immediate tab rename | P0 |
| FE-M3-02 | Identify reusable shell/table/modal patterns | P1 |
| FE-M3-03 | Prepare transition-safe implementation order for dashboard content areas | P1 |

### Backend

| Task ID | Task | Priority |
|---|---|---|
| BE-M3-01 | Validate request queue and returns data requirements | P0 |
| BE-M3-02 | Validate admin lifecycle state transitions against new task-first IA | P0 |
| BE-M3-03 | Review audit/reporting needs from redesigned staff flows | P1 |

### QA

| Task ID | Task | Priority |
|---|---|---|
| QA-M3-01 | Define staff queue acceptance scenarios | P0 |
| QA-M3-02 | Define return/inspection acceptance scenarios | P0 |
| QA-M3-03 | Define admin shell regression checkpoints during transition | P1 |

### Exit Criteria

- staff redesign can proceed without breaking current admin shell
- request queue and returns flows are fully specified

## M4: Integrated Validation and Release Readiness

Objective:
- ensure all workstreams can converge safely before implementation or release

### UX/UI

| Task ID | Task | Priority |
|---|---|---|
| UX-M4-01 | Review consistency across borrower, tracking, and staff lifecycle language | P0 |
| UX-M4-02 | Review consistency of print content and status explanations | P1 |

### Frontend

| Task ID | Task | Priority |
|---|---|---|
| FE-M4-01 | Create implementation sequencing and rollback notes | P0 |
| FE-M4-02 | Document page migration order from matrix | P0 |

### Backend

| Task ID | Task | Priority |
|---|---|---|
| BE-M4-01 | Final lifecycle and permission validation review | P0 |
| BE-M4-02 | Confirm no backend gap remains for success/tracking/staff actions | P0 |

### QA

| Task ID | Task | Priority |
|---|---|---|
| QA-M4-01 | Consolidate end-to-end regression plan across all flows | P0 |
| QA-M4-02 | Finalize browser, responsive, and print matrix | P1 |

### Exit Criteria

- all teams agree implementation can begin
- the critical-path acceptance checklist is complete

## 4. Owner Map by Deliverable

| Deliverable | Primary Owner | Supporting Owners |
|---|---|---|
| IA and borrower journey | UX/UI | Product, Frontend |
| Page responsibility matrix | UX/UI | Frontend, Product |
| Public wireframes | UX/UI | Frontend |
| Staff wireframes | UX/UI | Ops, Frontend |
| Success page spec | UX/UI | Frontend, Backend, QA |
| Tracking/cancellation rules | Backend | UX/UI, QA |
| Print strategy | Frontend | UX/UI, QA |
| Staff queue and returns rules | Backend | UX/UI, Ops, QA |
| End-to-end test plan | QA | Frontend, Backend |

## 5. Priority Summary

### P0

- public IA reset
- borrower journey lock
- dedicated success page definition
- cancellation policy implementation readiness
- tracking lifecycle consistency
- staff operations dashboard and queue definition

### P1

- responsive behavior details
- print layout details
- row-level information hierarchy
- returns/inspection refinement
- reference-data isolation from urgent work

### P2

- repeat-user efficiency features
- richer reporting slices
- manager/operator specialization
- escalation and reminder enhancements

## 6. Recommended Planning Sequence

1. Approve wireframe spec
2. Approve owner map and milestone order
3. Convert roadmap into sprint-sized work packages
4. Start implementation plan with selector-safe constraints
