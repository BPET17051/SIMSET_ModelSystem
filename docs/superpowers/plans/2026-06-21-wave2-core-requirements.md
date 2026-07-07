# Wave 2 Core Requirements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the operational core from the requirements without starting the wave 3 allocation-type work.

**Architecture:** Keep all state-changing operations behind Supabase RPCs and call them through the Cloudflare Worker. LINE Messaging API is represented by a durable `line_notification_outbox` plus a `send_line_message` hook that can use `pg_net` when configured, while the app can still operate if credentials are not yet set. Staff and report screens are static pages under `website/` using the existing Supabase client and Realtime.

**Tech Stack:** Static HTML/CSS/JS, Cloudflare Worker, Supabase Postgres/RLS/RPC/Cron/Realtime/Storage.

---

### Task 1: Wave 2 Contract Verification

**Files:**
- Modify: `scripts/verify-current-mvp-contracts.js`

- [ ] Add assertions for `approver_l1`, `line_notification_outbox`, `condition_snapshots`, `mark_overdue_borrow_requests`, `get_staff_dashboard_orders`, `get_kpi_report`, `/staff.html`, `/report.html`, and storage Worker prefix.
- [ ] Run `npm run verify:current-mvp` and confirm it fails before implementation.

### Task 2: Supabase SQL Contracts

**Files:**
- Modify: `supabase/current_mvp_release.sql`

- [ ] Add `overdue` to the canonical status check and transition rules.
- [ ] Add `approver_l1_decide_request` requiring `app_metadata.role = 'approver_l1'` or `admin`, with reject reason mandatory.
- [ ] Add `line_notification_outbox` and event helpers for only `order_created`, `l1_approved`, `overdue`, and `return_abnormal`.
- [ ] Add `condition_snapshots` with pre-checkout and post-return snapshot types, required condition, note, and at least one image URL.
- [ ] Add `confirm_pickup_with_snapshot` and `confirm_return_with_snapshot` so pickup/return cannot happen without snapshot images.
- [ ] Add `mark_overdue_borrow_requests` for daily 08:00 cron usage and LINE outbox events.
- [ ] Add `get_staff_dashboard_orders` and `get_kpi_report` RPCs.

### Task 3: Staff Dashboard

**Files:**
- Create: `website/staff.html`
- Create: `website/js/staff.js`
- Modify: `website/css/simset-borrow.css`

- [ ] Build `/staff.html` with three responsive Kanban columns: approved/not issued, borrowed, returned in last 24 hours.
- [ ] Use Supabase Realtime to reload when `borrow_requests` changes.
- [ ] Add pickup and return forms that require condition, note, and at least one uploaded image.

### Task 4: KPI Report

**Files:**
- Create: `website/report.html`
- Create: `website/js/report.js`
- Modify: `website/css/simset-borrow.css`

- [ ] Build KPI cards for pending approvals, overdue, on-time return rate, and ready manikins.
- [ ] Render monthly order chart and top 5 departments from `get_kpi_report`.

### Task 5: Worker, Docs, Verification

**Files:**
- Modify: `cloudflare-worker/worker.js`
- Modify: `docs/CURRENT_MVP_SYSTEM.md`
- Modify: `docs/RELEASE_SOURCE_SET.md`
- Modify: `scripts/smoke-main-pages.js`

- [ ] Allow only required wave 2 RPC paths and the storage object prefix needed for condition images.
- [ ] Add `/staff.html` and `/report.html` to current route docs and smoke coverage.
- [ ] Run `npm run verify:current-mvp`, `npm run smoke:main-pages`, and `npm run smoke:deploy-workflow`.
