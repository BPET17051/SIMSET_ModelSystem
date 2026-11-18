const { chromium } = require('playwright');

const base = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:4173/';
const isLocalSmoke = base.includes('127.0.0.1') || base.includes('localhost');
const findings = [];

function shouldIgnoreConsoleError(text) {
    if (text.includes('Tracking ID not found')) return true;
    if (text.includes('Failed to load resource: the server responded with a status of 400')) return true;
    if (!isLocalSmoke) return false;
    return text.includes('has been blocked by CORS policy')
        || text.includes('Failed to load resource: net::ERR_FAILED')
        || text.includes('TypeError: Failed to fetch');
}

async function runCheck(browser, name, path, fn) {
    const page = await browser.newPage();
    const local = [];

    page.on('console', (msg) => {
        if (msg.type() !== 'error') return;
        const text = msg.text();
        if (shouldIgnoreConsoleError(text)) return;
        local.push(`[console] ${text}`);
    });

    page.on('pageerror', (err) => {
        local.push(`[pageerror] ${err.message}`);
    });

    try {
        await page.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await fn(page, local);
        findings.push({ name, ok: local.length === 0, details: local });
    } catch (error) {
        local.push(`[exception] ${error.message}`);
        findings.push({ name, ok: false, details: local });
    } finally {
        await page.close();
    }
}

async function runCheckWithOptions(browser, name, path, options, fn) {
    const page = await browser.newPage({
        viewport: options.viewport || undefined
    });
    const local = [];

    page.on('console', (msg) => {
        if (msg.type() !== 'error') return;
        const text = msg.text();
        if (shouldIgnoreConsoleError(text)) return;
        local.push(`[console] ${text}`);
    });

    page.on('pageerror', (err) => {
        local.push(`[pageerror] ${err.message}`);
    });

    try {
        if (options.initScript) {
            await page.addInitScript(options.initScript);
        }
        await page.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await fn(page, local);
        findings.push({ name, ok: local.length === 0, details: local });
    } catch (error) {
        local.push(`[exception] ${error.message}`);
        findings.push({ name, ok: false, details: local });
    } finally {
        await page.close();
    }
}

