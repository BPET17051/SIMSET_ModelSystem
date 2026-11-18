
# TestSprite AI Testing Report(MCP)

---

## 1️⃣ Document Metadata
- **Project Name:** SIMSET_ModelSystem
- **Date:** 2026-04-27
- **Prepared by:** TestSprite AI Team

---

## 2️⃣ Requirement Validation Summary

#### Test TC001 Submit a borrow request and receive a tracking ID
- **Test Code:** [TC001_Submit_a_borrow_request_and_receive_a_tracking_ID.py](./TC001_Submit_a_borrow_request_and_receive_a_tracking_ID.py)
- **Test Error:** TEST BLOCKED

The authentication flow cannot continue because the identity provider requires JavaScript, which is not available in the current browser environment.

Observations:
- The IdP/ADFS sign-in page shows the message 'JavaScript is required' and exposes no interactive elements.
- The SSO flow opened an external IdP (ADFS) page that cannot proceed without JavaScript.
- Unable to complete login, so the borrow request flow cannot be executed.
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/7826f892-ac23-4a4d-a245-b0b2dd30478c/1397f94e-498e-4063-878b-bbfafc216bfa
- **Status:** BLOCKED
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC002 Approve a pending borrow request
- **Test Code:** [TC002_Approve_a_pending_borrow_request.py](./TC002_Approve_a_pending_borrow_request.py)
- **Test Error:** TEST BLOCKED

The reservation submission cannot complete because Cloudflare Turnstile is preventing automated submission, so no pending request was created for the admin to review.

Observations:
- The cart/reservation panel shows a Cloudflare Turnstile placeholder and the reservation submit did not complete.
- The admin borrow requests list shows 0 pending items after two submit attempts from the public portal.

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/7826f892-ac23-4a4d-a245-b0b2dd30478c/604492e2-7a12-4248-aee8-3d944513520a
- **Status:** BLOCKED
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC003 Look up a request by Tracking ID and view details
- **Test Code:** [TC003_Look_up_a_request_by_Tracking_ID_and_view_details.py](./TC003_Look_up_a_request_by_Tracking_ID_and_view_details.py)
- **Test Error:** TEST FAILURE

The Tracking lookup feature cannot be used because the Tracking ID input and search controls are not accessible on the page.

Observations:
- The /tracking.html page displays the tracking lookup UI visually, but there is no interactive Tracking ID input or search button in the page's interactive elements.
- Only a cancel-reason textarea inside an open dialog (shadow DOM, textarea id=tracking-cancel-reason) is exposed as interactive.
- Without an accessible input and submit control, a public user cannot perform a tracking search to view request status or item details.
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/7826f892-ac23-4a4d-a245-b0b2dd30478c/78cf1778-cefb-498c-a891-549c13c8ed85
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC004 Enforce availability when cart quantity exceeds available inventory
- **Test Code:** [TC004_Enforce_availability_when_cart_quantity_exceeds_available_inventory.py](./TC004_Enforce_availability_when_cart_quantity_exceeds_available_inventory.py)
- **Test Error:** TEST BLOCKED

The test cannot continue because the app redirected to an external SSO sign-in page that is not interactable in the current browser state (JavaScript required). I cannot complete authentication to return to the borrow flow and verify the availability validation.

Observations:
- The app redirected to https://idp.mahidol.ac.th/... for sign-in.
- The sign-in page reports "JavaScript required" and the automation shows 0 interactive elements, preventing password entry and submit.

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/7826f892-ac23-4a4d-a245-b0b2dd30478c/94bd795d-fb43-4c1c-8802-7af935df6c73
- **Status:** BLOCKED
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC005 Reject a borrow request with a reason
- **Test Code:** [TC005_Reject_a_borrow_request_with_a_reason.py](./TC005_Reject_a_borrow_request_with_a_reason.py)
- **Test Error:** TEST BLOCKED

No pending borrow requests are available in the admin dashboard, so the rejection workflow cannot be executed.

