const { read, assert, assertExists, assertMissing, assertNotContains, assertContains } = require('./verify-lib');

const currentPages = [
  'website/index.html',
  'website/cart.html',
  'website/checkout.html',
  'website/product-details.html',
  'website/track.html',
  'website/staff.html',
  'website/approver.html',
  'website/report.html',
  'website/admin-login.html',
  'website/admin.html',
];

for (const page of currentPages) {
  assertExists(page);
  assertContains(read(page), /<nav[\s\S]*navbar-brand[\s\S]*<\/nav>/, `${page} navigation bar`);
}

const deployWorkflow = read('.github/workflows/deploy-production.yml');
const frontendWorkflow = read('.github/workflows/frontend-smoke.yml');
const smokeTest = read('scripts/smoke-main-pages.js');
const packageJson = JSON.parse(read('package.json'));
const releaseChecklist = read('docs/GITHUB_RELEASE_CHECKLIST.md');
const adminHtml = read('website/admin.html');
const adminJs = read('website/js/admin.js');
const staffJs = read('website/js/staff.js');
const approverJs = read('website/js/approver.js');
const reportJs = read('website/js/report.js');
const staffHtml = read('website/staff.html');
const approverHtml = read('website/approver.html');
const reportHtml = read('website/report.html');
const workerJs = read('cloudflare-worker/worker.js');
const wranglerToml = read('cloudflare-worker/wrangler.toml');
const headers = read('website/_headers');
const supabaseClient = read('website/js/supabase-client.js');
const currentMvpSql = read('supabase/current_mvp_release.sql');
const checkoutHtml = read('website/checkout.html');
const checkoutJs = read('website/js/checkout.js');
const indexHtml = read('website/index.html');
const simsetBorrowCss = read('website/css/simset-borrow.css');
const catalogJs = read('website/js/catalog.js');
const historyJs = read('website/js/history.js');
const successJs = read('website/js/success.js');
const trackJs = read('website/js/track.js');

for (const [label, text] of [
  ['deploy workflow', deployWorkflow],
  ['frontend workflow', frontendWorkflow],
  ['smoke test', smokeTest],
  ['release checklist', releaseChecklist],
]) {
  assertNotContains(text, /website\/app\.js|website\/borrow\.js|website\/js\/tracking\.js|website\/admin\/admin\.js|borrow\.html|tracking\.html|admin\/dashboard\.html|admin\/index\.html/, label);
}

for (const removedScript of ['smoke:admin-selection', 'smoke:keyboard-nav', 'smoke:nav', 'evidence:ui-baseline']) {
  assert(!(removedScript in packageJson.scripts), `package.json still exposes stale script: ${removedScript}`);
}

assertMissing('cloudflare-worker/check_url.txt');
assertMissing('cloudflare-worker/SUPABASE_URL.txt');

