# SIMSET Borrow Release Candidate - 2026-08-02

## Scope

Release candidate for the SIMSET Borrow static frontend, Cloudflare Worker proxy, and Supabase-backed MVP workflow.

## Source And Runtime

- Branch: `codex/webapp-production-verification`
- Current release commit before this note: `a2842a1`
- Production site: https://simset-showroom.pages.dev
- Worker proxy: https://simset-showroom-proxy.simset-admin.workers.dev
- Supabase project: `SIMSET_ModelSystem` / `mcdpfsuyjfxmfeiafkyq`
- Git remote checked: `https://github.com/BPET17051/SIMSET_ModelSystem.git`

## Verification Evidence

Verified on 2026-08-02 20:00 Asia/Bangkok.

### Static Smoke Test

Command:

```powershell
npm run test:smoke
```

Result:

- PASS: Catalog page
- PASS: Product details page
- PASS: Cart page
- PASS: Checkout page
- PASS: Tracking page
- PASS: Success receipt page
- PASS: Borrower history page
- PASS: Admin login page
- PASS: Admin page
- PASS: Staff dashboard page
- PASS: L1 approval page
- PASS: KPI report page

### Production Borrower E2E

Command:

```powershell
node scripts/verify-production-web-e2e.js
```

Result:

- Production URL: https://simset-showroom.pages.dev
- Tracking ID created: `SIM-20260802-RZV7X5FI`
- Catalog rendered 4 equipment cards
- Catalog did not expose internal UUID text
- Cart retained selected item
- Checkout submitted successfully
- Tracking page displayed submitted request
- Staff page guard/dashboard route loaded
- Approver page guard/queue route loaded
- Unexpected HTTP failures: `0`
- Browser console errors: `0`

## Production Test Data Cleanup

The production borrower E2E creates real pending requests. Cleanup was run after verification against Supabase project `mcdpfsuyjfxmfeiafkyq`.

Deleted pending test requests where:

- `borrower_name = 'E2E Codex Test'`
- `borrower_email = 'codex-e2e@example.com'`

Deleted tracking IDs:

- `SIM-20260802-29NIWJPG`
- `SIM-20260802-4TRALE1C`
- `SIM-20260802-77RJJ4OB`
- `SIM-20260802-I4NTX4MZ`
- `SIM-20260802-MVFJP2WD`
- `SIM-20260802-RZV7X5FI`

Cleanup result:

- Deleted `borrow_requests`: 6
- Deleted `line_notification_outbox`: 6
- Deleted `kit_refill_tasks`: 0
- Remaining E2E requests: 0

## Security Hygiene

- Local Git remote no longer contains a GitHub PAT.
- If a GitHub PAT was previously exposed outside this repository config, rotate/revoke it in GitHub Developer Settings.

## Remaining Release Gate

Manual authenticated staff E2E still needs one final run with a real staff account:

1. Submit one borrower request.
2. Approve as L1 approver.
3. Confirm pickup with pre-checkout snapshot.
4. Confirm return with post-return snapshot.
5. Verify equipment/manikin status returns to `ready`.
6. Verify tracking page shows final status.
7. Verify staff dashboard columns update correctly.

## Release Decision

`CONDITIONAL GO`

Reason: public borrower production E2E and smoke checks pass, production test data was cleaned, and local Git remote is clean of PAT. Final GO requires documented manual staff authenticated E2E evidence because CI does not hold staff credentials.
