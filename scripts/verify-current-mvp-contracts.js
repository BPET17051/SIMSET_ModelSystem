const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertExists(relativePath) {
  assert(fs.existsSync(path.join(ROOT, relativePath)), `Expected file to exist: ${relativePath}`);
}

function assertMissing(relativePath) {
  assert(!fs.existsSync(path.join(ROOT, relativePath)), `Expected generated/secret-like file to be absent: ${relativePath}`);
}

function assertNotContains(text, pattern, label) {
  assert(!pattern.test(text), `${label} still contains ${pattern}`);
}

function assertContains(text, pattern, label) {
  assert(pattern.test(text), `${label} is missing ${pattern}`);
}

const currentPages = [
  'website/index.html',
  'website/cart.html',
  'website/checkout.html',
  'website/product-details.html',
  'website/track.html',
  'website/admin-login.html',
  'website/admin.html',
];

for (const page of currentPages) {
  assertExists(page);
}

const deployWorkflow = read('.github/workflows/deploy-production.yml');
const frontendWorkflow = read('.github/workflows/frontend-smoke.yml');
const smokeTest = read('scripts/smoke-main-pages.js');
const packageJson = JSON.parse(read('package.json'));
const releaseChecklist = read('docs/GITHUB_RELEASE_CHECKLIST.md');
const adminJs = read('website/js/admin.js');
const catalogJs = read('website/js/catalog.js');
const checkoutHtml = read('website/checkout.html');
const checkoutJs = read('website/js/checkout.js');
const trackJs = read('website/js/track.js');
const workerJs = read('cloudflare-worker/worker.js');
const wranglerToml = read('cloudflare-worker/wrangler.toml');
const headers = read('website/_headers');
const supabaseClient = read('website/js/supabase-client.js');
const currentMvpSql = read('supabase/current_mvp_release.sql');
const rpcFunctionsSql = read('supabase/rpc_functions.sql');

for (const [label, text] of [
  ['deploy workflow', deployWorkflow],
  ['frontend workflow', frontendWorkflow],
  ['smoke test', smokeTest],
  ['release checklist', releaseChecklist],
]) {
  assertNotContains(text, /website\/app\.js|website\/borrow\.js|website\/js\/tracking\.js|website\/admin\/admin\.js|borrow\.html|tracking\.html|history\.html|success\.html|admin\/dashboard\.html|admin\/index\.html/, label);
}

for (const removedScript of ['smoke:admin-selection', 'smoke:keyboard-nav', 'smoke:nav', 'evidence:ui-baseline']) {
  assert(!(removedScript in packageJson.scripts), `package.json still exposes stale script: ${removedScript}`);
}

assertMissing('cloudflare-worker/check_url.txt');
assertMissing('cloudflare-worker/SUPABASE_URL.txt');

