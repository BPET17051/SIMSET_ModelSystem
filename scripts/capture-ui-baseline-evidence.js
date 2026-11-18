const path = require('path');
const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const WEB_ROOT = path.join(ROOT, 'website');
const OUTPUT_DIR = path.join(ROOT, 'docs', 'ui-baseline-evidence');
const PORT = Number(process.env.SMOKE_PORT || 4184);
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
  response.writeHead(200, {
    'Content-Type': getMimeType(filePath),
    'Cache-Control': 'no-store',
  });

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

function adminEvidenceMock() {
  const locations = [
    { id: 1, building: 'อาคารอดุลยเดชวิกรม ชั้น10', room: 'Lab A' },
    { id: 2, building: 'พระศรีฯ ชั้น 3', room: 'Simulation 01' },
  ];

  const manikins = [
    { id: 'mk-001', sap_id: 'SAP-001', asset_name: 'Adult CPR Manikin', asset_code: 'A-001', status: 'ready', note: '', is_active: true, needs_review: false, location_id: 1 },
    { id: 'mk-002', sap_id: 'SAP-002', asset_name: 'Pediatric Manikin', asset_code: 'P-002', status: 'maintenance', note: '', is_active: true, needs_review: false, location_id: 1 },
    { id: 'mk-003', sap_id: 'SAP-003', asset_name: 'Infant Airway Trainer', asset_code: 'I-003', status: 'ready', note: '', is_active: true, needs_review: false, location_id: 2 },
  ];

  const requests = Array.from({ length: 8 }, (_, index) => ({
    id: `req-${index + 1}`,
    tracking_id: `SIM-EVD-${String(index + 1).padStart(3, '0')}`,
    created_at: `2026-04-${String(index + 10).padStart(2, '0')}T08:00:00Z`,
    purpose: `Evidence request ${index + 1}`,
    status: index < 5 ? 'pending' : 'approved',
    borrower_id: `borrower-${index + 1}`,
    borrower_email: `borrower${index + 1}@example.com`,
    borrower_name: `Borrower ${index + 1}`,
    borrow_request_items: [{
      id: `item-${index + 1}`,
      equipment_id: `eq-${index + 1}`,
      equipment_name: index % 2 === 0 ? 'Adult CPR Manikin' : 'Pediatric Manikin',
      qty_borrowed: 1,
      start_date: '2026-04-25',
      end_date: '2026-04-26',
      equipments: {
        name_th: index % 2 === 0 ? 'Adult CPR Manikin' : 'Pediatric Manikin',
        name_en: index % 2 === 0 ? 'Adult CPR Manikin' : 'Pediatric Manikin',
      }
    }],
  }));

  return `
    window.localStorage.setItem('simset_test_mode', '1');
    window.localStorage.setItem('simset_test_admin_logged_in', '1');
    window.localStorage.setItem('simset_test_requests', JSON.stringify(${JSON.stringify(requests)}));

    const mockSupabase = {
      createClient() {
        const adminSession = {
          user: { id: 'admin-1', email: 'admin@example.com', app_metadata: { role: 'admin' } }
        };

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
            if (table === 'manikins') return query(${JSON.stringify(manikins)}, ${manikins.length});
            if (table === 'locations') return query(${JSON.stringify(locations)}, ${locations.length});
            if (table === 'borrow_requests') return query([]);
            if (table === 'borrow_request_items') return query([]);
            if (table === 'audit_logs') return query([]);
            return query([]);
          },
          async rpc(name) {
            if (name === 'cancel_borrow_request') return { data: null, error: null };
            return { data: null, error: null };
          }
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

async function captureBorrow(page, viewport, fileName) {
  await page.setViewportSize(viewport);
  await page.goto(new URL('borrow.html', BASE).toString(), {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await page.waitForSelector('.borrow-flow-panel, .borrow-primary-stage', { timeout: 15000 });
  await page.screenshot({
    path: path.join(OUTPUT_DIR, fileName),
    fullPage: true,
  });
}

async function captureAdminBorrowRequests(page, viewport, fileName) {
  await page.setViewportSize(viewport);
  await page.addInitScript(adminEvidenceMock());
  await page.goto(new URL('admin/dashboard.html', BASE).toString(), {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await page.waitForSelector('.sidebar-link[data-tab="borrow-requests"]', { timeout: 15000 });
  await page.evaluate(() => switchTab('borrow-requests'));
  await page.waitForSelector('#tab-borrow-requests.active', { timeout: 15000 });
  await page.waitForSelector('#borrow-search', { timeout: 15000 });
  await page.screenshot({
    path: path.join(OUTPUT_DIR, fileName),
    fullPage: true,
  });
}

async function main() {
  await fsp.mkdir(OUTPUT_DIR, { recursive: true });

  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, HOST, resolve);
  });

  const browser = await chromium.launch({ headless: true });
  try {
    const borrowPage = await browser.newPage();
    await captureBorrow(borrowPage, { width: 1440, height: 960 }, 'borrow-desktop.png');
    await captureBorrow(borrowPage, { width: 390, height: 844 }, 'borrow-mobile.png');
    await borrowPage.close();

    const adminDesktop = await browser.newPage();
    await captureAdminBorrowRequests(adminDesktop, { width: 1440, height: 960 }, 'admin-borrow-requests-desktop.png');
    await adminDesktop.close();

    const adminMobile = await browser.newPage();
    await captureAdminBorrowRequests(adminMobile, { width: 768, height: 1024 }, 'admin-borrow-requests-tablet.png');
    await adminMobile.close();
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }

  console.log(`UI baseline evidence written to ${OUTPUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
