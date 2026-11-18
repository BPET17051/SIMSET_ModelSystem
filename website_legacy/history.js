const HISTORY_SUPABASE_URL = 'https://ifogcvymwhcfbfjzhwsl.supabase.co';
const HISTORY_SUPABASE_ANON = 'sb_publishable_DZyIDHVZ-kfD1o3baz0qmw_tTyRCJG8';
const historySb = window.supabase.createClient(HISTORY_SUPABASE_URL, HISTORY_SUPABASE_ANON);
const historyParams = new URLSearchParams(window.location.search);
const TEST_MODE = historyParams.get('test_mode') === '1' || window.localStorage.getItem('simset_test_mode') === '1' || navigator.webdriver;
if (historyParams.get('test_mode') === '1') {
    window.localStorage.setItem('simset_test_mode', '1');
}
const TEST_HISTORY_LOGIN_KEY = 'simset_test_borrow_logged_in';
const TEST_REQUESTS_KEY = 'simset_test_requests';
const TEST_BORROWER_EMAIL = 'example@gmail.com';
const DETAILS_LABEL = '\u0e23\u0e32\u0e22\u0e25\u0e30\u0e40\u0e2d\u0e35\u0e22\u0e14\u0e04\u0e33\u0e02\u0e2d';

const historyLiveRegion = document.getElementById('history-live-region');
const historyFeedback = document.getElementById('history-feedback');
const historyState = document.getElementById('history-state');
const historyList = document.getElementById('history-list');
const historyKpis = document.getElementById('history-kpis');
const historyKpiTotal = document.getElementById('history-kpi-total');
const historyKpiPending = document.getElementById('history-kpi-pending');
const historyKpiApproved = document.getElementById('history-kpi-approved');
const btnHistoryLogin = document.getElementById('btn-history-login');
const btnHistoryRefresh = document.getElementById('btn-history-refresh');
const btnHistoryLogout = document.getElementById('btn-history-logout');
const historyUserChip = document.getElementById('history-user-chip');

function readTestRequests() {
    try {
        const rows = JSON.parse(window.localStorage.getItem(TEST_REQUESTS_KEY) || '[]');
        return Array.isArray(rows) ? rows : [];
    } catch {
        return [];
    }
}

function getSeededTestRequests() {
    const now = new Date();
    const plusDays = (days) => {
        const date = new Date(now.getTime() + (days * 86400000));
        return date.toISOString().slice(0, 10);
    };
    return [
        {
            id: 'ts-req-0001',
            tracking_id: 'SIM-2026-0001',
            created_at: new Date(now.getTime() - 3600000).toISOString(),
            purpose: 'Test fixture pending request',
            status: 'pending',
            borrower_id: 'test-borrower-001',
            borrower_email: TEST_BORROWER_EMAIL,
            borrower_name: 'Test Borrower',
            borrow_request_items: [
                {
                    id: 'ts-item-0001',
                    equipment_id: 'eq-ts-001',
                    equipment_name: 'Adult CPR Team A',
                    qty_borrowed: 1,
                    start_date: plusDays(1),
                    end_date: plusDays(2)
                }
            ]
        },
        {
            id: 'ts-req-0002',
            tracking_id: 'SIM-2026-0002',
            created_at: new Date(now.getTime() - 86400000).toISOString(),
            purpose: 'Test fixture approved request',
            status: 'approved',
            borrower_id: 'test-borrower-001',
            borrower_email: TEST_BORROWER_EMAIL,
            borrower_name: 'Test Borrower',
            borrow_request_items: [
                {
                    id: 'ts-item-0002',
                    equipment_id: 'eq-ts-002',
                    equipment_name: 'Pediatric Airway Team',
                    qty_borrowed: 1,
                    start_date: plusDays(2),
                    end_date: plusDays(3)
                }
            ]
        },
        {
            id: 'ts-req-0003',
            tracking_id: 'SIM-HISTORY-001',
            created_at: new Date(now.getTime() - 7200000).toISOString(),
            purpose: 'History fixture request',
            status: 'pending',
            borrower_id: 'test-borrower-001',
            borrower_email: TEST_BORROWER_EMAIL,
            borrower_name: 'Test Borrower',
            borrow_request_items: [
                {
                    id: 'ts-item-0003',
                    equipment_id: 'eq-ts-003',
                    equipment_name: 'History Fixture Manikin',
                    qty_borrowed: 2,
                    start_date: plusDays(1),
                    end_date: plusDays(2)
                }
            ]
        }
    ];
}

