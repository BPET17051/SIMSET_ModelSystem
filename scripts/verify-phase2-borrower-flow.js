const { read, assertExists, assertNotContains, assertContains } = require('./verify-lib');

assertExists('supabase/current_mvp_release.sql');
assertExists('website/js/auth.js');
assertExists('website/checkout.html');
assertExists('website/js/checkout.js');
assertExists('website/success.html');
assertExists('website/js/success.js');
assertExists('website/history.html');
assertExists('website/js/history.js');

const sql = read('supabase/current_mvp_release.sql');
const worker = read('cloudflare-worker/worker.js');
const authJs = read('website/js/auth.js');
const cartJs = read('website/js/cart.js');
const catalogJs = read('website/js/catalog.js');
const checkoutHtml = read('website/checkout.html');
const checkoutJs = read('website/js/checkout.js');
const successHtml = read('website/success.html');
const successJs = read('website/js/success.js');
const historyHtml = read('website/history.html');
const historyJs = read('website/js/history.js');

function functionBody(sqlText, functionName) {
  const start = sqlText.search(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${functionName}`, 'i'));
  if (start === -1) return '';
  const end = sqlText.indexOf('\n$$;', start);
  return end === -1 ? sqlText.slice(start) : sqlText.slice(start, end + 4);
}

const publicSubmitBody = functionBody(sql, 'submit_public_borrow_request_v2');

assertContains(sql, /CREATE OR REPLACE FUNCTION public\.submit_public_borrow_request_v2/i, 'current MVP SQL');
assertContains(sql, /p_borrower_email text DEFAULT NULL/i, 'current MVP SQL optional borrower email');
assertContains(sql, /CREATE TABLE IF NOT EXISTS public\.identity_claim/i, 'current MVP SQL identity claim table');
assertContains(sql, /CREATE OR REPLACE FUNCTION public\.claim_borrow_request_identity/i, 'current MVP SQL claim RPC');
assertContains(sql, /CREATE OR REPLACE FUNCTION public\.get_my_borrow_requests/i, 'current MVP SQL history RPC');
assertContains(sql, /CREATE OR REPLACE FUNCTION public\.transition_borrow_request_status/i, 'current MVP SQL central transition RPC');
assertContains(sql, /FOR UPDATE/i, 'current MVP SQL inventory lock');
assertContains(sql, /CHECK \(status IN \('pending', 'approved', 'rejected', 'ready', 'borrowed', 'returned', 'inspection', 'completed', 'damaged', 'lost', 'cancelled', 'expired', 'overdue'\)\)/i, 'current MVP SQL lifecycle status check');
assertContains(sql, /GRANT EXECUTE ON FUNCTION public\.submit_public_borrow_request_v2/i, 'current MVP SQL submit grant');
assertContains(sql, /GRANT EXECUTE ON FUNCTION public\.claim_borrow_request_identity/i, 'current MVP SQL claim grant');
assertNotContains(publicSubmitBody, /auth\.uid\(\)|auth\.jwt\(\)|@mahidol\.ac\.th/i, 'current MVP public guest submit should not require login or Mahidol email');

assertContains(worker, /\/rest\/v1\/rpc\/submit_public_borrow_request_v2/, 'cloudflare-worker/worker.js');
assertContains(worker, /\/rest\/v1\/rpc\/get_my_borrow_requests/, 'cloudflare-worker/worker.js');
assertContains(worker, /\/rest\/v1\/rpc\/claim_borrow_request_identity/, 'cloudflare-worker/worker.js');
assertContains(worker, /\/rest\/v1\/rpc\/transition_borrow_request_status/, 'cloudflare-worker/worker.js');
assertContains(worker, /CLIENT_PLACEHOLDER_KEY = 'worker-managed-key'/, 'cloudflare-worker/worker.js');

assertContains(authJs, /\.auth\.getSession/, 'website/js/auth.js');
assertContains(authJs, /\.auth\.signInWithOtp/, 'website/js/auth.js');
assertContains(authJs, /@mahidol\.ac\.th/, 'website/js/auth.js staff/history login domain guard');

assertContains(cartJs, /localStorage/, 'website/js/cart.js');
assertContains(cartJs, /simset\.borrow\.cart\.v2/, 'website/js/cart.js');
assertContains(cartJs, /addItem/, 'website/js/cart.js');
assertContains(cartJs, /removeItem/, 'website/js/cart.js');
assertContains(catalogJs, /data-add-to-cart/, 'website/js/catalog.js');
assertContains(catalogJs, /function borrowerAvailabilityText[\s\S]*return `พร้อมยืม \$\{available\}`;/, 'website/js/catalog.js borrower card omits total stock');
assertNotContains(catalogJs, /รหัสรายการ:|ประเภทอุปกรณ์:|เงื่อนไข:|จากทั้งหมด/, 'website/js/catalog.js borrower card should not show low-value internal details');

assertContains(checkoutHtml, /js\/checkout\.js/, 'website/checkout.html');
assertContains(checkoutJs, /\.rpc\(['"]submit_public_borrow_request_v2['"]/, 'website/js/checkout.js');
assertContains(checkoutJs, /p_borrower_email:\s*email\s*\|\|\s*null/, 'website/js/checkout.js optional borrower email');
assertContains(checkoutJs, /success\.html\?id=/, 'website/js/checkout.js');
assertNotContains(checkoutJs, /\.rpc\(['"]submit_borrow_request['"]/, 'website/js/checkout.js');
assertNotContains(checkoutJs, /getSession\(\)|signInWithOtp|sendMagicLink/, 'website/js/checkout.js guest checkout should not require auth flow');

assertContains(successHtml, /js\/success\.js/, 'website/success.html');
assertContains(successJs, /get_borrow_request_status/, 'website/js/success.js');
assertContains(successJs, /create-qr-code/, 'website/js/success.js');
assertContains(successJs, /window\.print/, 'website/js/success.js');
assertContains(successJs, /history\.html\?claim=/, 'website/js/success.js claim link');

assertContains(historyHtml, /js\/auth\.js/, 'website/history.html');
assertContains(historyHtml, /js\/history\.js/, 'website/history.html');
assertContains(historyJs, /\.rpc\(['"]get_my_borrow_requests['"]/, 'website/js/history.js');
assertContains(historyJs, /\.rpc\(['"]claim_borrow_request_identity['"]/, 'website/js/history.js');
assertContains(historyJs, /sendMagicLink\(email,\s*location\.href\)/, 'website/js/history.js keeps claim URL through login');
assertContains(historyJs, /\.rpc\(['"]transition_borrow_request_status['"]/, 'website/js/history.js');
assertContains(historyJs, /p_next_status:\s*'cancelled'/, 'website/js/history.js');

console.log('Phase 2 borrower flow contract checks passed');
