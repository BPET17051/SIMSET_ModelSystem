# Project Plan: Borrowing System UI & Architecture Redesign (Phase 1 MVP)

## 1. Overview
Redesign the SIMSET borrowing catalog into a secure, e-commerce-style UI with real-time inventory management. The system will shift from an exploratory catalog to a transactional "Add to Cart" booking flow.

## 2. Project Type
**WEB** (Frontend: HTML/CSS/JS, Backend: Supabase PostgreSQL)

## 3. Success Criteria & Core Technical Decisions
This section explicitly addresses the constraints and ambiguities resolved in Phase 1 planning:
1. **Inventory Model:** **Quantity-only (MVP)**. We track `total_quantity` and `maintenance_quantity` per equipment. Serialized unit tracking and partial-return logic are deferred to Phase 2 to ensure stability.
2. **Concurrency Strategy:** **Pessimistic Locking**. Inside the `submit_borrow_request` RPC, the database uses `SELECT ... FOR UPDATE` on `equipments` to serialize concurrent requests and prevent double-booking race conditions.
3. **UX/UI Design (E-Commerce Style):** 
   - Uses the **Hybrid Date Selection Model**. The full catalog is shown immediately to encourage browsing. If a user clicks "Add to Cart" without selecting dates, a modal elegantly prompts for the date range.
   - Complete removal of the legacy sidebar. Implementation of modern, image-centric product cards.
4. **Timezone Policy:** **Single Timezone (UTC+7 Hospital Time)**. The database uses `DATE` types (no timestamp with timezone). All overlaps and cutoff times treat dates exactly as written, effectively shifting logic to the Midnight Boundaries of UTC+7.
5. **No Server-Side PDF (MVP Phase 1):**
   - Replaced with **Browser-side Print-to-PDF** using strict `@media print` CSS and a **Secure 128-bit cryptographic Tracking ID** to act as the undeniable source of truth for audits. 

## 4. Tech Stack
- **Frontend:** Vanilla HTML, JS, CSS (Tailwind principles, NO standard templates).
- **Backend:** Supabase (PostgreSQL RPCs, RLS, pg_cron).

## 5. File Structure
```text
/website/
 ├── borrow.html          # Redesigned E-Commerce Catalog
 ├── tracking.html        # New: Status check & Print-to-PDF receipt
 ├── js/
 │   ├── borrow.js        # Cart, Matrix, and Date logic
 │   └── tracking.js      # Fetch tracking status
 └── admin/
     ├── dashboard.html   # Widgets for pending tasks
     ├── requests.html    # Manage Approve/Reject/Returns
     └── js/
         └── requests.js  # Admin actions via RPC
```

## 6. Server-Side API Surface (Supabase RPCs & RLS)
The system prevents raw client `INSERT` operations to maintain data integrity.
- **`rpc('submit_borrow_request')`**: Accepts `items`, `start_date`, `end_date`, `purpose`. Opens a transaction, locks rows (`FOR UPDATE`), checks availability against existing ranges, inserts records, throws exception if stock < 0, and returns the 128-bit Document/Tracking ID.
- **`rpc('get_borrow_request_status')`**: Public tracking. Returns sanitized data (hides borrower full name/email) based on the 128-bit ID.
- **`rpc('admin_approve_request')`, `rpc('admin_reject_request')`, `rpc('admin_receive_return')`**: State transitions handling inventory release and logging.
- **RLS Policies:** `borrow_requests` table has `INSERT` completely blocked from client APIs. `SELECT` is restricted to `auth.uid() = borrower_id` OR `admin_role = true`.

## 7. Task Breakdown

### Task 1: Database Schema & RPC Implementation
- **Agent:** `database-architect`
- **Skills:** `database-design`, `clean-code`
- **Priority:** P0 (Foundation)
- **INPUT:** Current Supabase schema.
- **OUTPUT:**
  1. Revise `equipments` table for Quantity-only tracking.
  2. Create `borrow_requests` (Header) and `borrow_request_items` (Details) tables using `DATE` types.
  3. Write `rpc('submit_borrow_request')` with Pessimistic Locking logic.
  4. Write `rpc('get_borrow_request_status')`.
  5. Enforce strictly locked RLS policies on the tables.
- **VERIFY:** Execute concurrent SQL requests in `psql`/Studio to force a race condition on the last available item. Ensure one succeeds and the other receives a "stock unavailable" exception.

### Task 2: Frontend Catalog & Hybrid Date UI (E-Commerce)
- **Agent:** `frontend-specialist`
- **Skills:** `frontend-design`, `clean-code`
- **Priority:** P1
- **Dependencies:** Task 1
- **INPUT:** `website/borrow.html`, UX constraints.
- **OUTPUT:**
  1. Refactor `borrow.html` to a full-width header-nav layout. Drop the sidebar.
  2. Implement the "Hybrid UX" flow: Users browse immediately, "Add to Cart" prompts for dates if not yet set.
  3. Update `borrow.js` to wire the Cart logic and call the new RPC.
- **VERIFY:** UI follows the "No Purple", "No Standard Bento" rules. Target sizes >= 44px. Run `ux_audit.py`.

### Task 3: Public Tracking & Document Generation (Print-to-PDF)
- **Agent:** `frontend-specialist`
- **Skills:** `frontend-design`
- **Priority:** P1
- **Dependencies:** Task 1, Task 2
- **INPUT:** `website/tracking.html`
- **OUTPUT:**
  1. Create the `tracking.html` page to accept a 128-bit Tracking ID.
  2. Retrieve sanitized tracking data via RPC.
  3. Build a printable invoice/receipt layout using `@media print` CSS.
- **VERIFY:** Ensure browser Print Preview (Ctrl+P) creates a perfect A4 document hiding navbars and buttons.

### Task 4: Admin Approval & Queue
- **Agent:** `backend-specialist`
- **Skills:** `clean-code`
- **Priority:** P2
- **Dependencies:** Task 1
- **INPUT:** `website/admin/requests.html`
- **OUTPUT:**
  1. Build a Task Queue UI for admins to see `pending` requests.
  2. Integrate `admin_approve_request` and `admin_reject_request` logic.
  3. Create a quick "Receive Return (All)" button for MVP inventory loop closure.
- **VERIFY:** Test a full loop: Borrower Submits -> Admin Approves -> Admin Marks Returned -> Stock is restored automatically.

## 8. Phase X: Verification (Mandatory)
- [ ] RLS Policies enforced (Client cannot write `borrow_requests`).
- [ ] Concurrency/Double booking test passed.
- [ ] Run `npm run lint` (or equivalent style check) across JS files.
- [ ] Run `python .agent/skills/vulnerability-scanner/scripts/security_scan.py .`
- [ ] Run `python .agent/skills/frontend-design/scripts/ux_audit.py website`
- [ ] End-to-End browser test (Manual or Playwright) passes full Borrowing Flow.

---
*Created by: `project-planner` Agent*
