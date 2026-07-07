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
      { id: 'eq-001', name_th: 'Adult CPR Manikin', name_en: 'Adult CPR Manikin', type: 'adult', total_quantity: 2, maintenance_quantity: 0, allocation_type: 'rotating' },
      { id: 'eq-002', name_th: 'Infant Airway Trainer', name_en: 'Infant Airway Trainer', type: 'infant', total_quantity: 1, maintenance_quantity: 1, allocation_type: 'room_dedicated' }
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
        in() { return this; },
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
                    ? { user: { id: 'user-001', email: 'demo@mahidol.ac.th', app_metadata: { role: 'admin' } } }
                    : null
                }
              };
            },
            async signOut() { return { error: null }; },
            async signInWithOtp() { return { data: {}, error: null }; },
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
                  borrower_name: 'Demo Borrower',
                  borrower_position: 'Instructor',
                  borrower_phone: '0812345678',
                  borrower_department: 'SIMSET',
                  borrow_purpose_owner: 'SIMSET',
                  work_purpose: 'Training',
                  usage_location: 'Simulation Center',
                  purpose: 'ยืมพัสดุของ: SIMSET | เพื่อใช้ในงาน: Training | สถานที่ใช้งาน: Simulation Center | Department: SIMSET | Phone: 0812345678',
                  created_at: '2026-03-20T08:00:00Z',
                  items: [{ equipment_name: 'Adult CPR Manikin', manikin_sap_id: 'RA1', start_date: '2026-06-22', end_date: '2026-06-23', qty_borrowed: 1 }]
                },
                error: null
              };
            }
            if (name === 'submit_borrow_request') return { data: 'SIM-REQ-002', error: null };
            if (name === 'submit_public_borrow_request_v2') return { data: 'SIM-REQ-002', error: null };
            if (name === 'get_equipment_borrow_rules') {
              return {
                data: [{
                  equipment_id: 'eq-002',
                  equipment_name: 'Infant Airway Trainer',
                  allocation_type: 'room_dedicated',
                  blocked: false,
                  warning: 'ต้องแจ้งล่วงหน้าอย่างน้อย 7 วันทำการ และหัวหน้าศูนย์ต้องพิจารณาเป็นพิเศษ',
                  course_conflicts: []
                }],
                error: null
              };
            }
            if (name === 'submit_public_borrow_request') return { data: 'SIM-REQ-002', error: null };
            if (name === 'get_my_borrow_requests') {
              return {
                data: [{
                  id: 'req-001',
                  tracking_id: 'SIM-REQ-001',
                  status: 'pending',
                  can_cancel: true,
                  purpose: 'Training',
                  created_at: '2026-03-20T08:00:00Z',
                  items: [{ equipment_name: 'Adult CPR Manikin', qty_borrowed: 1 }]
                }],
                error: null
              };
            }
            if (name === 'transition_borrow_request_status') return { data: { status: args.p_next_status }, error: null };
            if (name === 'admin_update_borrow_request_status') return { data: { status: args.p_next_status }, error: null };
            if (name === 'get_l1_approval_queue') {
              return {
                data: [{
                  id: 'req-001',
                  tracking_id: 'SIM-REQ-001',
                  borrower_name: 'Demo Borrower',
                  department: 'SIMSET',
                  purpose: 'Training',
                  created_at: '2026-03-20T08:00:00Z',
                  items: [{ item_id: 'item-001', equipment_id: 'eq-001', equipment_name: 'Adult CPR Manikin', allocation_type: 'rotating', manikin_sap_id: 'RA1', qty_borrowed: 1 }]
                }],
                error: null
              };
            }
            if (name === 'approver_l1_decide_request') {
              return { data: { status: args.p_decision === 'approve' ? 'approved' : 'rejected' }, error: null };
            }
            if (name === 'get_staff_dashboard_orders') {
              return {
                data: {
                  to_prepare: [{
                    id: 'req-001',
                    tracking_id: 'SIM-REQ-001',
                    borrower_name: 'Demo Borrower',
                    department: 'SIMSET',
                    status: 'approved',
                    return_date: '2026-03-25',
                    items: [{ item_id: 'item-001', equipment_id: 'eq-001', equipment_name: 'Adult CPR Manikin', allocation_type: 'rotating', manikin_sap_id: 'RA1', qty_borrowed: 1 }]
                  }],
                  checked_out: [{
                    id: 'req-002',
                    tracking_id: 'SIM-REQ-002',
                    borrower_name: 'Demo Borrower',
                    department: 'ER',
                    status: 'borrowed',
                    return_date: '2026-03-26',
                    items: [{ item_id: 'item-002', equipment_id: 'eq-002', equipment_name: 'Infant Airway Trainer', allocation_type: 'room_dedicated', manikin_sap_id: 'NA1', qty_borrowed: 1 }]
                  }],
                  returned_today: [],
                  alerts: [{ alert_type: 'return_abnormal', message: 'Demo abnormal condition' }]
                },
                error: null
              };
            }
            if (name === 'confirm_pickup_with_snapshot') return { data: { status: 'borrowed' }, error: null };
            if (name === 'confirm_return_with_snapshot') return { data: { status: 'returned' }, error: null };
            if (name === 'get_rotation_suggestions') {
              return { data: [{ manikin_sap_id: 'RA2', borrow_count: 0, message: 'หุ่นตัวนี้ถูกยืมบ่อยกว่าตัวอื่น พิจารณาใช้ RA2 แทนไหม' }], error: null };
            }
            if (name === 'staff_assign_manikin_to_item') return { data: { status: 'assigned' }, error: null };
            if (name === 'get_kpi_report') {
              return {
                data: {
                  pending_approval_count: 2,
                  overdue_count: 1,
                  on_time_return_rate: 92.5,
                  ready_manikin_count: 48,
                  orders_by_month: [{ month: '2026-03', order_count: 8 }],
                  top_departments: [{ department: 'SIMSET', order_count: 5 }]
                },
                error: null
              };
            }
            return { data: null, error: null };
          },
          channel() {
            return {
              on() { return this; },
              subscribe() { return this; }
            };
          },
          storage: {
            from() {
              return {
                async upload(path) { return { data: { path }, error: null }; }
              };
            }
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
    selectors: ['.navbar-brand', '#equipment-grid', '#catalog-search', '.recognition-hint', '.equipment-choice-summary', '[data-cart-count]'],
  },
  {
    name: 'Product details page',
    path: 'product-details.html?id=eq-001',
    selectors: ['.navbar-brand', '#equipment-detail', '.equipment-choice-summary'],
  },
  {
    name: 'Cart page',
    path: 'cart.html?equipment_id=eq-001&qty=1',
    selectors: ['.navbar-brand', '#cart-items'],
    cartItems: [{ equipment_id: 'eq-001', qty: 1 }],
  },
  {
    name: 'Checkout page',
    path: 'checkout.html?equipment_id=eq-001&qty=1',
    selectors: ['.navbar-brand', '#checkout-form', '#checkout-items', '.recognition-hint', '.form-section-title', '.form-helper', '#borrower_name', '#borrower_position', '#borrow_purpose_owner', '#work_purpose', '#usage_location'],
    cartItems: [{ equipment_id: 'eq-001', qty: 1 }],
    submitCheckout: true,
  },
  {
    name: 'Tracking page',
    path: 'track.html?id=SIM-REQ-001',
    selectors: ['.navbar-brand', '#track-form', '#track-result'],
  },
  {
    name: 'Success receipt page',
    path: 'success.html?id=SIM-REQ-001',
    selectors: ['.navbar-brand', '#receipt-content', '.borrow-form-print', '#tracking-qr', '#print-receipt'],
  },
  {
    name: 'Borrower history page',
    path: 'history.html',
    selectors: ['.navbar-brand', '#history-auth', '#history-list'],
  },
  {
    name: 'Admin login page',
    path: 'admin-login.html',
    selectors: ['.navbar-brand', '#admin-login-form', '#admin-email', '#admin-password'],
    adminSession: false,
  },
  {
    name: 'Admin page',
    path: 'admin.html',
    selectors: ['#admin-auth-state', '#admin-menu', 'a[href="approver.html"]', 'a[href="staff.html"]'],
  },
  {
    name: 'Staff dashboard page',
    path: 'staff.html',
    selectors: ['#staff-auth-state', '.attention-summary', '.work-fragmentation-note', '#staff-focus-prepare', '#staff-to-prepare', '#staff-checked-out', '#staff-returned-today'],
  },
  {
    name: 'L1 approval page',
    path: 'approver.html',
    selectors: ['#approver-auth-state', '.attention-summary', '.work-fragmentation-note', '#approval-focus-count', '#approval-queue', '[data-approval-action]'],
  },
  {
    name: 'KPI report page',
    path: 'report.html',
    selectors: ['#report-auth-state', '.kpi-card.is-primary', '.report-panel-primary', '#kpi-pending', '#monthly-chart', '#top-departments'],
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
    if (testCase.cartItems) {
      await page.addInitScript((items) => {
        localStorage.setItem('simset.borrow.cart.v2', JSON.stringify({ items }));
      }, testCase.cartItems);
    }
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
    if (testCase.submitCheckout) {
      await page.fill('#borrower_name', 'Demo Borrower');
      await page.fill('#borrower_position', 'Instructor');
      await page.fill('#department', 'SIMSET');
      await page.fill('#phone', '0812345678');
      await page.fill('#start_date', '2026-06-22');
      await page.fill('#end_date', '2026-06-23');
      await page.fill('#borrow_purpose_owner', 'SIMSET');
      await page.fill('#work_purpose', 'Training');
      await page.fill('#usage_location', 'Simulation Center');
      await page.click('#checkout-form button[type="submit"]');
      await page.waitForURL(/success\.html\?id=SIM-REQ-002/, { timeout: 10000 });
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