assertContains(adminJs, /\.rpc\(['"]admin_update_borrow_request_status['"]/, 'website/js/admin.js');
assertContains(adminJs, /\.rpc\(['"]admin_cancel_request['"]/, 'website/js/admin.js');
assertContains(adminJs, /data-cancel-admin-request/, 'website/js/admin.js');
assertContains(adminJs, /\.rpc\(['"]get_admin_kpis['"]/, 'website/js/admin.js');
assertNotContains(adminJs, /\.from\(['"]borrow_requests['"]\)[\s\S]{0,400}\.update\(/, 'website/js/admin.js');
assertNotContains(adminJs, /\.from\(['"]borrow_requests['"]\)[\s\S]{0,400}\.select\(['"]id,status,created_at['"]/, 'website/js/admin.js');
assertContains(checkoutHtml, /id="borrower_email"[^>]*required/, 'website/checkout.html');
assertContains(checkoutJs, /borrowerEmail[\s\S]*กรุณากรอกอีเมล/, 'website/js/checkout.js');
assertContains(checkoutJs, /phone[\s\S]*กรุณากรอกเบอร์โทร/, 'website/js/checkout.js');
assertNotContains(trackJs, /request\.purpose/, 'website/js/track.js');
assertContains(trackJs, /cancel_borrow_request_public/, 'website/js/track.js');
assertContains(trackJs, /data-cancel-request/, 'website/js/track.js');
assertContains(catalogJs, /ตรวจช่วงวันที่ตอนส่งคำขอ/, 'website/js/catalog.js');
assertNotContains(catalogJs, /พร้อมให้ยืม \$\{/, 'website/js/catalog.js');

assertContains(supabaseClient, /simset-showroom-proxy\.simset-admin\.workers\.dev/, 'website/js/supabase-client.js');
assertContains(supabaseClient, /worker-managed-key/, 'website/js/supabase-client.js');
assertNotContains(supabaseClient, /ifogcvymwhcfbfjzhwsl\.supabase\.co|sb_publishable_/, 'website/js/supabase-client.js');

assertContains(workerJs, /\/rest\/v1\/rpc\/submit_public_borrow_request/, 'cloudflare-worker/worker.js');
assertContains(workerJs, /\/rest\/v1\/rpc\/get_admin_kpis/, 'cloudflare-worker/worker.js');
assertContains(workerJs, /\/rest\/v1\/rpc\/cancel_borrow_request_public/, 'cloudflare-worker/worker.js');
assertContains(workerJs, /\/rest\/v1\/rpc\/admin_cancel_request/, 'cloudflare-worker/worker.js');
assertContains(workerJs, /\/rest\/v1\/rpc\/admin_update_borrow_request_status/, 'cloudflare-worker/worker.js');
assertContains(workerJs, /ALLOWED_ORIGINS\.has\(origin\)/, 'cloudflare-worker/worker.js');
assertNotContains(wranglerToml, /SUPABASE_KEY\s*=/, 'cloudflare-worker/wrangler.toml');
assertExists('supabase/current_mvp_release.sql');
assertExists('docs/CURRENT_MVP_SYSTEM.md');
assertExists('docs/RELEASE_SOURCE_SET.md');
assertExists('scripts/verify-live-worker.mjs');

const trackingFunction = currentMvpSql.match(/CREATE OR REPLACE FUNCTION public\.get_borrow_request_status[\s\S]*?REVOKE ALL ON FUNCTION public\.get_borrow_request_status/);
assert(trackingFunction, 'supabase/current_mvp_release.sql is missing get_borrow_request_status function body');
assertNotContains(trackingFunction[0], /'purpose'\s*,\s*br\.purpose|br\.purpose/, 'get_borrow_request_status');

const trackingIdFunction = currentMvpSql.match(/CREATE OR REPLACE FUNCTION public\.generate_secure_tracking_id[\s\S]*?REVOKE ALL ON FUNCTION public\.generate_secure_tracking_id/);
assert(trackingIdFunction, 'supabase/current_mvp_release.sql is missing generate_secure_tracking_id function body');
assertContains(trackingIdFunction[0], /gen_random_bytes\(16\)/, 'generate_secure_tracking_id');

const submitFunction = currentMvpSql.match(/CREATE OR REPLACE FUNCTION public\.submit_public_borrow_request[\s\S]*?REVOKE ALL ON FUNCTION public\.submit_public_borrow_request/);
assert(submitFunction, 'supabase/current_mvp_release.sql is missing submit_public_borrow_request function body');
assertContains(submitFunction[0], /Borrower email is required/, 'submit_public_borrow_request');
assertContains(submitFunction[0], /Too many pending requests for this email/, 'submit_public_borrow_request');
assertContains(currentMvpSql, /CREATE OR REPLACE FUNCTION public\.get_admin_kpis/, 'supabase/current_mvp_release.sql');
assertContains(currentMvpSql, /avg_lead_time_days/, 'get_admin_kpis');
assertContains(currentMvpSql, /CREATE OR REPLACE FUNCTION public\.cancel_borrow_request_public/, 'supabase/current_mvp_release.sql');
assertContains(currentMvpSql, /GRANT EXECUTE ON FUNCTION public\.cancel_borrow_request_public\(text, text\) TO anon, authenticated/, 'cancel_borrow_request_public');
assertContains(currentMvpSql, /CREATE OR REPLACE FUNCTION public\.admin_cancel_request/, 'supabase/current_mvp_release.sql');
const adminUpdateFunction = currentMvpSql.match(/CREATE OR REPLACE FUNCTION public\.admin_update_borrow_request_status[\s\S]*?REVOKE ALL ON FUNCTION public\.admin_update_borrow_request_status/);
assert(adminUpdateFunction, 'supabase/current_mvp_release.sql is missing admin_update_borrow_request_status function body');
assertNotContains(adminUpdateFunction[0], /WHEN 'pending' THEN 'approved'/, 'admin_update_borrow_request_status');
assertNotContains(rpcFunctionsSql, /WHEN 'pending' THEN 'approved'/, 'supabase/rpc_functions.sql');
assertContains(currentMvpSql, /'pending_all'/, 'get_admin_kpis');
assertNotContains(currentMvpSql, /'pending_today'/, 'get_admin_kpis');
assertContains(smokeTest, /\[data-admin-tab="pending"\]/, 'scripts/smoke-main-pages.js');
assertContains(smokeTest, /admin_approve_request/, 'scripts/smoke-main-pages.js');
assertContains(smokeTest, /admin_reject_request/, 'scripts/smoke-main-pages.js');
assertContains(smokeTest, /admin_cancel_request/, 'scripts/smoke-main-pages.js');

assertContains(headers, /connect-src 'self' https:\/\/simset-showroom-proxy\.[^ ]+\.workers\.dev/, 'website/_headers');
assertNotContains(headers, /connect-src[^;\n]*https:\/\/ifogcvymwhcfbfjzhwsl\.supabase\.co/, 'website/_headers');

console.log('Current MVP contract checks passed');