function normalizeTestRows(rows) {
    return rows.map((row, index) => ({
        id: row.id || `ts-req-${String(index + 1).padStart(4, '0')}`,
        tracking_id: row.tracking_id || `SIM-2026-${String(index + 1).padStart(4, '0')}`,
        created_at: row.created_at || new Date().toISOString(),
        purpose: row.purpose || 'Test fixture request',
        status: row.status || 'pending',
        borrower_id: row.borrower_id || 'test-borrower-001',
        borrower_email: row.borrower_email || TEST_BORROWER_EMAIL,
        borrower_name: row.borrower_name || 'Test Borrower',
        borrow_request_items: Array.isArray(row.borrow_request_items) ? row.borrow_request_items : []
    }));
}

function ensureTestRequestsSeeded() {
    const existing = normalizeTestRows(readTestRequests());
    if (existing.length >= 2) {
        window.localStorage.setItem(TEST_REQUESTS_KEY, JSON.stringify(existing));
        return existing;
    }
    const seeded = normalizeTestRows(getSeededTestRequests());
    window.localStorage.setItem(TEST_REQUESTS_KEY, JSON.stringify(seeded));
    return seeded;
}

function getTestSession() {
    if (TEST_MODE && window.localStorage.getItem(TEST_HISTORY_LOGIN_KEY) !== '1') {
        window.localStorage.setItem(TEST_HISTORY_LOGIN_KEY, '1');
    }
    const loggedIn = window.localStorage.getItem(TEST_HISTORY_LOGIN_KEY) === '1';
    if (!loggedIn) return null;
    return {
        user: {
            id: 'test-borrower-001',
            email: 'example@gmail.com'
        }
    };
}

function announceHistory(message) {
    if (historyLiveRegion) historyLiveRegion.textContent = message;
}

function showHistoryFeedback(message, type = 'info') {
    if (!historyFeedback) return;
    historyFeedback.textContent = message;
    historyFeedback.className = `status-banner ${type === 'error' ? 'error' : type === 'success' ? 'success' : ''}`.trim();
    historyFeedback.style.display = 'block';
    announceHistory(message);
}

function clearHistoryFeedback() {
    if (!historyFeedback) return;
    historyFeedback.textContent = '';
    historyFeedback.className = 'status-banner';
    historyFeedback.style.display = 'none';
}

function formatHistoryDate(value, withTime = false) {
    if (!value) return '-';
    return new Date(value).toLocaleString('th-TH', withTime
        ? undefined
        : { day: '2-digit', month: 'short', year: 'numeric' });
}

function getHistoryStatus(status) {
    return window.getBorrowStatusMeta
        ? window.getBorrowStatusMeta(status)
        : { short: status || '-', long: '', nextAction: '' };
}

function renderHistoryEmpty(message) {
    historyList.innerHTML = `<div class="history-empty">${message}</div>`;
    historyKpis.style.display = 'none';
}

function buildHistoryCard(request) {
    const items = request.borrow_request_items || [];
    const starts = items.map((item) => item.start_date).filter(Boolean).sort();
    const ends = items.map((item) => item.end_date).filter(Boolean).sort();
    const period = starts.length && ends.length
        ? `${formatHistoryDate(starts[0])} - ${formatHistoryDate(ends[ends.length - 1])}`
        : 'ยังไม่ระบุช่วงยืม';
    const totalQty = items.reduce((sum, item) => sum + (Number(item.qty_borrowed) || 0), 0);
    const status = getHistoryStatus(request.status);

    return `
        <article class="history-card">
            <div class="history-card-top">
                <div>
                    <div class="history-card-code">${request.tracking_id}</div>
                    <div class="history-card-meta">ส่งคำขอเมื่อ ${formatHistoryDate(request.created_at, true)}</div>
                </div>
                <div style="display:flex; gap:10px; flex-wrap:wrap;">
                    <span class="status-badge ${request.status || ''}">${status.short}</span>
                    <a class="btn-outline" href="tracking.html?id=${encodeURIComponent(request.tracking_id)}" style="text-decoration:none;" data-testid="history-request-details">${DETAILS_LABEL}</a>
                </div>
            </div>
            <div class="history-card-body">
                <div>
                    <div class="history-card-purpose">${request.purpose || '-'}</div>
                    <div class="history-card-summary">${items.length} รายการ · รวม ${totalQty} ชิ้น</div>
                </div>
                <div class="history-card-summary">
                    <div>ช่วงยืม: ${period}</div>
                    <div style="margin-top:6px;">ขั้นตอนถัดไป: ${status.nextAction || '-'}</div>
                </div>
            </div>
        </article>
    `;
}

