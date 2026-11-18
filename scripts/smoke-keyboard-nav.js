const path = require('path');
const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const WEB_ROOT = path.join(ROOT, 'website');
const PORT = Number(process.env.SMOKE_PORT || 4179);
const HOST = '127.0.0.1';
const BASE = `http://${HOST}:${PORT}/`;

const TEXT_EXTENSIONS = new Set([
  '.html',
  '.css',
  '.js',
  '.json',
  '.txt',
  '.svg',
  '.map',
  '.xml',
  '.webmanifest',
]);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

function getMimeType(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

async function serveFile(filePath, response) {
  const ext = path.extname(filePath).toLowerCase();
  response.writeHead(200, { 'Content-Type': getMimeType(filePath), 'Cache-Control': 'no-store' });
  if (TEXT_EXTENSIONS.has(ext)) {
    response.end(await fsp.readFile(filePath, 'utf8'));
    return;
  }
  fs.createReadStream(filePath).pipe(response);
}

function createServer() {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, BASE);
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === '/') pathname = '/index.html';

      const resolved = path.resolve(WEB_ROOT, `.${pathname}`);
      if (!resolved.startsWith(WEB_ROOT)) {
        response.writeHead(403);
        response.end('Forbidden');
        return;
      }

      const stat = await fsp.stat(resolved).catch(() => null);
      if (!stat) {
        response.writeHead(404);
        response.end('Not Found');
        return;
      }

      if (stat.isDirectory()) {
        await serveFile(path.join(resolved, 'index.html'), response);
        return;
      }

      await serveFile(resolved, response);
    } catch (error) {
      response.writeHead(500);
      response.end(`Server error: ${error.message}`);
    }
  });
}

function keyboardMock() {
  const rows = Array.from({ length: 4 }, (_, index) => ({
    id: `kb-req-${index + 1}`,
    tracking_id: `SIM-KB-${String(index + 1).padStart(4, '0')}`,
    created_at: `2026-04-${String(index + 10).padStart(2, '0')}T08:00:00Z`,
    purpose: `Keyboard smoke request ${index + 1}`,
    status: 'pending',
    borrower_id: 'test-borrower-001',
    borrower_email: 'example@gmail.com',
    borrower_name: `Borrower ${index + 1}`,
    borrow_request_items: [{
      id: `kb-item-${index + 1}`,
      equipment_id: `eq-${index + 1}`,
      equipment_name: `Equipment ${index + 1}`,
      qty_borrowed: 1,
      start_date: '2026-04-25',
      end_date: '2026-04-26',
    }],
  }));

  return `
    window.localStorage.setItem('simset_test_mode', '1');
    window.localStorage.setItem('simset_test_admin_logged_in', '1');
    window.localStorage.setItem('simset_test_requests', JSON.stringify(${JSON.stringify(rows)}));

    const mockSupabase = {
      createClient() {
        const adminSession = { user: { id: 'admin-1', email: 'admin@example.com', app_metadata: { role: 'admin' } } };
        function query(result, countValue) {
          return {
            _single: false,
            select() { return this; },
            eq() { return this; },
            gt() { return this; },
            in() { return this; },
            ilike() { return this; },
            not() { return this; },
            is() { return this; },
            order() { return this; },
            range() { return this; },
            limit() { return this; },
            update() { return Promise.resolve({ data: null, error: null }); },
            insert() { return Promise.resolve({ data: null, error: null }); },
            upsert() { return Promise.resolve({ data: null, error: null }); },
            delete() { return Promise.resolve({ data: null, error: null }); },
            single() { this._single = true; return this; },
            then(resolve) {
              const payload = this._single ? (Array.isArray(result) ? (result[0] || null) : result) : result;
              resolve({ data: payload, error: null, count: countValue ?? (Array.isArray(result) ? result.length : (result ? 1 : 0)) });
            }
          };
        }
        return {
          auth: {
            async getSession() { return { data: { session: adminSession } }; },
            onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
            async signOut() { return { error: null }; }
          },
          from() { return query([]); },
          async rpc() { return { data: null, error: null }; }
        };
      }
    };
    Object.defineProperty(window, 'supabase', { configurable: true, get() { return mockSupabase; }, set() {} });
  `;
}

async function tabUntil(page, expectedId, limit = 40) {
  for (let index = 0; index < limit; index += 1) {
    await page.keyboard.press('Tab');
    const activeId = await page.evaluate(() => document.activeElement?.id || '');
    if (activeId === expectedId) return;
  }
  throw new Error(`Unable to focus #${expectedId} via Tab within ${limit} steps`);
}

async function assertFocusVisible(page, selector) {
  const result = await page.$eval(selector, (node) => {
    const style = window.getComputedStyle(node);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      borderColor: style.borderColor,
      boxShadow: style.boxShadow,
      active: document.activeElement === node,
    };
  });
  if (!result.active) throw new Error(`${selector} is not the active element`);
  const hasOutline = result.outlineStyle !== 'none' && parseFloat(result.outlineWidth || '0') > 0;
  const hasFocusShadow = result.boxShadow && result.boxShadow !== 'none';
  if (!hasOutline && !hasFocusShadow) {
    throw new Error(`${selector} does not show focus-visible styling`);
  }
}

async function tabUntilOneOf(page, expectedIds, limit = 20) {
  for (let index = 0; index < limit; index += 1) {
    await page.keyboard.press('Tab');
    const activeId = await page.evaluate(() => document.activeElement?.id || '');
    if (expectedIds.includes(activeId)) return activeId;
  }
  throw new Error(`Unable to focus one of [${expectedIds.join(', ')}] via Tab within ${limit} steps`);
}

async function main() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, HOST, resolve);
  });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const issues = [];

  page.on('pageerror', (error) => issues.push(`[pageerror] ${error.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') issues.push(`[console] ${msg.text()}`);
  });

  try {
    await page.addInitScript(keyboardMock());

    await page.goto(new URL('borrow.html', BASE).toString(), {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await tabUntil(page, 'flow-primary-cta');
    await assertFocusVisible(page, '#flow-primary-cta');

    await page.goto(new URL('admin/dashboard.html', BASE).toString(), {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForSelector('.sidebar-link[data-tab="borrow-requests"]', { timeout: 15000 });
    await page.evaluate(() => switchTab('borrow-requests'));
    await page.waitForSelector('#tab-borrow-requests.active', { timeout: 15000 });

    await tabUntil(page, 'borrow-search', 80);
    await assertFocusVisible(page, '#borrow-search');

    await tabUntil(page, 'borrow-status-filter', 12);
    await assertFocusVisible(page, '#borrow-status-filter');
  } catch (error) {
    issues.push(`[exception] ${error.message}`);
  } finally {
    await page.close();
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }

  if (issues.length > 0) {
    console.log('FAIL: Keyboard navigation semantics');
    issues.forEach((issue) => console.log(`  ${issue}`));
    process.exit(1);
  }

  console.log('PASS: Keyboard navigation semantics');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