Observations:
- The borrow requests list shows 0 items and the page indicates there are 0 pending approval requests.
- The requests table displays 'ไม่มีรายการ' (no items) so there is nothing to open or reject.
- Without creating a pending request through the app (a prerequisite), the admin reject flow cannot be verified.
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/7826f892-ac23-4a4d-a245-b0b2dd30478c/1fe2d76c-aa9c-45b6-8bcd-8d1929ec6b7e
- **Status:** BLOCKED
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC006 Record per-item return outcomes for a request
- **Test Code:** [TC006_Record_per_item_return_outcomes_for_a_request.py](./TC006_Record_per_item_return_outcomes_for_a_request.py)
- **Test Error:** TEST BLOCKED

There are no borrow requests available to exercise the return-recording workflow, so the verification cannot be completed.

Observations:
- The borrow requests view shows 'ไม่มีรายการ' / 0 รายการ in the table.
- Selecting 'ทุกสถานะ' (all statuses) still returns 0 items.
- With no request present, there is nothing to open to record per-item return outcomes or verify history.
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/7826f892-ac23-4a4d-a245-b0b2dd30478c/bfa17667-5a8a-4be1-8bf3-ef49ec7eb482
- **Status:** BLOCKED
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC007 Cancel a pending request from tracking view
- **Test Code:** [TC007_Cancel_a_pending_request_from_tracking_view.py](./TC007_Cancel_a_pending_request_from_tracking_view.py)
- **Test Error:** TEST BLOCKED

The feature could not be reached — sign-in failed with the provided credentials, so the test cannot continue.

Observations:
- The ADFS sign-in page displays 'Incorrect user ID or password' in red.
- The sign-in form remains visible and the app did not proceed to the application after submitting credentials.
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/7826f892-ac23-4a4d-a245-b0b2dd30478c/7766289f-ab2d-4bf5-aef8-03bc65c9b773
- **Status:** BLOCKED
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC008 View borrower request history and jump to tracking details
- **Test Code:** [TC008_View_borrower_request_history_and_jump_to_tracking_details.py](./TC008_View_borrower_request_history_and_jump_to_tracking_details.py)
- **Test Error:** TEST BLOCKED

The SSO login flow could not be completed because the identity provider (ADFS) page requires JavaScript which is not available in this browsing environment.

Observations:
- The ADFS sign-in page displays "JavaScript is required" and shows no interactive elements.
- Unable to enter password or continue the SSO flow, preventing authentication and further navigation to the borrower's history/tracking pages.
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/7826f892-ac23-4a4d-a245-b0b2dd30478c/cef83fb9-e987-4820-9f4d-36d337f6f0a1
- **Status:** BLOCKED
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC009 Persist moderation status change after page refresh
- **Test Code:** [TC009_Persist_moderation_status_change_after_page_refresh.py](./TC009_Persist_moderation_status_change_after_page_refresh.py)
- **Test Error:** TEST BLOCKED

The test cannot proceed because there are no borrow requests available to approve or reject, and the prerequisite data is not present in the UI.

Observations:
- The Borrow Requests page shows "0 รายการ" (no items) and indicates 0 pending approvals.
- There is no create-request control on this admin page to generate a pending borrow request.
- Without a pending request (which must be created via a borrower flow or test data setup), the approval/rejection and reload persistence cannot be exercised.
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/7826f892-ac23-4a4d-a245-b0b2dd30478c/2459d9ae-feec-46f4-9bbe-0bb9f7500805
- **Status:** BLOCKED
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC010 History details show dates, items, and current status for a selected request
- **Test Code:** [TC010_History_details_show_dates_items_and_current_status_for_a_selected_request.py](./TC010_History_details_show_dates_items_and_current_status_for_a_selected_request.py)
- **Test Error:** TEST BLOCKED

The feature could not be reached — the identity provider (IdP) sign-in page requires JavaScript which is not available in this browser session, so I cannot complete SSO and access the borrower's history.

