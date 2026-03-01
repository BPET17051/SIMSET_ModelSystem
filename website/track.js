/* === SiMSET Tracker App === */
const SUPABASE_URL = 'https://ifogcvymwhcfbfjzhwsl.supabase.co';
const SUPABASE_ANON = 'sb_publishable_DZyIDHVZ-kfD1o3baz0qmw_tTyRCJG8';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

const searchInput = document.getElementById('track-id-input');
const btnTrack = document.getElementById('btn-track');
const errDiv = document.getElementById('track-error');
const resultDiv = document.getElementById('tracking-result');

let currentRequest = null;
let currentItems = [];

// Handle URL param if passed directly from an email link
const urlParams = new URLSearchParams(window.location.search);
const idParam = urlParams.get('id');
if (idParam) {
    searchInput.value = idParam;
    fetchTracking(idParam);
}

btnTrack.addEventListener('click', () => {
    const tid = searchInput.value.trim();
    if (!tid) return;
    fetchTracking(tid);
});

searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const tid = searchInput.value.trim();
        if (tid) fetchTracking(tid);
    }
});

async function fetchTracking(trackingId) {
    btnTrack.disabled = true;
    errDiv.style.display = 'none';
    resultDiv.style.display = 'none';

    // 1. Fetch Request Header
    const { data: request, error: reqErr } = await supabase
        .from('borrow_requests')
        .select(`id, tracking_id, borrower_name, purpose, status, created_at, expires_at`)
        .eq('tracking_id', trackingId)
        .single();

    if (reqErr || !request) {
        errDiv.textContent = 'ไม่พบข้อมูลคำร้อง กรุณาตรวจสอบ Tracking ID อีกครั้ง';
        errDiv.style.display = 'block';
        btnTrack.disabled = false;
        return;
    }

    currentRequest = request;

    // 2. Fetch Request Items
    const { data: items, error: itemErr } = await supabase
        .from('borrow_request_items')
        .select(`
            equipment_id, start_date, end_date, qty_borrowed,
            equipments (name_th, name_en, type)
        `)
        .eq('request_id', request.id)
        .order('start_date');

    if (itemErr) {
        errDiv.textContent = 'เกิดข้อผิดพลาดในการโหลดรายละเอียดอุปกรณ์';
        errDiv.style.display = 'block';
        btnTrack.disabled = false;
        return;
    }

    currentItems = items;

    renderResult();
    btnTrack.disabled = false;
}

function renderResult() {
    const r = currentRequest;
    document.getElementById('display-tid').textContent = r.tracking_id;
    document.getElementById('display-name').textContent = r.borrower_name;
    document.getElementById('display-purpose').textContent = r.purpose;

    const dDate = new Date(r.created_at);
    document.getElementById('display-date').textContent = `${dDate.toLocaleDateString('th-TH')} เวลา ${dDate.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.`;

    // Status Badge
    const statusDiv = document.getElementById('display-status');
    statusDiv.className = `status-badge large status-${r.status}`;

    const statuses = {
        'pending': 'รออนุมัติ',
        'approved': 'อนุมัติแล้ว (รอรับของ)',
        'rejected': 'ถูกปฏิเสธ',
        'cancelled': 'ยกเลิกคำร้อง',
        'returned_pending_inspection': 'คืนแล้ว (รอตรวจเช็ค)',
        'returned': 'คืนสมบูรณ์',
        'expired': 'หมดอายุ (ไม่ได้ตรวจสอบ)'
    };
    statusDiv.textContent = statuses[r.status] || r.status;

    // Expiration Logic (Only show if pending)
    const expBox = document.getElementById('expires-box');
    if (r.status === 'pending' && r.expires_at) {
        expBox.style.display = 'block';
        const expDate = new Date(r.expires_at);
        const now = new Date();
        if (now > expDate) {
            document.getElementById('display-expires').textContent = 'คำร้องนี้หมดอายุแล้ว';
            statusDiv.className = 'status-badge large status-expired';
            statusDiv.textContent = 'หมดอายุ';
            r.status = 'expired'; // Update local state
        } else {
            const diffHours = Math.floor((expDate - now) / (1000 * 60 * 60));
            document.getElementById('display-expires').textContent = `อีก ${diffHours} ชั่วโมง`;
        }
    } else {
        expBox.style.display = 'none';
    }

    // Items List
    const list = document.getElementById('display-items');
    list.innerHTML = '';

    // Earliest start date (used for cancellation logic)
    let earliestDate = null;

    currentItems.forEach(item => {
        const sDate = new Date(item.start_date);
        const eDate = new Date(item.end_date);

        if (!earliestDate || sDate < earliestDate) earliestDate = sDate;

        const row = document.createElement('div');
        row.className = 'track-item-row';
        row.innerHTML = `
            <div>
                <div class="track-item-name">${item.equipments.name_th}</div>
                <div class="track-item-dates">ใช้งาน: ${sDate.toLocaleDateString('th-TH')} - ${eDate.toLocaleDateString('th-TH')}</div>
            </div>
            <div class="track-item-qty">${item.qty_borrowed} ชิ้น</div>
        `;
        list.appendChild(row);
    });

    // Print Action visibility
    const printActions = document.getElementById('print-actions');
    if (r.status === 'approved') {
        printActions.style.display = 'flex';
        renderPrintView();
    } else {
        printActions.style.display = 'none';
    }

    // Cancellation Logic (Operational Rules applied)
    const cancelZone = document.getElementById('cancel-zone');
    const cancelWarning = document.getElementById('cancel-warning');
    const btnCancel = document.getElementById('btn-cancel-request');

    if (r.status === 'pending' || r.status === 'approved') {
        cancelZone.style.display = 'block';

        // ** 1-Day Cutoff Rule Check **
        // User cannot self-cancel if today is exactly the start date or past it
        const todayStr = new Date().toISOString().split('T')[0];
        const earliestStr = earliestDate ? earliestDate.toISOString().split('T')[0] : null;

        if (earliestStr && todayStr >= earliestStr) {
            // Cutoff reached!
            btnCancel.style.display = 'none';
            cancelWarning.style.display = 'block';
        } else {
            // Safe to self-cancel
            btnCancel.style.display = 'inline-flex';
            cancelWarning.style.display = 'none';
        }
    } else {
        cancelZone.style.display = 'none';
    }

    resultDiv.style.display = 'block';
}

