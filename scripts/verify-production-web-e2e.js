const { chromium } = require('playwright');

const baseUrl = (process.env.SIMSET_SITE_URL || 'https://simset-showroom.pages.dev').replace(/\/+$/, '');

const result = {
  baseUrl,
  trackingId: null,
  checks: [],
  debug: {},
  consoleErrors: [],
  failedResponses: [],
};

function check(name, ok, detail = '') {
  result.checks.push({ name, ok, detail });
  if (!ok) {
    throw new Error(`${name}: ${detail}`);
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  page.setDefaultTimeout(20000);

  page.on('console', (msg) => {
    if (msg.type() === 'error') result.consoleErrors.push(msg.text());
  });

  page.on('response', async (response) => {
    if (response.status() < 400) return;
    if (response.url().includes('bootstrap.bundle.min.js.map')) return;
    let body = '';
    try {
      body = await response.text();
    } catch (error) {
      body = `Could not read response body: ${error.message}`;
    }
    result.failedResponses.push({
      status: response.status(),
      url: response.url(),
      body: body.slice(0, 2000),
    });
  });

  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#equipment-grid .equipment-card', { timeout: 30000 });

  const cardCount = await page.locator('#equipment-grid .equipment-card').count();
  check('catalog renders equipment cards', cardCount > 0, `cards=${cardCount}`);

  const uuidTextCount = await page
    .locator('.equipment-card >> text=/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i')
    .count();
  check('catalog does not expose internal UUID text', uuidTextCount === 0, `uuidTextCount=${uuidTextCount}`);

  await page.locator('[data-add-to-cart]:not([disabled])').first().click();
  await page.waitForFunction(() => Number(document.querySelector('[data-cart-count]')?.textContent || 0) > 0);

  await page.goto(`${baseUrl}/cart.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('[data-cart-qty]', { timeout: 20000 });
  check('cart renders selected item quantity control', await page.locator('[data-cart-qty]').count() > 0);

  await page.goto(`${baseUrl}/checkout.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#checkout-form:not(.d-none)', { timeout: 20000 });

  const now = new Date();
  // ponytail: use far-future dates to avoid colliding with real reservations
  const startDate = new Date(now.getTime() + 90 * 86400000).toISOString().slice(0, 10);
  const endDate = new Date(now.getTime() + 91 * 86400000).toISOString().slice(0, 10);

  await page.fill('#borrower_name', 'E2E Codex Test');
  await page.fill('#borrower_position', 'QA');
  await page.fill('#department', 'SIMSET E2E');
  await page.fill('#phone', '0800000000');
  await page.fill('#borrower_email', 'codex-e2e@example.com');
  await page.fill('#start_date', startDate);
  await page.fill('#end_date', endDate);
  await page.fill('#borrow_purpose_owner', 'SIMSET E2E');
  await page.fill('#work_purpose', 'Production smoke test by Codex');
  await page.fill('#usage_location', 'SIMSET test location');

  result.debug.cartBeforeSubmit = await page.evaluate(() => ({
    localStorageCart: localStorage.getItem('simset.borrow.cart.v2'),
    normalizedItems: window.SimsetBorrow?.cart?.getItems?.() || null,
    cartCount: window.SimsetBorrow?.cart?.count?.() || 0,
    checkoutItemsText: document.querySelector('#checkout-items')?.innerText || '',
  }));

  await Promise.all([
    page.waitForURL(/\/success(?:\.html)?\?id=SIM-/, { timeout: 60000 }),
    page.locator('#checkout-form button[type="submit"]').click(),
  ]);

  result.trackingId = new URL(page.url()).searchParams.get('id');
  check('checkout submits and returns tracking id', /^SIM-/.test(result.trackingId || ''), result.trackingId || 'missing');

  await page.goto(`${baseUrl}/track.html?id=${encodeURIComponent(result.trackingId)}`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await page.waitForFunction((trackingId) => document.body.innerText.includes(trackingId), result.trackingId, {
    timeout: 30000,
  });
  check('tracking page displays submitted request', true, result.trackingId);

  await page.goto(`${baseUrl}/staff.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const staffText = await page.locator('body').innerText();
  check(
    'staff page is guarded or loads dashboard',
    staffText.includes('Staff Dashboard') || staffText.includes('Signed in:') || staffText.includes('ต้องเข้าสู่ระบบ'),
    staffText.slice(0, 120),
  );

  await page.goto(`${baseUrl}/approver.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const approverText = await page.locator('body').innerText();
  check(
    'approver page is guarded or loads queue',
    approverText.includes('L1 Approval Queue') || approverText.includes('Signed in:') || approverText.includes('ต้องเข้าสู่ระบบ'),
    approverText.slice(0, 120),
  );

  check('no unexpected HTTP failures', result.failedResponses.length === 0, JSON.stringify(result.failedResponses));
  check('no browser console errors', result.consoleErrors.length === 0, JSON.stringify(result.consoleErrors));

  await browser.close();
  console.log(JSON.stringify({ ...result, ok: true }, null, 2));
}

main().catch((error) => {
  console.log(JSON.stringify({ ...result, ok: false, error: error.message }, null, 2));
  process.exit(1);
});
