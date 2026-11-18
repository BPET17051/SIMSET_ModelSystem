const path = require('path');
const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const WEB_ROOT = path.join(ROOT, 'website');
const PORT = Number(process.env.SMOKE_PORT || 4178);
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

function adminSelectionMock() {
  const rows = Array.from({ length: 12 }, (_, index) => ({
    id: `ts-req-${String(index + 1).padStart(4, '0')}`,
    tracking_id: `SIM-SEL-${String(index + 1).padStart(4, '0')}`,
    created_at: `2026-04-${String((index % 9) + 10).padStart(2, '0')}T08:00:00Z`,
    purpose: `Selection smoke request ${index + 1}`,
    status: 'pending',
    borrower_id: 'test-borrower-001',
    borrower_email: 'example@gmail.com',
    borrower_name: `Borrower ${index + 1}`,
    borrow_request_items: [{
      id: `item-${index + 1}`,
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
        const adminSession = {
          user: { id: 'admin-1', email: 'admin@example.com', app_metadata: { role: 'admin' } }
        };
        const manikins = [
          { sap_id: 'SAP-001', asset_name: 'Adult CPR Manikin', asset_code: 'A-001', status: 'ready', note: '', is_active: true, needs_review: false, location_id: 1 }
        ];

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
          from(table) {
            if (table === 'manikins') return query(manikins, manikins.length);
            if (table === 'locations') return query([{ id: 1, building: 'SiMSET Building', room_name: 'Lab A' }]);
            if (table === 'borrow_requests') return query([]);
            return query([]);
          },
          async rpc() { return { data: null, error: null }; }
        };
      }
    };

    Object.defineProperty(window, 'supabase', {
      configurable: true,
      get() { return mockSupabase; },
      set() {}
    });
  `;
}

async function readBorrowUiState(page) {
  return page.evaluate(() => ({
    bulkCount: document.getElementById('borrow-bulk-count')?.textContent?.trim() || '',
    bulkBadgeClass: document.getElementById('borrow-bulk-scope-badge')?.className || '',
    bulkActionVisible: !document.getElementById('btn-borrow-select-all-results')?.hidden,
    bulkActionText: document.getElementById('btn-borrow-select-all-results')?.textContent?.trim() || '',
    bulkMeta: document.getElementById('borrow-bulk-meta')?.textContent?.trim() || '',
    warningVisible: (() => {
      const el = document.getElementById('borrow-selection-warning');
      return !!el && getComputedStyle(el).display !== 'none';
    })(),
    warningText: document.getElementById('borrow-selection-warning')?.textContent?.trim() || '',
    presetOptions: [...(document.getElementById('borrow-saved-filters')?.options || [])].map((option) => option.value),
    defaultPreset: window.localStorage.getItem('simset_borrow_filter_default_v1:example@gmail.com') || '',
    headers: [...document.querySelectorAll('#borrow-thead th[data-borrow-col]')].map((cell) => cell.dataset.borrowCol),
    frozenHeaders: [...document.querySelectorAll('#borrow-thead th.is-frozen-col[data-borrow-col]')].map((cell) => cell.dataset.borrowCol)
  }));
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

  page.on('pageerror', (error) => {
    issues.push(`[pageerror] ${error.message}`);
  });

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    issues.push(`[console] ${msg.text()}`);
  });

  try {
    await page.addInitScript(adminSelectionMock());
    await page.goto(new URL('admin/dashboard.html', BASE).toString(), {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    await page.waitForSelector('.sidebar-link[data-tab="borrow-requests"]', { timeout: 15000 });
    await page.evaluate(() => switchTab('borrow-requests'));
    await page.waitForSelector('#tab-borrow-requests.active', { timeout: 15000 });
    await page.waitForSelector('.borrow-cb', { timeout: 15000 });

    await page.locator('.borrow-cb').first().check();
    await page.waitForTimeout(150);
    let state = await readBorrowUiState(page);
    if (state.bulkCount !== '1' || !state.bulkBadgeClass.includes('is-partial')) {
      throw new Error(`Unexpected partial selection state: ${JSON.stringify(state)}`);
    }

    await page.locator('#borrow-select-all').check();
    await page.waitForTimeout(150);
    state = await readBorrowUiState(page);
    if (state.bulkCount !== '10' || !state.bulkBadgeClass.includes('is-page') || !state.bulkActionVisible || !state.bulkActionText.includes('12')) {
      throw new Error(`Unexpected page selection state: ${JSON.stringify(state)}`);
    }

    await page.evaluate(() => document.getElementById('btn-borrow-select-all-results')?.click());
    await page.waitForTimeout(150);
    state = await readBorrowUiState(page);
    if (state.bulkCount !== '12' || !state.bulkBadgeClass.includes('is-results') || !state.bulkMeta.includes('12') || state.bulkActionVisible) {
      throw new Error(`Unexpected all-results selection state: ${JSON.stringify(state)}`);
    }

    page.once('dialog', (dialog) => dialog.accept('Borrower 12 only'));
    await page.locator('#borrow-search').fill('Borrower 12');
    await page.locator('#btn-borrow-save-filter').click();
    await page.waitForTimeout(150);
    state = await readBorrowUiState(page);
    if (!state.presetOptions.includes('Borrower 12 only')) {
      throw new Error(`Preset was not saved: ${JSON.stringify(state)}`);
    }

    await page.locator('#btn-borrow-set-default-filter').click();
    await page.waitForTimeout(150);
    state = await readBorrowUiState(page);
    if (state.defaultPreset !== 'Borrower 12 only') {
      throw new Error(`Default preset was not saved: ${JSON.stringify(state)}`);
    }

    await page.locator('#borrow-search').fill('Borrower 1');
    await page.waitForTimeout(150);
    state = await readBorrowUiState(page);
    if (!state.warningVisible || !state.warningText) {
      throw new Error(`Selection warning did not appear after filter change: ${JSON.stringify(state)}`);
    }

    await page.locator('#btn-borrow-clear-default-filter').click();
    await page.waitForTimeout(150);
    state = await readBorrowUiState(page);
    if (state.defaultPreset) {
      throw new Error(`Default preset was not cleared: ${JSON.stringify(state)}`);
    }

    await page.locator('#btn-borrow-columns').click();
    await page.waitForSelector('#borrow-columns-modal:not(.hidden)');
    await page.locator('[data-borrow-column-freeze="borrower"]').check();
    await page.locator('[data-borrow-column-option="purpose"]').uncheck();
    await page.evaluate(() => moveBorrowColumn('status', 'up'));
    await page.locator('#borrow-columns-save').click();
    await page.waitForTimeout(200);
    state = await readBorrowUiState(page);
    if (state.headers.join(',') !== 'tracking,borrower,status,pickup,actions' || !state.frozenHeaders.includes('borrower')) {
      throw new Error(`Column layout did not apply: ${JSON.stringify(state)}`);
    }

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.sidebar-link[data-tab="borrow-requests"]', { timeout: 15000 });
    await page.evaluate(() => switchTab('borrow-requests'));
    await page.waitForSelector('#tab-borrow-requests.active', { timeout: 15000 });
    await page.waitForTimeout(200);
    state = await readBorrowUiState(page);
    if (state.headers.join(',') !== 'tracking,borrower,status,pickup,actions' || !state.frozenHeaders.includes('borrower')) {
      throw new Error(`Column layout did not persist after reload: ${JSON.stringify(state)}`);
    }
  } catch (error) {
    issues.push(`[exception] ${error.message}`);
  } finally {
    await page.close();
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }

  if (issues.length > 0) {
    console.log('FAIL: Admin selection semantics');
    issues.forEach((issue) => console.log(`  ${issue}`));
    process.exit(1);
  }

  console.log('PASS: Admin selection semantics');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
