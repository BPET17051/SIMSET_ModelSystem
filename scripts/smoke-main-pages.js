const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const WEB_ROOT = path.join(ROOT, 'website');
const PORT = Number(process.env.SMOKE_PORT || 4176);
const HOST = '127.0.0.1';
const BASE = `http://${HOST}:${PORT}/`;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
};

function getMimeType(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function createServer() {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, BASE);
      const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
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

      const filePath = stat.isDirectory() ? path.join(resolved, 'index.html') : resolved;
      response.writeHead(200, {
        'Content-Type': getMimeType(filePath),
        'Cache-Control': 'no-store',
      });
      fs.createReadStream(filePath).pipe(response);
    } catch (error) {
      response.writeHead(500);
      response.end(`Server error: ${error.message}`);
    }
  });
}

function supabaseMock({ adminSession = true } = {}) {
  return `
    const hasAdminSession = ${adminSession ? 'true' : 'false'};
    const equipmentRows = [
      { id: 'eq-001', name_th: 'Adult CPR Manikin', name_en: 'Adult CPR Manikin', type: 'adult', total_quantity: 2, maintenance_quantity: 0 },
      { id: 'eq-002', name_th: 'Infant Airway Trainer', name_en: 'Infant Airway Trainer', type: 'infant', total_quantity: 1, maintenance_quantity: 1 }
    ];
    const requestRows = [{
      id: 'req-001',
      tracking_id: 'SIM-REQ-001',
      borrower_name: 'Demo Borrower',
      purpose: 'Training | หน่วยงาน: SIMSET | โทร: 000',
      status: 'approved',
      created_at: '2026-03-20T08:00:00Z',
      borrow_request_items: [{ qty_borrowed: 1, equipments: { name_th: 'Adult CPR Manikin' } }]
    }];

    function query(rows) {
      return {
        select() { return this; },
        eq() { return this; },
        order() { return this; },
        limit() { return this; },
        single() { this._single = true; return this; },
        then(resolve) { resolve({ data: this._single ? rows[0] : rows, error: null, count: rows.length }); }
      };
    }

    const mockSupabase = {
      createClient() {
        return {
          auth: {
            async getSession() {
              return {
                data: {
                  session: hasAdminSession
                    ? { user: { email: 'admin@example.com', app_metadata: { role: 'admin' } } }
                    : null
                }
              };
            },
            async signOut() { return { error: null }; },
            async signInWithPassword() { return { error: null }; }
          },
          from(table) {
            if (table === 'equipments') return query(equipmentRows);
            if (table === 'borrow_requests') return query(requestRows);
            return query([]);
          },
          async rpc(name, args) {
            if (name === 'get_borrow_request_status') {
              return {
                data: {
                  tracking_id: args.p_tracking_id,
                  status: 'approved',
                  purpose: 'Training',
                  created_at: '2026-03-20T08:00:00Z',
                  items: [{ equipment_name: 'Adult CPR Manikin', qty_borrowed: 1 }]
                },
                error: null
              };
            }
            if (name === 'submit_public_borrow_request') return { data: 'SIM-REQ-002', error: null };
            if (name === 'admin_update_borrow_request_status') return { data: { status: args.p_next_status }, error: null };
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

const cases = [
  {
    name: 'Catalog page',
    path: 'index.html',
    selectors: ['.navbar-brand', '#equipment-grid', '#catalog-search', '[data-cart-count]'],
  },
  {
    name: 'Product details page',
    path: 'product-details.html?id=eq-001',
    selectors: ['.navbar-brand', '#equipment-detail'],
  },
  {
    name: 'Cart page',
    path: 'cart.html?equipment_id=eq-001&qty=1',
    selectors: ['.navbar-brand', '#cart-items'],
  },
  {
    name: 'Checkout page',
    path: 'checkout.html?equipment_id=eq-001&qty=1',
    selectors: ['#checkout-form', '#checkout-items', '#borrower_name'],
  },
  {
    name: 'Tracking page',
    path: 'track.html?id=SIM-REQ-001',
    selectors: ['.navbar-brand', '#track-form', '#track-result'],
  },
  {
    name: 'Admin login page',
    path: 'admin-login.html',
    selectors: ['#admin-login-form', '#admin-email', '#admin-password'],
    adminSession: false,
  },
  {
    name: 'Admin page',
    path: 'admin.html',
    selectors: ['#admin-auth-state', '#admin-requests', '[data-admin-tab="approved"]'],
  },
];

async function runCase(browser, testCase) {
  const page = await browser.newPage();
  const issues = [];
  page.on('pageerror', (error) => issues.push(`[pageerror] ${error.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') issues.push(`[console] ${msg.text()}`);
  });

  try {
    await page.addInitScript(supabaseMock({ adminSession: testCase.adminSession !== false }));
    const response = await page.goto(new URL(testCase.path, BASE).toString(), {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    if (!response || response.status() >= 400) {
      issues.push(`[http] ${testCase.path} returned ${response ? response.status() : 'no response'}`);
    }
    for (const selector of testCase.selectors) {
      await page.waitForSelector(selector, { timeout: 10000 });
    }
  } catch (error) {
    issues.push(`[exception] ${error.message}`);
  } finally {
    await page.close();
  }

  return { name: testCase.name, ok: issues.length === 0, issues };
}

async function main() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, HOST, resolve);
  });

  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const testCase of cases) {
      results.push(await runCase(browser, testCase));
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }

  for (const result of results) {
    console.log(`${result.ok ? 'PASS' : 'FAIL'}: ${result.name}`);
    for (const issue of result.issues) console.log(`  ${issue}`);
  }

  if (results.some((result) => !result.ok)) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