assertContains(adminHtml, /id=["']admin-menu["']/, 'website/admin.html menu hub');
assertContains(adminHtml, /href=["']approver\.html["']/, 'website/admin.html approver link');
assertContains(adminHtml, /href=["']staff\.html["']/, 'website/admin.html staff link');
assertNotContains(adminHtml, /data-admin-tab|admin-requests|admin-work-table/, 'website/admin.html legacy workflow UI');
assertNotContains(adminJs, /admin_update_borrow_request_status|data-admin-tab|borrow_requests/, 'website/js/admin.js legacy workflow logic');

assertContains(supabaseClient, /simset-showroom-proxy\.simset-admin\.workers\.dev/, 'website/js/supabase-client.js');
assertContains(supabaseClient, /worker-managed-key/, 'website/js/supabase-client.js');
assertNotContains(supabaseClient, /ifogcvymwhcfbfjzhwsl\.supabase\.co|sb_publishable_/, 'website/js/supabase-client.js');

assertContains(workerJs, /\/rest\/v1\/rpc\/submit_public_borrow_request_v2/, 'cloudflare-worker/worker.js public borrower submit RPC');
assertContains(workerJs, /\/rest\/v1\/rpc\/submit_borrow_request/, 'cloudflare-worker/worker.js authenticated fallback submit RPC');
assertContains(workerJs, /\/rest\/v1\/rpc\/get_my_borrow_requests/, 'cloudflare-worker/worker.js');
assertContains(workerJs, /\/rest\/v1\/rpc\/claim_borrow_request_identity/, 'cloudflare-worker/worker.js');
assertContains(workerJs, /\/rest\/v1\/rpc\/transition_borrow_request_status/, 'cloudflare-worker/worker.js');
assertNotContains(workerJs, /\/rest\/v1\/rpc\/submit_public_borrow_request['"]/, 'cloudflare-worker/worker.js deprecated public submit RPC');
assertContains(workerJs, /\/rest\/v1\/rpc\/admin_update_borrow_request_status/, 'cloudflare-worker/worker.js');
assertContains(workerJs, /\/rest\/v1\/rpc\/approver_l1_decide_request/, 'cloudflare-worker/worker.js');
assertContains(workerJs, /\/rest\/v1\/rpc\/get_l1_approval_queue/, 'cloudflare-worker/worker.js');
assertContains(workerJs, /\/rest\/v1\/rpc\/get_staff_dashboard_orders/, 'cloudflare-worker/worker.js');
assertContains(workerJs, /\/rest\/v1\/rpc\/confirm_pickup_with_snapshot/, 'cloudflare-worker/worker.js');
assertContains(workerJs, /\/rest\/v1\/rpc\/confirm_return_with_snapshot/, 'cloudflare-worker/worker.js');
assertContains(workerJs, /\/rest\/v1\/rpc\/get_kpi_report/, 'cloudflare-worker/worker.js');
assertContains(workerJs, /\/rest\/v1\/rpc\/get_equipment_borrow_rules/, 'cloudflare-worker/worker.js');
assertContains(workerJs, /\/rest\/v1\/rpc\/staff_assign_manikin_to_item/, 'cloudflare-worker/worker.js');
assertContains(workerJs, /\/rest\/v1\/rpc\/staff_assign_inventory_unit_to_item/, 'cloudflare-worker/worker.js');
assertContains(workerJs, /\/rest\/v1\/rpc\/get_rotation_suggestions/, 'cloudflare-worker/worker.js');
assertContains(workerJs, /\/storage\/v1\/object\//, 'cloudflare-worker/worker.js');
assertContains(workerJs, /https:\/\/api\.line\.me\/v2\/bot\/message\/push/, 'cloudflare-worker/worker.js LINE Messaging API');
assertContains(workerJs, /dispatchLineNotifications/, 'cloudflare-worker/worker.js LINE outbox dispatcher');
assertContains(workerJs, /async scheduled\(/, 'cloudflare-worker/worker.js scheduled LINE dispatch');
assertContains(workerJs, /ALLOWED_ORIGINS\.has\(origin\)/, 'cloudflare-worker/worker.js');
assertNotContains(wranglerToml, /SUPABASE_KEY\s*=/, 'cloudflare-worker/wrangler.toml');
assertNotContains(wranglerToml, /ifogcvymwhcfbfjzhwsl\.supabase\.co/, 'cloudflare-worker/wrangler.toml stale Supabase project');
assertContains(wranglerToml, /SUPABASE_URL = "https:\/\/mcdpfsuyjfxmfeiafkyq\.supabase\.co"/, 'cloudflare-worker/wrangler.toml active Supabase project');
assertContains(wranglerToml, /crons\s*=\s*\["\*\/15 \* \* \* \*"\]/, 'cloudflare-worker/wrangler.toml LINE dispatch cron');
assertExists('supabase/current_mvp_release.sql');
assertExists('supabase/fix_borrow_receipt_form_rpc.sql');
assertExists('docs/CURRENT_MVP_SYSTEM.md');
assertExists('docs/RELEASE_SOURCE_SET.md');
assertExists('scripts/verify-live-worker.mjs');

assertContains(headers, /connect-src 'self' https:\/\/simset-showroom-proxy\.[^ ]+\.workers\.dev/, 'website/_headers');
assertNotContains(headers, /connect-src[^;\n]*https:\/\/ifogcvymwhcfbfjzhwsl\.supabase\.co/, 'website/_headers');

assertContains(checkoutJs, /\.rpc\(['"]submit_public_borrow_request_v2['"]/, 'website/js/checkout.js public borrower submit RPC');
assertContains(checkoutJs, /p_borrower_email:\s*email\s*\|\|\s*null/, 'website/js/checkout.js optional borrower email submit');
assertNotContains(checkoutJs, /sendMagicLink|magic_email|getSession\(\)/, 'website/js/checkout.js borrower auth removal');
assertContains(checkoutJs, /\.rpc\(['"]get_equipment_borrow_rules['"]/, 'website/js/checkout.js allocation rules');
assertContains(checkoutJs, /room_dedicated|advance_course_dedicated/, 'website/js/checkout.js allocation warnings');
assertContains(checkoutHtml, /recognition-hint[\s\S]*form-section-title[\s\S]*form-helper/, 'website/checkout.html recognition over recall helpers');
assertContains(checkoutHtml, /id="borrower_email"[\s\S]*type="email"/, 'website/checkout.html optional borrower email field');
assertContains(indexHtml, /recognition-hint[\s\S]*ดูชื่ออุปกรณ์[\s\S]*ดูรายละเอียด/, 'website/index.html catalog recognition helper');
assertContains(indexHtml, /btn btn-brand[\s\S]*btn-brand-badge/, 'website/index.html style guide cart CTA');
assertContains(simsetBorrowCss, /--sb-brand:\s*#0f766e[\s\S]*--sb-brand-dark:\s*#064e3b[\s\S]*--sb-shadow-btn:\s*0 4px 12px rgba\(15,118,110,.35\)/, 'website/css/simset-borrow.css style guide tokens');
assertContains(simsetBorrowCss, /\.hero-borrow\s*{[\s\S]*linear-gradient\(135deg,\s*#0f766e 0%,\s*#064e3b 100%\)/, 'website/css/simset-borrow.css teal hero');
assertContains(simsetBorrowCss, /font-family:\s*"Noto Sans Thai", system-ui, sans-serif/, 'website/css/simset-borrow.css font stack');
assertContains(simsetBorrowCss, /\.btn-brand\s*{[\s\S]*box-shadow:\s*var\(--sb-shadow-btn\)/, 'website/css/simset-borrow.css brand button');
assertContains(catalogJs, /function typeLabel[\s\S]*function borrowerAvailabilityText[\s\S]*function borrowerRestrictionText[\s\S]*equipment-choice-summary/, 'website/js/catalog.js catalog recognition helpers');
assertContains(catalogJs, /<h5 class="fw-bolder equipment-card-title">\$\{esc\(item\.name\)\}<\/h5>\s*<div class="equipment-choice-summary mt-3">/, 'website/js/catalog.js catalog card hides internal UUID');
assertContains(catalogJs, /return `พร้อมยืม \$\{available\}`;/, 'website/js/catalog.js catalog card hides total stock from borrowers');
assertContains(historyJs, /\.rpc\(['"]get_my_borrow_requests['"]/, 'website/js/history.js');
assertContains(historyJs, /\.rpc\(['"]claim_borrow_request_identity['"]/, 'website/js/history.js claim request RPC');
assertContains(historyJs, /sendMagicLink\(email,\s*location\.href\)/, 'website/js/history.js keeps claim URL through login');
assertContains(historyJs, /try\s*{[\s\S]*await claimRequestIfPresent\(\);[\s\S]*}\s*catch \(error\)\s*{[\s\S]*claimErrorMessage\(error\)[\s\S]*}\s*await loadHistory\(\);/, 'website/js/history.js claim failure does not block existing history load');
assertContains(historyJs, /\.rpc\(['"]transition_borrow_request_status['"]/, 'website/js/history.js');
assertContains(successJs, /borrow-form-print/, 'website/js/success.js printable borrow form');
assertContains(successJs, /history\.html\?claim=/, 'website/js/success.js claim link');
assertContains(successJs, /borrower_name/, 'website/js/success.js borrower field');
assertContains(successJs, /asset_code|manikin_sap_id|unit_code/, 'website/js/success.js item code field');
assertContains(trackJs, /history\.html\?claim=/, 'website/js/track.js claim link');
assertContains(staffJs, /\.channel\(['"]staff-borrow-requests['"]\)/, 'website/js/staff.js realtime channel');
assertContains(staffJs, /\.rpc\(['"]get_staff_dashboard_orders['"]/, 'website/js/staff.js staff queue');
assertContains(staffJs, /confirm_pickup_with_snapshot/, 'website/js/staff.js pickup');
assertContains(staffJs, /confirm_return_with_snapshot/, 'website/js/staff.js return');
assertContains(staffJs, /\.rpc\(['"]get_rotation_suggestions['"]/, 'website/js/staff.js rotation suggestions');
assertContains(staffJs, /\.rpc\(['"]staff_assign_manikin_to_item['"]/, 'website/js/staff.js exact manikin assignment');
assertContains(staffJs, /\.rpc\(['"]staff_assign_inventory_unit_to_item['"]/, 'website/js/staff.js exact inventory unit assignment');
assertContains(staffHtml, /attention-summary[\s\S]*staff-focus-prepare/, 'website/staff.html attention summary');
assertContains(staffHtml, /work-fragmentation-note/, 'website/staff.html work fragmentation reminder');
assertContains(staffJs, /work-continuity-cue[\s\S]*Confirm Pickup[\s\S]*Confirm Return/, 'website/js/staff.js next-action cue');
assertContains(approverJs, /\.rpc\(['"]get_l1_approval_queue['"]/, 'website/js/approver.js queue');
assertContains(approverJs, /\.rpc\(['"]approver_l1_decide_request['"]/, 'website/js/approver.js decision');
assertContains(approverHtml, /attention-summary[\s\S]*approval-focus-count/, 'website/approver.html attention summary');
assertContains(approverHtml, /work-fragmentation-note/, 'website/approver.html work fragmentation reminder');
assertContains(approverJs, /work-continuity-cue[\s\S]*Approve[\s\S]*Reject/, 'website/js/approver.js next-action cue');
assertContains(reportJs, /\.rpc\(['"]get_kpi_report['"]/, 'website/js/report.js KPI RPC');
assertContains(reportHtml, /kpi-card is-primary[\s\S]*report-panel-primary/, 'website/report.html dashboard saliency layout');

for (const [pattern, label] of [
  [/CREATE TABLE IF NOT EXISTS public\.borrow_request_status_audit/i, 'borrow status audit table'],
  [/CREATE TABLE IF NOT EXISTS public\.identity_claim/i, 'identity claim table'],
  [/CREATE OR REPLACE FUNCTION public\.transition_borrow_request_status/i, 'central transition RPC'],
  [/CREATE OR REPLACE FUNCTION public\.submit_public_borrow_request_v2/i, 'public borrower submit RPC'],
  [/CREATE OR REPLACE FUNCTION public\.claim_borrow_request_identity/i, 'borrow request identity claim RPC'],
  [/p_borrower_email text DEFAULT NULL/i, 'optional borrower email argument'],
  [/borrower_position/i, 'borrower position field'],
  [/usage_location/i, 'usage location field'],
  [/borrow_purpose_owner/i, 'borrow purpose owner field'],
  [/work_purpose/i, 'work purpose field'],
  [/GRANT EXECUTE ON FUNCTION public\.submit_public_borrow_request_v2/i, 'public borrower submit grant'],
  [/CREATE OR REPLACE FUNCTION public\.submit_borrow_request/i, 'authenticated fallback submit RPC'],
  [/CREATE OR REPLACE FUNCTION public\.get_my_borrow_requests/i, 'borrower history RPC'],
  [/'borrower_name', br\.borrower_name/i, 'tracking payload borrower name'],
  [/'borrower_phone', br\.borrower_phone/i, 'tracking payload borrower phone'],
  [/'unit_code', eu\.unit_code/i, 'tracking payload assigned unit code'],
  [/LEFT JOIN public\.equipment_units eu ON eu\.id = bri\.equipment_unit_id/i, 'tracking payload unit join'],
  [/ALTER TABLE public\.manikins[\s\S]*ADD COLUMN IF NOT EXISTS deleted_at timestamptz/i, 'manikins soft-delete baseline columns'],
  [/manikin_sap_id\s+text\s+REFERENCES\s+public\.manikins\s*\(\s*sap_id\s*\)/i, 'borrow item manikin FK'],
  [/CREATE OR REPLACE FUNCTION simset_private\.sync_manikin_status_from_borrow_request/i, 'manikin status sync function'],
  [/CREATE TRIGGER trg_sync_manikin_status_from_borrow_request/i, 'manikin status sync trigger'],
  [/COMMENT ON FUNCTION public\.submit_public_borrow_request/i, 'deprecated public submit marker'],
  [/approver_l1/i, 'approver_l1 role contract'],
  [/CREATE TABLE IF NOT EXISTS public\.line_notification_outbox/i, 'LINE notification outbox'],
  [/CREATE TABLE IF NOT EXISTS public\.staff_alerts/i, 'staff web alerts table'],
  [/CREATE TABLE IF NOT EXISTS public\.condition_snapshots/i, 'condition snapshots table'],
  [/CREATE OR REPLACE FUNCTION public\.approver_l1_decide_request/i, 'L1 approval RPC'],
  [/CREATE OR REPLACE FUNCTION public\.get_l1_approval_queue/i, 'L1 approval queue RPC'],
  [/CREATE OR REPLACE FUNCTION public\.confirm_pickup_with_snapshot/i, 'snapshot pickup RPC'],
  [/CREATE OR REPLACE FUNCTION public\.confirm_return_with_snapshot/i, 'snapshot return RPC'],
  [/returned'[\s\S]*'inspection'[\s\S]*v_final_status/i, 'post-return inspection lifecycle'],
  [/p_condition_status = 'normal' THEN 'completed'[\s\S]*p_condition_status IN \('damaged', 'maintenance'\) THEN 'damaged'[\s\S]*p_condition_status = 'missing' THEN 'lost'/i, 'return condition to terminal status mapping'],
  [/CREATE OR REPLACE FUNCTION public\.mark_overdue_borrow_requests/i, 'overdue cron RPC'],
  [/CREATE OR REPLACE FUNCTION public\.expire_pending_borrow_requests/i, 'pending expiration cron RPC'],
  [/simset-expire-pending-borrow-requests/i, 'pending expiration cron schedule'],
  [/CREATE OR REPLACE FUNCTION public\.get_staff_dashboard_orders/i, 'staff dashboard RPC'],
  [/CREATE OR REPLACE FUNCTION public\.get_kpi_report/i, 'KPI report RPC'],
  [/ADD COLUMN IF NOT EXISTS allocation_type text/i, 'equipment allocation type column'],
  [/CHECK \(allocation_type IN \('rotating', 'room_dedicated', 'advance_course_dedicated'\)\)/i, 'allocation type check'],
  [/CREATE TABLE IF NOT EXISTS public\.courses/i, 'courses table'],
  [/CREATE TABLE IF NOT EXISTS public\.course_reserved_manikins/i, 'course manikin reservations table'],
  [/CREATE TABLE IF NOT EXISTS public\.manikin_allocation_type_audit/i, 'allocation type audit fallback table'],
  [/CREATE OR REPLACE FUNCTION public\.get_equipment_borrow_rules/i, 'borrow allocation rules RPC'],
  [/CREATE OR REPLACE FUNCTION public\.staff_assign_manikin_to_item/i, 'staff exact manikin assignment RPC'],
  [/ADD COLUMN IF NOT EXISTS inventory_mode text/i, 'equipment inventory mode column'],
  [/CHECK \(inventory_mode IN \('manikin', 'tracked_unit', 'kit', 'quantity_only'\)\)/i, 'inventory mode check'],
  [/CREATE TABLE IF NOT EXISTS public\.equipment_units/i, 'equipment units table'],
  [/CREATE TABLE IF NOT EXISTS public\.kit_refill_tasks/i, 'kit refill tasks table'],
  [/equipment_unit_id\s+uuid\s+REFERENCES\s+public\.equipment_units\s*\(\s*id\s*\)/i, 'borrow item equipment unit FK'],
  [/CREATE OR REPLACE FUNCTION public\.staff_assign_inventory_unit_to_item/i, 'staff exact inventory unit assignment RPC'],
  [/return_blocking/i, 'return blocking item flag'],
  [/kit_refill_tasks[\s\S]*condition_snapshots/i, 'kit refill task from return snapshot'],
  [/CREATE OR REPLACE FUNCTION public\.get_rotation_suggestions/i, 'rotation suggestions RPC'],
  [/room_dedicated_review/i, 'room dedicated special review alert'],
  [/ALTER PUBLICATION supabase_realtime ADD TABLE public\.borrow_requests/i, 'borrow requests realtime publication'],
  [/CHECK \(actor_type IN \('admin', 'staff', 'approver_l1', 'borrower', 'system'\)\)/i, 'staff actor type audit check'],
  [/CHECK \(status IN \('pending', 'approved', 'rejected', 'ready', 'borrowed', 'returned', 'inspection', 'completed', 'damaged', 'lost', 'cancelled', 'expired', 'overdue'\)\)/i, 'borrow request lifecycle status check'],
]) {
  assertContains(currentMvpSql, pattern, `supabase/current_mvp_release.sql ${label}`);
}

console.log('Current MVP contract checks passed');
