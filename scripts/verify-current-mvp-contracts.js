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
const workerJs = read('cloudflare-worker/worker.js');
const wranglerToml = read('cloudflare-worker/wrangler.toml');
const headers = read('website/_headers');
const supabaseClient = read('website/js/supabase-client.js');

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
assertNotContains(adminJs, /\.from\(['"]borrow_requests['"]\)[\s\S]{0,400}\.update\(/, 'website/js/admin.js');

assertContains(supabaseClient, /simset-showroom-proxy\.simset-admin\.workers\.dev/, 'website/js/supabase-client.js');
assertContains(supabaseClient, /worker-managed-key/, 'website/js/supabase-client.js');
assertNotContains(supabaseClient, /ifogcvymwhcfbfjzhwsl\.supabase\.co|sb_publishable_/, 'website/js/supabase-client.js');

assertContains(workerJs, /\/rest\/v1\/rpc\/submit_public_borrow_request/, 'cloudflare-worker/worker.js');
assertContains(workerJs, /\/rest\/v1\/rpc\/admin_update_borrow_request_status/, 'cloudflare-worker/worker.js');
assertContains(workerJs, /ALLOWED_ORIGINS\.has\(origin\)/, 'cloudflare-worker/worker.js');
assertNotContains(wranglerToml, /SUPABASE_KEY\s*=/, 'cloudflare-worker/wrangler.toml');
assertExists('supabase/current_mvp_release.sql');
assertExists('docs/CURRENT_MVP_SYSTEM.md');
assertExists('docs/RELEASE_SOURCE_SET.md');
assertExists('scripts/verify-live-worker.mjs');

assertContains(headers, /connect-src 'self' https:\/\/simset-showroom-proxy\.[^ ]+\.workers\.dev/, 'website/_headers');
assertNotContains(headers, /connect-src[^;\n]*https:\/\/ifogcvymwhcfbfjzhwsl\.supabase\.co/, 'website/_headers');

console.log('Current MVP contract checks passed');
