// Focused, read-only Catalog checks. Uses the already-installed Playwright package
// and Node's built-in static server; cart changes stay in an isolated browser context.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, 'website');
const mime = {
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp'
};

const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400).end('Bad request'); return; }
  const filename = path.resolve(root, `.${pathname}`);
  if (filename !== root && !filename.startsWith(root + path.sep)) {
    res.writeHead(403).end('Forbidden'); return;
  }
  fs.stat(filename, (statError, stat) => {
    const target = !statError && stat.isDirectory() ? path.join(filename, 'index.html') : filename;
    fs.readFile(target, (error, data) => {
      if (error) { res.writeHead(404).end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream' });
      res.end(data);
    });
  });
});

async function runViewport(browser, name, width, height, reducedMotion) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    window.__animeCalls = 0;
    const timer = setInterval(() => {
      const animeApi = window.anime;
      if (!animeApi || typeof animeApi.animate !== 'function' || animeApi.__simsetTestWrapped) return;
      const animate = animeApi.animate;
      animeApi.animate = function (...args) { window.__animeCalls++; return animate.apply(this, args); };
      animeApi.__simsetTestWrapped = true;
      clearInterval(timer);
    }, 0);
  });
  await page.goto('http://localhost:8788/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('#equipment-grid .equipment-card').length > 0, null, { timeout: 30000 });
  await page.waitForTimeout(550);

  assert.equal(await page.evaluate(() => typeof window.anime?.animate), 'function', 'Anime.js v4 loaded');
  await page.evaluate(() => { window.__animeCalls = 0; });

  const search = page.locator('#catalog-search');
  for (const query of ['RA', 'QCPR', 'ALS', 'BLS', '']) {
    await search.fill(query);
    await page.waitForTimeout(70);
  }
  const category = page.locator('#catalog-filter [data-type]:not([data-type="all"])').first();
  if (await category.count()) {
    await category.click();
    await page.waitForTimeout(80);
    await page.locator('#catalog-filter [data-type="all"]').click();
  }
  await page.waitForTimeout(650);

  const metrics = await page.evaluate(() => ({
    cards: document.querySelectorAll('#equipment-grid .equipment-card').length,
    animationCalls: window.__animeCalls,
    invisibleCards: [...document.querySelectorAll('#equipment-grid .equipment-card')]
      .filter((card) => Number(getComputedStyle(card).opacity) < 0.99).length,
    overflow: document.documentElement.scrollWidth > innerWidth,
    animeLoaded: typeof window.anime?.animate === 'function'
  }));
  assert.ok(metrics.cards > 0, 'Catalog still has cards after rapid searches and filter changes');
  if (reducedMotion === 'reduce') {
    assert.equal(metrics.animationCalls, 0, 'Reduced motion suppresses catalog animation');
  } else {
    assert.ok(metrics.animationCalls > 0, 'Catalog re-render invokes the motion animation');
  }
  assert.equal(metrics.invisibleCards, 0, 'No card remains transparent after the transition');
  assert.equal(metrics.overflow, false, 'No horizontal page overflow at this viewport');

  const add = page.locator('#equipment-grid [data-add-to-cart]:not([disabled])').first();
  assert.ok(await add.count(), 'At least one available item can be added');
  await add.click();
  assert.equal(await page.locator('[data-cart-count]').first().innerText(), '1', 'Local cart badge increments');
  const catalogShot = path.join(os.tmpdir(), `simset-catalog-${name}.png`);
  await page.screenshot({ path: catalogShot, fullPage: true });
  if (reducedMotion === 'reduce') {
    assert.equal(await page.locator('.cart-fly-image').count(), 0, 'Reduced motion suppresses fly-to-cart');
    await page.waitForTimeout(1250);
  } else {
    assert.equal(await page.locator('.cart-fly-image').count(), 1, 'Add-to-cart shows fly-to-cart feedback');
    await page.waitForTimeout(800);
    assert.equal(await page.locator('.cart-fly-image').count(), 0, 'Fly-to-cart clone is removed');
    await page.waitForTimeout(450);
  }
  assert.equal(await add.isDisabled(), false, 'Add button recovers after its temporary feedback');

  const detail = page.locator('#equipment-grid a[href^="product-details.html?"]').first();
  await detail.click();
  await page.waitForURL(/product-details\.html\?/);
  await page.waitForFunction(() => document.querySelector('#equipment-detail h1'));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Product Detail fits viewport');
  const detailShot = path.join(os.tmpdir(), `simset-detail-${name}.png`);
  await page.screenshot({ path: detailShot, fullPage: true });

  assert.deepEqual(pageErrors, [], `No uncaught page errors (${name})`);
  console.log(`${name}: PASS ${JSON.stringify(metrics)} screenshots=${catalogShot},${detailShot}`);
  await context.close();
}

async function main() {
  await new Promise((resolve, reject) => server.listen(8788, '127.0.0.1', (error) => error ? reject(error) : resolve()));
  const browser = await chromium.launch({ headless: true });
  try {
    await runViewport(browser, 'desktop', 1440, 1000, 'no-preference');
    await runViewport(browser, 'mobile', 390, 844, 'reduce');
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