function buildTrackingAuthMock() {
    return `
        const mockSupabase = {
            createClient() {
                const historyRows = [
                    {
                        tracking_id: 'SIM-HISTORY-001',
                        created_at: '2026-03-20T09:00:00Z',
                        purpose: 'ทดสอบการฝึกช่วยชีวิต',
                        status: 'pending',
                        borrow_request_items: [
                            { start_date: '2026-03-25', end_date: '2026-03-26', qty_borrowed: 2 }
                        ]
                    },
                    {
                        tracking_id: 'SIM-HISTORY-002',
                        created_at: '2026-03-18T07:30:00Z',
                        purpose: 'ทดสอบผู้ป่วยเด็ก',
                        status: 'approved',
                        borrow_request_items: [
                            { start_date: '2026-03-22', end_date: '2026-03-23', qty_borrowed: 1 }
                        ]
                    }
                ];

                return {
                    auth: {
                        async getSession() {
                            return {
                                data: {
                                    session: {
                                        user: {
                                            id: 'borrower-1',
                                            email: 'borrower@example.com'
                                        }
                                    }
                                }
                            };
                        },
                        onAuthStateChange() {
                            return { data: { subscription: { unsubscribe() {} } } };
                        },
                        async signInWithOAuth() {
                            return { error: null };
                        }
                    },
                    from() {
                        return {
                            select() { return this; },
                            order() { return this; },
                            limit() { return Promise.resolve({ data: historyRows, error: null }); }
                        };
                    },
                    async rpc(name, args) {
                        if (name === 'get_borrow_request_status') {
                            return {
                                data: {
                                    tracking_id: args.p_tracking_id,
                                    created_at: '2026-03-20T09:00:00Z',
                                    purpose: 'ทดสอบการฝึกช่วยชีวิต',
                                    status: args.p_tracking_id === 'SIM-HISTORY-002' ? 'approved' : 'pending',
                                    items: [
                                        {
                                            equipment_name: 'Adult CPR Manikin',
                                            start_date: '2026-03-25',
                                            end_date: '2026-03-26',
                                            qty_borrowed: 2
                                        }
                                    ]
                                },
                                error: null
                            };
                        }
                        if (name === 'cancel_borrow_request') {
                            return { error: null };
                        }
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

function buildAdminMobileMock() {
    return `
        const mockSupabase = {
            createClient() {
                const adminSession = {
                    user: {
                        id: 'admin-1',
                        email: 'admin@example.com',
                        app_metadata: { role: 'admin' }
                    }
                };

                const manikins = [
                    { sap_id: 'SAP-001', asset_name: 'Adult CPR Manikin', asset_code: 'A-001', status: 'ready', note: '', is_active: true, needs_review: false, location_id: 1 },
                    { sap_id: 'SAP-002', asset_name: 'Pediatric Manikin', asset_code: 'P-002', status: 'maintenance', note: '', is_active: true, needs_review: false, location_id: 1 }
                ];

                const borrowRequests = [
                    {
                        id: 'req-001',
                        tracking_id: 'SIM-REQ-001',
                        borrower_name: 'Demo Borrower',
                        borrower_email: 'borrower@example.com',
                        purpose: 'ฝึกปฏิบัติการฉุกเฉิน',
                        status: 'approved',
                        created_at: '2026-03-20T08:00:00Z',
                        borrow_request_items: [
                            {
                                id: 'item-001',
                                equipment_id: 'eq-001',
                                start_date: '2026-03-20',
                                end_date: '2026-03-21',
                                qty_borrowed: 2,
                                qty_returned_ok: 0,
                                qty_returned_damaged: 0,
                                qty_returned_maintenance: 0,
                                equipments: { name_th: 'Adult CPR Manikin', name_en: 'Adult CPR Manikin' }
                            }
                        ]
                    }
                ];

                const locations = [{ id: 1, building: 'SiMSET Building', room_name: 'Lab A' }];

                function makeQuery(result, countValue) {
                    return {
                        _single: false,
                        select() { return this; },
                        eq() { return this; },
                        gt() { return this; },
                        in() { return this; },
                        ilike() { return this; },
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
                        async getSession() {
                            return { data: { session: adminSession } };
                        },
                        onAuthStateChange() {
                            return { data: { subscription: { unsubscribe() {} } } };
                        },
                        async signOut() {
                            return { error: null };
                        }
                    },
                    from(table) {
                        if (table === 'locations') return makeQuery(locations);
                        if (table === 'borrow_requests') return makeQuery(borrowRequests);
                        if (table === 'manikins') return makeQuery(manikins, manikins.length);
                        if (table === 'capabilities') return makeQuery([]);
                        if (table === 'audit_logs') return makeQuery([]);
                        if (table === 'teams') return makeQuery([]);
                        if (table === 'team_capabilities') return makeQuery([]);
                        if (table === 'manikin_capabilities') return makeQuery([]);
                        if (table === 'team_images') return makeQuery([]);
                        if (table === 'team_image_audit_log') return makeQuery([]);
                        return makeQuery([]);
                    },
                    async rpc(name) {
                        if (name === 'admin_receive_return') return { error: null };
                        if (name === 'admin_receive_return_detailed') return { error: null };
                        if (name === 'admin_approve_request') return { error: null };
                        if (name === 'admin_reject_request') return { error: null };
                        if (name === 'sync_manikin_capabilities') return { error: null };
                        if (name === 'delete_location_atomic') return { error: null };
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

(async () => {
    const browser = await chromium.launch({ headless: true });

    await runCheck(browser, 'Public catalog', 'index.html', async (page, local) => {
        await page.waitForSelector('#search-input', { timeout: 15000 });
        await page.waitForTimeout(2500);
        const cardCount = await page.locator('#manikin-grid .product-card, #manikin-grid .group-card').count();
        if (cardCount === 0) local.push('[assert] catalog rendered no cards after 2.5s');
    });

    await runCheck(browser, 'Borrow', 'borrow.html', async (page, local) => {
        await page.waitForSelector('#btn-date-filter', { timeout: 15000 });
        await page.click('#btn-date-filter');
        await page.waitForFunction(() => getComputedStyle(document.getElementById('date-filter-bar')).display !== 'none');
        await page.click('#btn-apply-dates');
        await page.waitForTimeout(500);
        const feedbackVisible = await page.locator('#borrow-feedback').evaluate((el) => getComputedStyle(el).display !== 'none');
        if (!feedbackVisible) local.push('[assert] borrow feedback did not become visible for empty date validation');
    });

    await runCheck(browser, 'Success page', 'success?tid=TEST-SMOKE-123', async (page, local) => {
        await page.waitForSelector('#success-tracking-id', { timeout: 15000 });
        const text = await page.locator('#success-tracking-id').innerText();
        if (!text.includes('TEST-SMOKE-123')) local.push(`[assert] success page tracking ID mismatch: ${text}`);
    });

    await runCheck(browser, 'Tracking', 'tracking.html', async (page, local) => {
        await page.waitForSelector('#tracking-input', { timeout: 15000 });
        await page.fill('#tracking-input', 'SMOKE-INVALID-001');
        await page.click('#btn-search');
        await page.waitForFunction(() => {
            const errorView = document.getElementById('error-view');
            const feedback = document.getElementById('tracking-feedback');
            return getComputedStyle(errorView).display !== 'none'
                || getComputedStyle(feedback).display !== 'none';
        }, { timeout: 15000 });
        const errorShown = await page.locator('#error-view').evaluate((el) => getComputedStyle(el).display !== 'none');
        const feedbackShown = await page.locator('#tracking-feedback').evaluate((el) => getComputedStyle(el).display !== 'none');
        if (!errorShown && !feedbackShown) local.push('[assert] tracking invalid search produced no visible error state');
    });

    await runCheckWithOptions(browser, 'Borrower history mobile', 'history.html', {
        viewport: { width: 390, height: 844 },
        initScript: buildTrackingAuthMock()
    }, async (page, local) => {
        await page.waitForSelector('#history-list', { timeout: 15000 });
        await page.waitForSelector('a[href="tracking.html?id=SIM-HISTORY-001"]', { timeout: 15000 });
        const cardCount = await page.locator('#history-list .history-card').count();
        if (cardCount < 2) local.push(`[assert] expected at least 2 history cards, got ${cardCount}`);

        const firstHref = await page.locator('a[href="tracking.html?id=SIM-HISTORY-001"]').first().getAttribute('href');
        const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > (window.innerWidth + 1));

        if (firstHref !== 'tracking.html?id=SIM-HISTORY-001') local.push(`[assert] borrower history tracking link mismatch: ${firstHref}`);
        if (hasOverflow) local.push('[assert] borrower history mobile layout overflows horizontally');
    });

    await runCheckWithOptions(browser, 'Tracking tablet', 'tracking.html', {
        viewport: { width: 768, height: 1024 },
        initScript: buildTrackingAuthMock()
    }, async (page, local) => {
        await page.waitForSelector('#tracking-input', { timeout: 15000 });
        await page.fill('#tracking-input', 'SIM-HISTORY-001');
        await page.click('#btn-search');
        await page.waitForSelector('#result-view', { timeout: 15000 });
        const resultVisible = await page.locator('#result-view').evaluate((el) => getComputedStyle(el).display !== 'none');
        const infoGridWidth = await page.locator('.info-grid').evaluate((el) => el.getBoundingClientRect().width);
        if (!resultVisible) local.push('[assert] tracking result not visible on tablet');
        if (infoGridWidth <= 0) local.push('[assert] tracking info grid did not render on tablet');
    });

    await runCheck(browser, 'Admin login', 'admin/', async (page, local) => {
        await page.waitForLoadState('networkidle');
        await page.waitForSelector('#password', { timeout: 15000 });
        const input = page.locator('#password');
        const toggle = page.locator('#pw-toggle');
        const before = await input.getAttribute('type');
        await toggle.click();
        const after = await input.getAttribute('type');
        await toggle.click();
        const reset = await input.getAttribute('type');
        if (!(before === 'password' && after === 'text' && reset === 'password')) {
            local.push(`[assert] password toggle states unexpected: ${before} -> ${after} -> ${reset}`);
        }
    });

    await runCheckWithOptions(browser, 'Admin queue mobile', 'admin/dashboard.html', {
        viewport: { width: 768, height: 1024 },
        initScript: buildAdminMobileMock()
    }, async (page, local) => {
        await page.waitForSelector('#btn-menu-toggle', { timeout: 15000 });
        await page.click('#btn-menu-toggle');
        await page.waitForFunction(() => document.querySelector('.sidebar')?.classList.contains('open'));
        await page.click('.sidebar-link[data-tab="borrow-requests"]');
        await page.waitForSelector('#borrow-tbody tr', { timeout: 15000 });
        const rowCount = await page.locator('#borrow-tbody tr').count();
        if (rowCount === 0) local.push('[assert] borrow request queue rendered no rows');

        await page.click('#borrow-tbody .btn.btn-primary');
        await page.waitForFunction(() => !document.getElementById('return-modal')?.classList.contains('hidden'));

        const summaryVisible = await page.locator('#return-summary-panel').evaluate((el) => getComputedStyle(el).display !== 'none');
        const modalWidth = await page.locator('#return-modal .modal').evaluate((el) => el.getBoundingClientRect().width);
        const viewportWidth = await page.evaluate(() => window.innerWidth);
        const queueWrapScrollable = await page.evaluate(() => {
            const wrap = document.querySelector('#tab-borrow-requests .admin-table-wrap');
            if (!wrap) return false;
            const style = getComputedStyle(wrap);
            return style.overflowX === 'auto' || style.overflowX === 'scroll';
        });

        if (!summaryVisible) local.push('[assert] return inspection summary panel not visible on mobile');
        if (!queueWrapScrollable) local.push('[assert] borrow request table is not scrollable on mobile');
        if (modalWidth > viewportWidth) local.push(`[assert] return modal wider than viewport: ${modalWidth} > ${viewportWidth}`);
    });

    await runCheckWithOptions(browser, 'Admin queue phone', 'admin/dashboard.html', {
        viewport: { width: 390, height: 844 },
        initScript: buildAdminMobileMock()
    }, async (page, local) => {
        await page.waitForSelector('#btn-menu-toggle', { timeout: 15000 });
        await page.click('#btn-menu-toggle');
        await page.waitForFunction(() => document.querySelector('.sidebar')?.classList.contains('open'));
        await page.click('.sidebar-link[data-tab="borrow-requests"]');
        await page.waitForSelector('#borrow-tbody tr', { timeout: 15000 });
        await page.click('#borrow-tbody .btn.btn-primary');
        await page.waitForFunction(() => !document.getElementById('return-modal')?.classList.contains('hidden'));

        const bulkButtons = await page.locator('.return-bulk-actions .btn').count();
        const actionButtonsWide = await page.evaluate(() => {
            const buttons = [...document.querySelectorAll('.return-bulk-actions .btn')];
            return buttons.length > 0 && buttons.every((btn) => btn.getBoundingClientRect().width > 200);
        });
        const footerButtons = await page.locator('#return-modal .modal-actions .btn').count();

        if (bulkButtons < 2) local.push('[assert] return bulk action buttons missing on phone');
        if (!actionButtonsWide) local.push('[assert] return bulk action buttons did not expand for phone layout');
        if (footerButtons < 2) local.push('[assert] return modal footer actions missing on phone');
    });

    await browser.close();

    for (const item of findings) {
        console.log(`${item.ok ? 'PASS' : 'FAIL'}: ${item.name}`);
        for (const detail of item.details) console.log(`  ${detail}`);
    }

    process.exit(findings.some((item) => !item.ok) ? 1 : 0);
})();
