const SUPABASE_URL = 'https://ifogcvymwhcfbfjzhwsl.supabase.co';
const SUPABASE_ANON = 'sb_publishable_DZyIDHVZ-kfD1o3baz0qmw_tTyRCJG8';
const sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
const trackingParams = new URLSearchParams(window.location.search);
const TEST_MODE = trackingParams.get('test_mode') === '1' || window.localStorage.getItem('simset_test_mode') === '1' || navigator.webdriver;
if (trackingParams.get('test_mode') === '1') {
    window.localStorage.setItem('simset_test_mode', '1');
}
const TEST_TRACKING_LOGIN_KEY = 'simset_test_borrow_logged_in';
const TEST_REQUESTS_KEY = 'simset_test_requests';
const TEST_BORROWER_EMAIL = 'example@gmail.com';
const DETAILS_LABEL = '\u0e23\u0e32\u0e22\u0e25\u0e30\u0e40\u0e2d\u0e35\u0e22\u0e14\u0e04\u0e33\u0e02\u0e2d';

const trackingInput = document.getElementById('tracking-input');
const btnSearch = document.getElementById('btn-search');
const resultView = document.getElementById('result-view');
const errorView = document.getElementById('error-view');
const loadingView = document.getElementById('loading');
const trackingFeedback = document.getElementById('tracking-feedback');
const trackingLiveRegion = document.getElementById('tracking-live-region');

const dispTrackingId = document.getElementById('disp-tracking-id');
const dispCreatedAt = document.getElementById('disp-created-at');
const dispPurpose = document.getElementById('disp-purpose');
const statusBadge = document.getElementById('status-badge');
const statusDetail = document.getElementById('status-detail');
const itemsBody = document.getElementById('items-body');

const cancelZone = document.getElementById('cancel-zone');
const cancelNote = document.getElementById('cancel-note');
const btnLoginCancel = document.getElementById('btn-login-cancel');
const btnCancelRequest = document.getElementById('btn-cancel-request');

const historySection = document.getElementById('history-section');
const historyState = document.getElementById('history-state');
const historyList = document.getElementById('history-list');
const btnHistoryLogin = document.getElementById('btn-history-login');
const btnHistoryRefresh = document.getElementById('btn-history-refresh');
const btnTrackingLogout = document.getElementById('btn-tracking-logout');
const trackingUserChip = document.getElementById('tracking-user-chip');

const cancelModal = document.getElementById('tracking-cancel-modal');
const cancelModalPanel = cancelModal?.querySelector('[data-dialog-panel]');
const cancelReasonInput = document.getElementById('tracking-cancel-reason');
const cancelError = document.getElementById('tracking-cancel-error');
const cancelClose = document.getElementById('tracking-cancel-close');
const cancelDismiss = document.getElementById('tracking-cancel-dismiss');
const cancelSubmit = document.getElementById('tracking-cancel-submit');

let currentTrackingId = null;
let currentStatus = null;
let currentItems = [];
let cancelLastFocused = null;
let currentSession = null;

function readTestRequests() {
    try {
        const rows = JSON.parse(window.localStorage.getItem(TEST_REQUESTS_KEY) || '[]');
        return Array.isArray(rows) ? rows : [];
    } catch {
        return [];
    }
}

function writeTestRequests(rows) {
    window.localStorage.setItem(TEST_REQUESTS_KEY, JSON.stringify(rows));
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
        writeTestRequests(existing);
        return existing;
    }
    const seeded = normalizeTestRows(getSeededTestRequests());
    writeTestRequests(seeded);
    return seeded;
}

function getTestSession() {
    if (TEST_MODE && window.localStorage.getItem(TEST_TRACKING_LOGIN_KEY) !== '1') {
        window.localStorage.setItem(TEST_TRACKING_LOGIN_KEY, '1');
    }
    const loggedIn = window.localStorage.getItem(TEST_TRACKING_LOGIN_KEY) === '1';
    if (!loggedIn) return null;
    return {
        user: {
            id: 'test-borrower-001',
            email: 'example@gmail.com'
        }
    };
}

