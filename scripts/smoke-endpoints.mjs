#!/usr/bin/env node

/**
 * Smoke-test public pages and Worker endpoints to catch lingering 403/404.
 *
 * Usage:
 *   node scripts/smoke-endpoints.mjs
 *   node scripts/smoke-endpoints.mjs --site=https://simset-showroom.pages.dev --worker=https://simset-showroom-proxy.simset-admin.workers.dev
 */

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [k, v] = arg.split("=");
    return [k.replace(/^--/, ""), v];
  })
);

const SITE_BASE = (args.site || "https://simset-showroom.pages.dev").replace(/\/+$/, "");
const WORKER_BASE = (args.worker || "https://simset-showroom-proxy.simset-admin.workers.dev").replace(/\/+$/, "");
const TIMEOUT_MS = Number(args.timeout_ms || 15000);

const PAGE_CHECKS = [
  { name: "Public Home", path: "/" },
  { name: "Borrow Page", path: "/borrow" },
  { name: "Tracking Page", path: "/tracking" },
  { name: "Admin Dashboard", path: "/admin/dashboard" },
];

const API_CHECKS = [
  // Borrow page dependencies
  { group: "borrow", name: "manikins", method: "GET", path: "/rest/v1/manikins?select=sap_id&limit=1" },
  { group: "borrow", name: "equipments", method: "GET", path: "/rest/v1/equipments?select=id&limit=1" },
  {
    group: "borrow",
    name: "rpc:get_borrow_availability",
    method: "POST",
    path: "/rest/v1/rpc/get_borrow_availability",
    body: { p_start_date: "2026-03-11", p_end_date: "2026-03-12", p_equipment_ids: [] },
  },
  {
    group: "borrow",
    name: "rpc:submit_borrow_request",
    method: "POST",
    path: "/rest/v1/rpc/submit_borrow_request",
    body: {
      p_borrower_id: "00000000-0000-0000-0000-000000000000",
      p_borrower_name: "smoke-test",
      p_borrower_email: "smoke@example.com",
      p_purpose: "smoke-test",
      p_start_date: "2026-03-11",
      p_end_date: "2026-03-12",
      p_items: [],
    },
  },

  // Tracking page dependencies
  {
    group: "tracking",
    name: "rpc:get_borrow_request_status",
    method: "POST",
    path: "/rest/v1/rpc/get_borrow_request_status",
    body: { p_tracking_id: "SMOKE-NOT-FOUND" },
  },
  {
    group: "tracking",
    name: "rpc:cancel_borrow_request",
    method: "POST",
    path: "/rest/v1/rpc/cancel_borrow_request",
    body: { p_tracking_id: "SMOKE-NOT-FOUND", p_reason: "smoke-test" },
  },

  // Admin page dependencies (tables/rpcs used by admin.js + borrow-admin.js)
  { group: "admin", name: "locations", method: "GET", path: "/rest/v1/locations?select=id&limit=1" },
  { group: "admin", name: "capabilities", method: "GET", path: "/rest/v1/capabilities?select=id&limit=1" },
  { group: "admin", name: "teams", method: "GET", path: "/rest/v1/teams?select=team_code&limit=1" },
  { group: "admin", name: "audit_logs", method: "GET", path: "/rest/v1/audit_logs?select=id&limit=1" },
  { group: "admin", name: "borrow_requests", method: "GET", path: "/rest/v1/borrow_requests?select=id&limit=1" },
  { group: "admin", name: "borrow_request_items", method: "GET", path: "/rest/v1/borrow_request_items?select=id&limit=1" },
  { group: "admin", name: "team_capabilities", method: "GET", path: "/rest/v1/team_capabilities?select=team_code&limit=1" },
  { group: "admin", name: "manikin_capabilities", method: "GET", path: "/rest/v1/manikin_capabilities?select=sap_id&limit=1" },
  {
    group: "admin",
    name: "rpc:admin_approve_request",
    method: "POST",
    path: "/rest/v1/rpc/admin_approve_request",
    body: { p_request_id: "00000000-0000-0000-0000-000000000000" },
  },
  {
    group: "admin",
    name: "rpc:admin_reject_request",
    method: "POST",
    path: "/rest/v1/rpc/admin_reject_request",
    body: { p_request_id: "00000000-0000-0000-0000-000000000000", p_reason: "smoke-test" },
  },
  {
    group: "admin",
    name: "rpc:admin_receive_return",
    method: "POST",
    path: "/rest/v1/rpc/admin_receive_return",
    body: { p_request_id: "00000000-0000-0000-0000-000000000000" },
  },
  {
    group: "admin",
    name: "rpc:sync_manikin_capabilities",
    method: "POST",
    path: "/rest/v1/rpc/sync_manikin_capabilities",
    body: { p_sap_id: "SMOKE", p_cap_ids: [] },
  },
  {
    group: "admin",
    name: "rpc:delete_location_atomic",
    method: "POST",
    path: "/rest/v1/rpc/delete_location_atomic",
    body: { p_location_id: -1 },
  },
];

