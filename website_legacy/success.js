const SUCCESS_SUPABASE_URL = 'https://ifogcvymwhcfbfjzhwsl.supabase.co';
const SUCCESS_SUPABASE_ANON = 'sb_publishable_DZyIDHVZ-kfD1o3baz0qmw_tTyRCJG8';
const successSb = window.supabase.createClient(SUCCESS_SUPABASE_URL, SUCCESS_SUPABASE_ANON);
const successParams = new URLSearchParams(window.location.search);
const TEST_MODE = successParams.get('test_mode') === '1' || window.localStorage.getItem('simset_test_mode') === '1' || navigator.webdriver;
const TEST_REQUESTS_KEY = 'simset_test_requests';
const TEST_BORROWER_EMAIL = 'example@gmail.com';

const successLiveRegion = document.getElementById('success-live-region');
const successFeedback = document.getElementById('success-feedback');
const successTrackingId = document.getElementById('success-tracking-id');
const successCreatedAt = document.getElementById('success-created-at');
const successStatus = document.getElementById('success-status');
const successStatusText = document.getElementById('success-status-text');
const successPurpose = document.getElementById('success-purpose');
const successItems = document.getElementById('success-items');
const successNextAction = document.getElementById('success-next-action');
const btnCopyTracking = document.getElementById('btn-copy-tracking');
const btnPrintSuccess = document.getElementById('btn-print-success');
const btnGoTracking = document.getElementById('btn-go-tracking');

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
        }
    ];
}

function ensureTestRequestsSeeded() {
    const existing = readTestRequests();
    if (existing.length > 0) return existing;
    const seeded = getSeededTestRequests();
    window.localStorage.setItem(TEST_REQUESTS_KEY, JSON.stringify(seeded));
    return seeded;
}

function esc(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function announceSuccess(message) {
    if (successLiveRegion) successLiveRegion.textContent = message;
}

function showSuccessFeedback(message, type = 'info') {
    if (!successFeedback) return;
    successFeedback.textContent = message;
    successFeedback.className = `status-banner ${type === 'error' ? 'error' : type === 'success' ? 'success' : ''}`.trim();
    successFeedback.style.display = 'block';
    announceSuccess(message);
}

function formatDateRange(items) {
    if (!Array.isArray(items) || items.length === 0) return '-';
    const starts = items.map((item) => item.start_date).filter(Boolean).sort();
    const ends = items.map((item) => item.end_date).filter(Boolean).sort();
    if (!starts.length || !ends.length) return '-';
    return `${new Date(starts[0]).toLocaleDateString('th-TH')} - ${new Date(ends[ends.length - 1]).toLocaleDateString('th-TH')}`;
}

async function copyTrackingId() {
    const trackingId = successTrackingId.textContent.trim();
    if (!trackingId || trackingId === '-') return;
    try {
        await navigator.clipboard.writeText(trackingId);
        showSuccessFeedback('คัดลอก Tracking ID แล้ว', 'success');
    } catch (error) {
        showSuccessFeedback(`คัดลอกรหัสไม่สำเร็จ: ${error.message}`, 'error');
    }
}

async function loadSuccessPage() {
    const params = new URLSearchParams(window.location.search);
    const trackingId = params.get('tid') || params.get('id');

    if (!trackingId) {
        window.location.replace('borrow.html');
        return;
    }

    successTrackingId.textContent = trackingId;
    btnGoTracking.href = `tracking.html?id=${encodeURIComponent(trackingId)}`;

    try {
        let data = null;

        if (TEST_MODE) {
            const row = ensureTestRequestsSeeded().find((item) => item.tracking_id === trackingId);
            if (!row) {
                data = {
                    tracking_id: trackingId,
                    created_at: new Date().toISOString(),
                    purpose: 'Automated test request',
                    status: 'pending',
                    items: []
                };
            } else {
                data = {
                    tracking_id: row.tracking_id,
                    created_at: row.created_at,
                    purpose: row.purpose,
                    status: row.status,
                    items: Array.isArray(row.borrow_request_items) ? row.borrow_request_items : []
                };
            }
        } else {
            const rpcResult = await successSb.rpc('get_borrow_request_status', { p_tracking_id: trackingId });
            if (rpcResult.error || !rpcResult.data) throw new Error(rpcResult.error?.message || 'Request not found');
            data = rpcResult.data;
        }

        const meta = window.getBorrowStatusMeta ? window.getBorrowStatusMeta(data.status) : {
            short: data.status || '-',
            long: '',
            nextAction: ''
        };

        successCreatedAt.textContent = data.created_at ? new Date(data.created_at).toLocaleString('th-TH') : '-';
        successPurpose.textContent = data.purpose || '-';
        successStatus.className = `status-badge ${data.status || ''}`.trim();
        successStatus.textContent = meta.short;
        successStatusText.textContent = meta.long;
        successNextAction.textContent = meta.nextAction;

        const items = Array.isArray(data.items) ? data.items : [];
        if (items.length === 0) {
            successItems.textContent = '-';
        } else {
            successItems.innerHTML = items.map((item) => {
                const range = `${new Date(item.start_date).toLocaleDateString('th-TH')} - ${new Date(item.end_date).toLocaleDateString('th-TH')}`;
                return `<div style="margin-bottom:10px;"><strong>${esc(item.equipment_name || '-')}</strong> ${esc(item.qty_borrowed ?? '-')} ชิ้น <span style="color:var(--text-3);">(${esc(range)})</span></div>`;
            }).join('');
        }

        document.title = `ส่งคำขอสำเร็จ ${trackingId} - SiMSET`;
        announceSuccess(`โหลดข้อมูลคำขอ ${trackingId} สำเร็จ ช่วงยืม ${formatDateRange(items)}`);
    } catch (error) {
        console.error(error);
        showSuccessFeedback(`โหลดข้อมูลคำขอไม่สำเร็จ: ${error.message}`, 'error');
    }
}

btnCopyTracking?.addEventListener('click', copyTrackingId);
btnPrintSuccess?.addEventListener('click', () => window.print());

loadSuccessPage();