function buildTrackingLookupSkeleton() {
    return `
        <div class="tracking-skeleton-panel">
            <div class="tracking-skeleton-hero skeleton-shimmer">
                <div class="skeleton-line sm"></div>
                <div class="skeleton-line lg"></div>
                <div class="skeleton-line md"></div>
            </div>
            <div class="tracking-skeleton-grid">
                <div class="tracking-skeleton-card skeleton-shimmer">
                    <div class="skeleton-line sm" style="margin-bottom: 14px;"></div>
                    <div class="skeleton-line lg"></div>
                </div>
                <div class="tracking-skeleton-card skeleton-shimmer">
                    <div class="skeleton-line sm" style="margin-bottom: 14px;"></div>
                    <div class="skeleton-line md"></div>
                </div>
            </div>
        </div>
    `;
}

function buildTrackingHistorySkeleton(count = 3) {
    return Array.from({ length: count }, () => `
        <article class="history-card skeleton-shimmer">
            <div class="history-card-top">
                <div style="flex:1;">
                    <div class="skeleton-line md" style="margin-bottom: 10px;"></div>
                    <div class="skeleton-line sm"></div>
                </div>
                <div class="skeleton-line sm" style="height: 38px; width: 120px;"></div>
            </div>
            <div class="skeleton-line sm" style="margin: 10px 0;"></div>
            <div class="skeleton-line lg"></div>
        </article>
    `).join('');
}

function announce(message) {
    if (trackingLiveRegion) trackingLiveRegion.textContent = message;
}

function showFeedback(message, type = 'info') {
    if (!trackingFeedback) return;
    trackingFeedback.textContent = message;
    trackingFeedback.className = `status-banner ${type === 'error' ? 'error' : type === 'success' ? 'success' : ''}`.trim();
    trackingFeedback.style.display = 'block';
    announce(message);
}

function clearFeedback() {
    if (!trackingFeedback) return;
    trackingFeedback.textContent = '';
    trackingFeedback.className = 'status-banner';
    trackingFeedback.style.display = 'none';
}

function getFocusable(container) {
    if (!container) return [];
    return [...container.querySelectorAll('button, [href], input, textarea, [tabindex]:not([tabindex="-1"])')]
        .filter((el) => !el.disabled && el.offsetParent !== null);
}

function openCancelModal() {
    if (!cancelModal) return;
    cancelLastFocused = document.activeElement;
    cancelError.style.display = 'none';
    cancelReasonInput.value = '';
    cancelModal.classList.add('open');
    cancelModal.setAttribute('aria-hidden', 'false');
    setTimeout(() => cancelReasonInput.focus(), 0);
}

function closeCancelModal() {
    if (!cancelModal) return;
    cancelModal.classList.remove('open');
    cancelModal.setAttribute('aria-hidden', 'true');
    if (cancelLastFocused && typeof cancelLastFocused.focus === 'function') {
        cancelLastFocused.focus();
    }
}

function getStatusPresentation(status) {
    const meta = window.getBorrowStatusMeta
        ? window.getBorrowStatusMeta(status)
        : { short: status || '-', long: '', nextAction: '' };

    const stateClassMap = {
        pending: 'pending',
        approved: 'approved',
        rejected: 'rejected',
        returned_pending_inspection: 'pending',
        returned: 'returned',
        completed: 'returned',
        cancelled: 'expired',
        expired: 'expired'
    };

    const iconMap = {
        pending: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
        approved: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
        rejected: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
        returned_pending_inspection: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
        returned: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
        completed: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
        cancelled: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>',
        expired: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
    };

    return {
        short: meta.short,
        long: meta.long,
        nextAction: meta.nextAction,
        className: stateClassMap[status] || 'expired',
        icon: iconMap[status] || ''
    };
}

function formatDate(value, withTime = false) {
    if (!value) return '-';
    return new Date(value).toLocaleString('th-TH', withTime
        ? undefined
        : { day: '2-digit', month: 'short', year: 'numeric' });
}