function formatStatus(s) {
  return s.toString().padStart(3, " ");
}

async function runRequest(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, redirect: "manual", signal: controller.signal });
    const text = await res.text();
    return { ok: true, status: res.status, body: text.slice(0, 200) };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const failures = [];
  const warnings = [];

  console.log(`Smoke Test Start`);
  console.log(`SITE_BASE   = ${SITE_BASE}`);
  console.log(`WORKER_BASE = ${WORKER_BASE}`);
  console.log("");

  console.log("[Pages]");
  for (const p of PAGE_CHECKS) {
    const url = `${SITE_BASE}${p.path}`;
    const result = await runRequest(url, { method: "GET" });

    if (!result.ok) {
      failures.push(`PAGE ${p.name} -> network error: ${result.error}`);
      console.log(`FAIL ${p.name.padEnd(22)} ERR ${result.error}`);
      continue;
    }

    const isFail = result.status === 403 || result.status === 404;
    const marker = isFail ? "FAIL" : "PASS";
    console.log(`${marker} ${p.name.padEnd(22)} ${formatStatus(result.status)} ${p.path}`);
    if (isFail) failures.push(`PAGE ${p.name} -> ${result.status}`);
  }

  console.log("");
  console.log("[API]");
  for (const a of API_CHECKS) {
    const url = `${WORKER_BASE}${a.path}`;
    const headers = { "content-type": "application/json" };
    const body = a.body ? JSON.stringify(a.body) : undefined;
    const result = await runRequest(url, { method: a.method, headers, body });

    if (!result.ok) {
      failures.push(`API ${a.group}/${a.name} -> network error: ${result.error}`);
      console.log(`FAIL ${a.group.padEnd(8)} ${a.name.padEnd(32)} ERR ${result.error}`);
      continue;
    }

    const isFail = result.status === 403 || result.status === 404;
    const marker = isFail ? "FAIL" : "PASS";
    console.log(`${marker} ${a.group.padEnd(8)} ${a.name.padEnd(32)} ${formatStatus(result.status)} ${a.method} ${a.path}`);

    if (isFail) {
      failures.push(`API ${a.group}/${a.name} -> ${result.status}`);
    } else if (result.status >= 500) {
      warnings.push(`API ${a.group}/${a.name} -> ${result.status}`);
    }
  }

  console.log("");
  console.log("Summary");
  console.log(`- 403/404 failures: ${failures.length}`);
  console.log(`- 5xx warnings: ${warnings.length}`);

  if (failures.length) {
    console.log("");
    console.log("Failures");
    for (const f of failures) console.log(`- ${f}`);
  }

  if (warnings.length) {
    console.log("");
    console.log("Warnings");
    for (const w of warnings) console.log(`- ${w}`);
  }

  process.exitCode = failures.length ? 1 : 0;
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