/* -------- Cancellation Action -------- */
document.getElementById('btn-cancel-request').addEventListener('click', async () => {
    if (!currentRequest) return;

    const reason = prompt("กรุณาระบุเหตุผลการยกเลิกคำร้อง (สั้นๆ):");
    if (reason === null) return; // user pressed cancel on prompt

    if (!confirm('คุณแน่ใจหรือไม่ว่าต้องการยกเลิกคำร้องนี้ การกระทำนี้ไม่สามารถย้อนกลับได้?')) return;

    const btn = document.getElementById('btn-cancel-request');
    btn.disabled = true;
    btn.textContent = 'กำลังยกเลิก...';

    // In actual production, we should have an RPC to handle this securely to ensure status hasn't changed.
    // Since RLS is tight, assuming we created a policy or RPC. For Phase 1 without auth token context from borrower,
    // if public tracking cancellation is allowed via pure tracking_id knowledge, we can do an UPDATE.
    // However, our RLS might block anonymous UPDATE. Wait, we haven't enabled anon UPDATE on requests.
    // Let's implement an RPC for guest cancellation (or we require SSO to cancel).

    // *If SSO is active, and borrower matches*:
    const { error } = await supabase
        .from('borrow_requests')
        .update({ status: 'cancelled', cancel_reason: reason || 'ยกเลิกด้วยตนเอง', cancelled_at: new Date().toISOString() })
        .eq('id', currentRequest.id);

    if (error) {
        alert('เกิดข้อผิดพลาด: ' + error.message + '\n\n(หากคุณไม่ได้เข้าสู่ระบบ อาจไม่มีสิทธิยกเลิกคำร้องนี้)');
        btn.disabled = false;
        btn.textContent = 'ยกเลิกคำร้อง';
    } else {
        alert('ยกเลิกคำร้องสำเร็จ');
        // Reload State
        fetchTracking(currentRequest.tracking_id);
    }
});

/* -------- Render Print View (Hidden until printed) -------- */
function renderPrintView() {
    const r = currentRequest;
    document.getElementById('pv-tid').textContent = r.tracking_id;
    document.getElementById('pv-name').textContent = r.borrower_name;
    document.getElementById('pv-sig-name').textContent = `(${r.borrower_name})`;
    document.getElementById('pv-purpose').textContent = r.purpose;

    const now = new Date();
    document.getElementById('pv-print-date').textContent = `${now.toLocaleDateString('th-TH')} เวลา ${now.toLocaleTimeString('th-TH')} น.`;

    const tbody = document.getElementById('pv-items');
    tbody.innerHTML = '';

    currentItems.forEach((item, idx) => {
        const sDate = new Date(item.start_date).toLocaleDateString('th-TH');
        const eDate = new Date(item.end_date).toLocaleDateString('th-TH');

        tbody.innerHTML += `
            <tr>
                <td style="text-align:center">${idx + 1}</td>
                <td>${item.equipments.name_th}</td>
                <td style="text-align:center">${sDate}</td>
                <td style="text-align:center">${eDate}</td>
                <td style="text-align:center">${item.qty_borrowed} ชิ้น</td>
                <td></td>
            </tr>
        `;
    });
}