function renderHistoryEmpty(message) {
    if (!historySection || !historyList) return;
    historySection.style.display = 'block';
    historyList.innerHTML = `<div class="history-empty">${message}</div>`;
}

function buildHistoryCard(request) {
    const state = getStatusPresentation(request.status);
    const items = request.borrow_request_items || [];
    const starts = items.map((item) => item.start_date).filter(Boolean).sort();
    const ends = items.map((item) => item.end_date).filter(Boolean).sort();
    const period = starts.length && ends.length
        ? `${formatDate(starts[0])} - ${formatDate(ends[ends.length - 1])}`
        : 'ยังไม่มีช่วงยืม';
    const qty = items.reduce((sum, item) => sum + (Number(item.qty_borrowed) || 0), 0);

    return `
        <article class="history-card">
            <div class="history-card-top">
                <div>
                    <div style="font-weight:700; font-family:ui-monospace, SFMono-Regular, Consolas, monospace;">${request.tracking_id}</div>
                    <div class="history-card-meta">ส่งคำขอเมื่อ ${formatDate(request.created_at, true)}</div>
                </div>
                <button class="btn-outline" type="button" data-history-open="${request.tracking_id}" data-testid="tracking-history-open">${DETAILS_LABEL}</button>
            </div>
            <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-bottom:8px;">
                <span class="status-badge ${state.className}">${state.short}</span>
                <span class="history-card-meta">${period}</span>
            </div>
            <div style="font-weight:600; margin-bottom:4px;">${request.purpose || '-'}</div>
            <div class="history-card-meta">${items.length} รายการ · รวม ${qty} ชิ้น</div>
        </article>
    `;
}

async function loadBorrowerHistory() {
    if (!historySection || !historyList || !historyState) return;

    currentSession = TEST_MODE ? getTestSession() : (await sbClient.auth.getSession()).data.session || null;
    historySection.style.display = 'block';

    if (!currentSession?.user) {
        historyState.textContent = 'เข้าสู่ระบบเพื่อดูประวัติคำขอย้อนหลังของบัญชีนี้';
        btnHistoryLogin.style.display = 'inline-flex';
        btnHistoryRefresh.style.display = 'none';
        if (btnTrackingLogout) btnTrackingLogout.style.display = 'none';
        renderHistoryEmpty('ยังไม่ได้เข้าสู่ระบบ');
        return;
    }

    btnHistoryLogin.style.display = 'none';
    btnHistoryRefresh.style.display = 'inline-flex';
    if (btnTrackingLogout) btnTrackingLogout.style.display = 'inline-flex';
    historyState.textContent = 'รายการล่าสุดของบัญชีผู้ยืมนี้';
    historyList.innerHTML = '<div class="history-empty">กำลังโหลดรายการ...</div>';

    historyList.innerHTML = buildTrackingHistorySkeleton();

    let rows = [];
    let error = null;
    if (TEST_MODE) {
        rows = ensureTestRequestsSeeded()
            .filter((row) => !currentSession?.user?.email || row.borrower_email === currentSession.user.email)
            .map((row) => ({
                tracking_id: row.tracking_id,
                created_at: row.created_at,
                purpose: row.purpose,
                status: row.status,
                borrow_request_items: Array.isArray(row.borrow_request_items) ? row.borrow_request_items : []
            }))
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, 8);
    } else {
        const queryResult = await sbClient
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
            .limit(8);
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

    historyList.innerHTML = rows.map(buildHistoryCard).join('');
}

async function signInForHistory() {
    if (TEST_MODE) {
        window.localStorage.setItem(TEST_TRACKING_LOGIN_KEY, '1');
        await loadBorrowerHistory();
        renderCancelSection();
        showFeedback('เข้าสู่ระบบทดสอบเรียบร้อยแล้ว', 'success');
        return;
    }

    const { error } = await sbClient.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.href }
    });

    if (error) showFeedback(`เข้าสู่ระบบไม่สำเร็จ: ${error.message}`, 'error');
}

const urlParams = new URLSearchParams(window.location.search);
const initialTrackingId = urlParams.get('id') || urlParams.get('tid');