Observations:
- The IdP page displays 'JavaScript required' and shows 0 interactive elements.
- I cannot proceed to the password step or authenticate, preventing navigation to the history page.
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/7826f892-ac23-4a4d-a245-b0b2dd30478c/aecf042a-54c2-4bb9-83b4-d45bb46bcb99
- **Status:** BLOCKED
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC011 Filter or locate pending requests for review
- **Test Code:** [TC011_Filter_or_locate_pending_requests_for_review.py](./TC011_Filter_or_locate_pending_requests_for_review.py)
- **Test Error:** TEST BLOCKED

The test could not proceed because there are no pending borrow requests in the admin queue to open for review.

Observations:
- The status filter 'รออนุมัติ' (Pending approval) was selected and the page shows: 'แสดง 0 รายการ พร้อมตรวจคิวรออนุมัติ 0 รายการ'.
- The borrow-requests table displays 'ไม่มีรายการ' and no rows are available to open for review.

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/7826f892-ac23-4a4d-a245-b0b2dd30478c/02904a07-19cb-49b9-b835-679e984a0567
- **Status:** BLOCKED
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC012 Prevent rejecting without a rejection reason
- **Test Code:** [TC012_Prevent_rejecting_without_a_rejection_reason.py](./TC012_Prevent_rejecting_without_a_rejection_reason.py)
- **Test Error:** TEST BLOCKED

The test cannot proceed because there are no borrow requests available to open and operate on. A rejection attempt requires an existing request in a state that can be rejected, but the admin borrow requests list is empty even with the status filter set to 'ทุกสถานะ'.

Observations:
- The borrow requests area shows 'แสดง 0 รายการ' and indicates no items are present.
- The status filter is set to 'ทุกสถานะ' but the list still contains no requests.
- Without at least one existing request, the UI path to open a request, clear the rejection reason, and attempt rejection cannot be executed.

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/7826f892-ac23-4a4d-a245-b0b2dd30478c/1b1a21fd-2458-4590-8b34-564b4fda4b8e
- **Status:** BLOCKED
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC013 Prevent approving without required approval details
- **Test Code:** [TC013_Prevent_approving_without_required_approval_details.py](./TC013_Prevent_approving_without_required_approval_details.py)
- **Test Error:** TEST BLOCKED

No pending borrow requests are available to open, so the approval validation cannot be tested.

Observations:
- The borrow requests list shows 0 items (display reads: "แสดง 0 รายการ" and the table is empty).
- There is no control on the admin borrow-requests page to create a new pending borrow request as a test fixture, so the prerequisite data cannot be created from this UI.
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/7826f892-ac23-4a4d-a245-b0b2dd30478c/c12880c5-fce5-4d8a-9d70-eade2027bad9
- **Status:** BLOCKED
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC014 Block cancellation when request status is not pending
- **Test Code:** [TC014_Block_cancellation_when_request_status_is_not_pending.py](./TC014_Block_cancellation_when_request_status_is_not_pending.py)
- **Test Error:** TEST BLOCKED

The test cannot run because the Tracking ID input and search controls are not accessible on the tracking page.

Observations:
- The page shows the Tracking Lookup header and instructional text, but the Tracking ID input field and search button do not appear among the interactive elements.
- Only a cancellation dialog (and a textarea for cancel reason inside a shadow root) is present in the DOM; there is no exposed way to search for an existing request to open its details and attempt cancellation.
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/7826f892-ac23-4a4d-a245-b0b2dd30478c/db86c9cd-941c-4082-a3f1-73c60ce6ff9f
- **Status:** BLOCKED
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC015 Prevent submission when start date is after end date
- **Test Code:** [TC015_Prevent_submission_when_start_date_is_after_end_date.py](./TC015_Prevent_submission_when_start_date_is_after_end_date.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/7826f892-ac23-4a4d-a245-b0b2dd30478c/891267a7-0dad-4c2e-993c-e61850295822
- **Status:** ✅ Passed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---


## 3️⃣ Coverage & Matching Metrics

- **6.67** of tests passed

| Requirement        | Total Tests | ✅ Passed | ❌ Failed  |
|--------------------|-------------|-----------|------------|
| ...                | ...         | ...       | ...        |
---


## 4️⃣ Key Gaps / Risks
{AI_GNERATED_KET_GAPS_AND_RISKS}
---