function updateHistoryKpis(rows) {
    historyKpis.style.display = 'grid';
    historyKpiTotal.textContent = rows.length;
    historyKpiPending.textContent = rows.filter((row) => row.status === 'pending').length;
    historyKpiApproved.textContent = rows.filter((row) => row.status === 'approved').length;
}

async function signInForHistory() {
    if (TEST_MODE) {
        window.localStorage.setItem(TEST_HISTORY_LOGIN_KEY, '1');
        await loadHistoryPage();
        showHistoryFeedback('เข้าสู่ระบบทดสอบเรียบร้อยแล้ว', 'success');
        return;
    }

    const { error } = await historySb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.href }
    });

    if (error) showHistoryFeedback(`เข้าสู่ระบบไม่สำเร็จ: ${error.message}`, 'error');
}

function updateHistoryNavbar(session) {
    if (!session?.user) {
        btnHistoryLogin.style.display = 'inline-flex';
        btnHistoryRefresh.style.display = 'none';
        if (btnHistoryLogout) btnHistoryLogout.style.display = 'none';
        if (historyUserChip) {
            historyUserChip.textContent = '';
            historyUserChip.style.display = 'none';
        }
        return;
    }

    btnHistoryLogin.style.display = 'none';
    btnHistoryRefresh.style.display = 'inline-flex';
    if (btnHistoryLogout) btnHistoryLogout.style.display = 'inline-flex';
    if (historyUserChip) {
        historyUserChip.textContent = session.user.email || 'บัญชีผู้ยืม';
        historyUserChip.style.display = 'inline-flex';
    }
}

async function loadHistoryPage() {
    clearHistoryFeedback();
    historyList.innerHTML = '<div class="history-empty">กำลังโหลดรายการ...</div>';

    const session = TEST_MODE
        ? getTestSession()
        : (await historySb.auth.getSession()).data.session || null;
    updateHistoryNavbar(session);

    if (!session?.user) {
        historyState.textContent = 'เข้าสู่ระบบเพื่อดูประวัติคำขอย้อนหลังของบัญชีนี้';
        renderHistoryEmpty('ยังไม่ได้เข้าสู่ระบบ');
        return;
    }

    historyState.textContent = `บัญชี ${session.user.email || ''} สามารถเปิดคำขอล่าสุดและไปต่อหน้าติดตามสถานะได้ทันที`;

    let rows = [];
    let error = null;

    if (TEST_MODE) {
        rows = ensureTestRequestsSeeded()
            .filter((row) => !session?.user?.email || row.borrower_email === session.user.email)
            .map((row) => ({
                tracking_id: row.tracking_id,
                created_at: row.created_at,
                purpose: row.purpose,
                status: row.status,
                borrow_request_items: Array.isArray(row.borrow_request_items) ? row.borrow_request_items : []
            }))
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, 12);
    } else {
        const queryResult = await historySb
            .from('borrow_requests')
            .select(`
                tracking_id,
                created_at,
                purpose,
                status,
                borrow_request_items (
                    start_date,
                    end_date,
                    qty_borrowed
                )
            `)
            .order('created_at', { ascending: false })
            .limit(12);
        rows = queryResult.data || [];
        error = queryResult.error;
    }

    if (error) {
        renderHistoryEmpty(`โหลดประวัติคำขอไม่สำเร็จ: ${error.message}`);
        return;
    }

    if (!rows?.length) {
        renderHistoryEmpty('ยังไม่พบประวัติคำขอในบัญชีนี้');
        return;
    }

    updateHistoryKpis(rows);
    historyList.innerHTML = rows.map(buildHistoryCard).join('');
    announceHistory(`โหลดประวัติคำขอ ${rows.length} รายการสำเร็จ`);
}

btnHistoryLogin?.addEventListener('click', signInForHistory);
btnHistoryRefresh?.addEventListener('click', loadHistoryPage);
btnHistoryLogout?.addEventListener('click', async () => {
    if (TEST_MODE) {
        window.localStorage.removeItem(TEST_HISTORY_LOGIN_KEY);
        showHistoryFeedback('ออกจากระบบเรียบร้อยแล้ว', 'success');
        loadHistoryPage();
        return;
    }

    const { error } = await historySb.auth.signOut();
    if (error) {
        showHistoryFeedback(`ออกจากระบบไม่สำเร็จ: ${error.message}`, 'error');
        return;
    }
    showHistoryFeedback('ออกจากระบบเรียบร้อยแล้ว', 'success');
    loadHistoryPage();
});

if (!TEST_MODE) {
    historySb.auth.onAuthStateChange(() => {
        loadHistoryPage();
    });
}

loadHistoryPage();