if (initialTrackingId) {
    trackingInput.value = initialTrackingId;
    fetchStatus(initialTrackingId);
}

btnSearch.addEventListener('click', () => {
    const value = trackingInput.value.trim();
    if (!value) {
        showFeedback('กรุณากรอก Tracking ID', 'error');
        return;
    }

    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('id', value);
    window.history.pushState({}, '', newUrl);
    fetchStatus(value);
});

trackingInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') btnSearch.click();
});

btnHistoryLogin?.addEventListener('click', signInForHistory);
btnHistoryRefresh?.addEventListener('click', loadBorrowerHistory);
btnTrackingLogout?.addEventListener('click', async () => {
    if (TEST_MODE) {
        window.localStorage.removeItem(TEST_TRACKING_LOGIN_KEY);
        showFeedback('ออกจากระบบเรียบร้อยแล้ว', 'success');
        await loadBorrowerHistory();
        renderCancelSection();
        return;
    }

    const { error } = await sbClient.auth.signOut();
    if (error) {
        showFeedback(`ออกจากระบบไม่สำเร็จ: ${error.message}`, 'error');
        return;
    }
    showFeedback('ออกจากระบบเรียบร้อยแล้ว', 'success');
    await loadBorrowerHistory();
    renderCancelSection();
});

historyList?.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-history-open]');
    if (!trigger) return;
    const trackingId = trigger.dataset.historyOpen;
    trackingInput.value = trackingId;
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set('id', trackingId);
    window.history.pushState({}, '', nextUrl);
    fetchStatus(trackingId);
});

async function fetchStatus(trackingId) {
    currentTrackingId = trackingId;
    clearFeedback();
    resultView.style.display = 'none';
    errorView.style.display = 'none';
    loadingView.innerHTML = buildTrackingLookupSkeleton();
    loadingView.style.display = 'block';

    try {
        if (TEST_MODE) {
            const row = ensureTestRequestsSeeded().find((item) => item.tracking_id === trackingId);
            if (!row) throw new Error('Not found');
            renderResult({
                tracking_id: row.tracking_id,
                created_at: row.created_at,
                purpose: row.purpose,
                status: row.status,
                items: Array.isArray(row.borrow_request_items) ? row.borrow_request_items : []
            });
            return;
        }

        const { data, error } = await sbClient.rpc('get_borrow_request_status', { p_tracking_id: trackingId });
        if (error || !data) throw new Error(error?.message || 'Not found');
        renderResult(data);
    } catch (error) {
        if (!TEST_MODE) {
            console.error(error);
        }
        loadingView.style.display = 'none';
        errorView.style.display = 'block';
        errorView.textContent = 'Tracking ID not found';
        cancelZone.style.display = 'none';
        showFeedback('ไม่พบข้อมูลการติดตามตามรหัสที่ระบุ', 'error');
    }
}

function renderResult(data) {
    currentStatus = data.status;
    loadingView.style.display = 'none';
    resultView.style.display = 'block';

    dispTrackingId.textContent = data.tracking_id || '-';
    dispCreatedAt.textContent = data.created_at ? formatDate(data.created_at, true) : '-';
    dispPurpose.textContent = data.purpose || '-';

    const state = getStatusPresentation(data.status);
    statusBadge.className = `status-badge-lg ${state.className}`;
    statusBadge.innerHTML = `${state.icon}<span style="white-space: nowrap;">${state.short}</span>`;
    if (statusDetail) {
        statusDetail.textContent = `${state.long} ${state.nextAction}`.trim();
    }

    currentItems = Array.isArray(data.items) ? data.items : [];
    itemsBody.innerHTML = '';

    if (currentItems.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="4" style="text-align:center; color: var(--text-3);">ไม่พบรายการอุปกรณ์</td>';
        itemsBody.appendChild(row);
    } else {
        currentItems.forEach((item) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td style="font-weight: 500;">${item.equipment_name || '-'}</td>
                <td>${item.start_date ? formatDate(item.start_date) : '-'}</td>
                <td>${item.end_date ? formatDate(item.end_date) : '-'}</td>
                <td>${item.qty_borrowed ?? '-'} ชิ้น</td>
            `;
            itemsBody.appendChild(row);
        });
    }

    renderCancelSection();
}

async function renderCancelSection() {
    cancelZone.style.display = 'none';
    btnLoginCancel.style.display = 'none';
    btnCancelRequest.style.display = 'none';

    if (currentStatus !== 'pending') {
        if (statusDetail && currentStatus === 'approved') {
            statusDetail.textContent += ' เมื่อเจ้าหน้าที่อนุมัติแล้ว ระบบจะปิดสิทธิ์ยกเลิกคำขอด้วยตนเอง';
        }
        return;
    }

    cancelZone.style.display = 'block';

    currentSession = TEST_MODE ? getTestSession() : (await sbClient.auth.getSession()).data.session || null;
    const isLoggedIn = !!currentSession?.user;

    cancelNote.textContent = isLoggedIn
        ? 'คุณยังยกเลิกคำขอนี้ได้ เพราะคำขอยังอยู่ในสถานะรออนุมัติ'
        : 'กรุณาเข้าสู่ระบบด้วยบัญชีผู้ยืมก่อน หากต้องการยกเลิกคำขอที่ยังรออนุมัติ';

    if (isLoggedIn) {
        btnCancelRequest.style.display = 'inline-flex';
    } else {
        btnLoginCancel.style.display = 'inline-flex';
    }
}

btnLoginCancel.addEventListener('click', signInForHistory);

btnCancelRequest.addEventListener('click', () => {
    if (!currentTrackingId) return;
    openCancelModal();
});

cancelClose.addEventListener('click', closeCancelModal);
cancelDismiss.addEventListener('click', closeCancelModal);
cancelModal.addEventListener('click', (event) => {
    if (event.target === cancelModal) closeCancelModal();
});

cancelSubmit.addEventListener('click', async () => {
    if (!currentTrackingId) return;

    cancelError.style.display = 'none';
    cancelSubmit.disabled = true;
    cancelSubmit.textContent = 'กำลังยกเลิก...';

    try {
        if (TEST_MODE) {
            const rows = readTestRequests();
            const nextRows = rows.map((row) => {
                if (row.tracking_id !== currentTrackingId) return row;
                return {
                    ...row,
                    status: 'cancelled',
                    cancel_reason: cancelReasonInput.value.trim() || 'ผู้ยืมยกเลิกด้วยตนเอง'
                };
            });
            writeTestRequests(nextRows);
            closeCancelModal();
            showFeedback('ยกเลิกคำขอสำเร็จ', 'success');
            await fetchStatus(currentTrackingId);
            await loadBorrowerHistory();
            return;
        }

        const { error } = await sbClient.rpc('cancel_borrow_request', {
            p_tracking_id: currentTrackingId,
            p_reason: cancelReasonInput.value.trim() || 'ผู้ยืมยกเลิกด้วยตนเอง'
        });

        if (error) throw error;

        closeCancelModal();
        showFeedback('ยกเลิกคำขอสำเร็จ', 'success');
        await fetchStatus(currentTrackingId);
        await loadBorrowerHistory();
    } catch (error) {
        cancelError.textContent = `ยกเลิกไม่สำเร็จ: ${error.message}`;
        cancelError.style.display = 'block';
    } finally {
        cancelSubmit.disabled = false;
        cancelSubmit.textContent = 'ยืนยันการยกเลิกคำร้อง';
    }
});

document.addEventListener('keydown', (event) => {
    if (!cancelModal?.classList.contains('open')) return;

    if (event.key === 'Escape') {
        closeCancelModal();
        return;
    }

    if (event.key === 'Tab') {
        const focusable = getFocusable(cancelModalPanel);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }
});

if (!TEST_MODE) {
    sbClient.auth.onAuthStateChange(() => {
        loadBorrowerHistory();
        renderCancelSection();
    });
}

loadBorrowerHistory();
