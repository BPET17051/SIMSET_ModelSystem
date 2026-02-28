/* ===== SIMSET Admin Panel — admin.js ===== */

const SUPABASE_URL = 'https://ifogcvymwhcfbfjzhwsl.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_DZyIDHVZ-kfD1o3baz0qmw_tTyRCJG8';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const STATUS_TH = {
    ready: 'ใช้งานได้ปกติ',
    in_use: 'ถูกยืม',
    maintenance: 'รอซ่อม (ใช้ได้)',
    broken: 'รอซ่อม (เสีย)',
    missing: 'รอจำหน่าย',
    cleaning: 'ทำความสะอาด'
};

const PAGE_SIZE = 50;
let reviewPage = 1, manikinPage = 1;
let allLocations = [];
let currentUser = null;

/* ===== SECURE HELPERS ===== */
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function createConfirmMsg(text1, strongTxt, text2, text3 = 'การดำเนินการนี้ไม่สามารถย้อนกลับได้') {
    const frag = document.createDocumentFragment();
    frag.append(text1);
    const s = document.createElement('strong');
    s.textContent = strongTxt;
    frag.append(s, text2);
    if (text3) {
        frag.append(document.createElement('br'), text3);
    }
    return frag;
}

// Write an audit log entry to the audit_logs table.
// Options: { strict: boolean } — if true, throws an error if logging fails (blocking).
async function insertAuditLog(action, targetIds, note = null, options = { strict: false }) {
    const { error } = await sb.from('audit_logs').insert({
        action,
        actor_email: currentUser?.email || 'unknown',
        target_ids: targetIds,
        note
    });
    if (error) {
        console.error('[AuditLog] Failed to write log:', error.message);
        if (options.strict) {
            throw new Error(`Audit log required but failed: ${error.message}`);
        } else {
            showToast('⚠️ บันทึก Audit Log ล้มเหลว (กรุณาแจ้ง IT)', 'error');
        }
    }
}

/* ===== AUTH CHECK ===== */
async function checkAuth() {
    const { data } = await sb.auth.getSession();
    if (!data.session) {
        window.location.href = 'index.html';
        return;
    }
    currentUser = data.session.user;

    // Verify admin role from app_metadata (set server-side in Supabase Dashboard)
    // This is a client-side gate; the DB-level gate is enforced by RLS policies.
    const role = currentUser.app_metadata?.role;
    if (role !== 'admin') {
        console.warn('[Auth] Access denied: user is not admin (role:', role, ')');
        await sb.auth.signOut();
        window.location.href = 'index.html?error=unauthorized';
        return;
    }

    const email = currentUser.email || '';
    document.getElementById('user-email').textContent = email;
    document.getElementById('user-avatar').textContent = email.charAt(0).toUpperCase();
}

document.getElementById('logout-btn').addEventListener('click', async () => {
    await sb.auth.signOut();
    window.location.href = 'index.html';
});

/* ===== NAVIGATION ===== */
const tabMeta = {
    dashboard: { title: 'Dashboard', sub: 'ภาพรวมสถานะคลังหุ่นจำลอง' },
    review: { title: 'รออนุมัติ', sub: 'หุ่นที่ดึงมาจาก Google Sheet รอการตรวจสอบ' },
    manikins: { title: 'คลังหุ่นทั้งหมด', sub: 'แก้ไขสถานะ ที่ตั้ง และหมายเหตุ' },
    locations: { title: 'สถานที่ / ห้อง', sub: 'จัดการข้อมูลอาคารและห้องเก็บหุ่น' },
    reports: { title: 'รายงานและสถิติ', sub: 'สรุปข้อมูลคลังหุ่นในภาพรวม' }
};

function switchTab(tabName) {
    document.querySelectorAll('.sidebar-link').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));

    const navEl = document.querySelector(`[data-tab="${tabName}"]`);
    if (navEl) navEl.classList.add('active');

    const paneEl = document.getElementById(`tab-${tabName}`);
    if (paneEl) paneEl.classList.add('active');

    const meta = tabMeta[tabName] || {};
    document.getElementById('topbar-title').textContent = meta.title || tabName;
    document.getElementById('topbar-sub').textContent = meta.sub || '';

    if (tabName === 'dashboard') loadDashboard();
    if (tabName === 'review') { reviewPage = 1; loadReviewQueue(); }
    if (tabName === 'manikins') { manikinPage = 1; loadManikins(); }
    if (tabName === 'locations') loadLocations();
    if (tabName === 'reports') loadReports();
}

document.querySelectorAll('.sidebar-link').forEach(el => {
    el.addEventListener('click', () => switchTab(el.dataset.tab));
});

/* ===== AGE DETECTION ===== */
function detectAge(name) {
    const n = (name || '').toLowerCase();
    if (n.includes('ทารก') || n.includes('infant') || n.includes('baby') || n.includes('neonatal')) return 'infant';
    if (n.includes('เด็ก') || n.includes('child') || n.includes('paediatric') || n.includes('junior')) return 'child';
    if (n.includes('ผู้ใหญ่') || n.includes('adult') || n.includes('anne')) return 'adult';
    return 'other';
}
const ageTh = { adult: 'ผู้ใหญ่', child: 'เด็ก', infant: 'ทารก', other: 'อื่นๆ' };
const ageEmoji = { adult: '🧑', child: '👦', infant: '👶', other: '🤖' };

function agePill(name) {
    const a = detectAge(name);
    return `<span class="age-pill ${a}">${ageEmoji[a]} ${ageTh[a]}</span>`;
}

function statusBadge(s) {
    return `<span class="sb ${esc(s)}">${esc(STATUS_TH[s] || s)}</span>`;
}

/* ===== TOAST ===== */
function showToast(msg, type = 'success') {
    const el = document.getElementById('toast');
    el.className = `toast ${type} show`;
    document.getElementById('toast-icon').textContent = type === 'success' ? '✓' : '✕';
    document.getElementById('toast-msg').textContent = msg;
    setTimeout(() => el.classList.remove('show'), 3500);
}

/* ===== TIMESTAMP ===== */
function setSync() {
    const t = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    document.getElementById('last-sync').textContent = `ล่าสุด ${t} น.`;
}

/* ===== MODAL HELPERS (animated) ===== */
function openModal(id) {
    const overlay = document.getElementById(id);
    overlay.classList.remove('hidden');
    requestAnimationFrame(() => {
        requestAnimationFrame(() => overlay.classList.add('visible'));
    });
}

function closeModal(id) {
    const overlay = document.getElementById(id);
    overlay.classList.remove('visible');
    setTimeout(() => overlay.classList.add('hidden'), 300);
}

/* ===== CUSTOM CONFIRM DIALOG ===== */
let _confirmResolve = null;

function showConfirm({ title, messageNode, okText, okClass }) {
    document.getElementById('confirm-title').textContent = title || 'ยืนยันการดำเนินการ';
    const msgContainer = document.getElementById('confirm-msg');
    msgContainer.innerHTML = '';
    if (messageNode) {
        msgContainer.appendChild(messageNode);
    } else {
        msgContainer.textContent = 'คุณแน่ใจหรือไม่?';
    }
    const okBtn = document.getElementById('confirm-ok');
    okBtn.textContent = okText || 'ยืนยัน';
    okBtn.className = 'btn ' + (okClass || 'btn-danger');
    openModal('confirm-dialog');
    return new Promise(resolve => { _confirmResolve = resolve; });
}

document.getElementById('confirm-ok').addEventListener('click', () => {
    closeModal('confirm-dialog');
    if (_confirmResolve) { _confirmResolve(true); _confirmResolve = null; }
});
document.getElementById('confirm-cancel').addEventListener('click', () => {
    closeModal('confirm-dialog');
    if (_confirmResolve) { _confirmResolve(false); _confirmResolve = null; }
});
document.getElementById('confirm-dialog').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
        closeModal('confirm-dialog');
        if (_confirmResolve) { _confirmResolve(false); _confirmResolve = null; }
    }
});

/* ===== HELPERS ===== */
function buildPagination(containerId, total, current, onPage) {
    const totalPages = Math.ceil(total / PAGE_SIZE);
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = '';
    if (totalPages <= 1) return;

    const info = document.createElement('span');
    info.className = 'page-info';
    info.textContent = `รายการ ${(current - 1) * PAGE_SIZE + 1}–${Math.min(current * PAGE_SIZE, total)} จาก ${total}`;
    el.appendChild(info);

    const prev = document.createElement('button');
    prev.className = 'page-btn';
    prev.textContent = '← ก่อน';
    prev.disabled = current <= 1;
    prev.onclick = () => onPage(current - 1);
    el.appendChild(prev);

    for (let p = Math.max(1, current - 2); p <= Math.min(totalPages, current + 2); p++) {
        const btn = document.createElement('button');
        btn.className = 'page-btn' + (p === current ? ' active' : '');
        btn.textContent = p;
        btn.dataset.page = p;
        el.appendChild(btn);
    }

    const next = document.createElement('button');
    next.className = 'page-btn';
    next.textContent = 'ถัดไป →';
    next.disabled = current >= totalPages;
    next.onclick = () => onPage(current + 1);
    el.appendChild(next);
}

function renderBars(containerId, data, colorFn) {
    const total = data.reduce((s, d) => s + d.count, 0) || 1;
    document.getElementById(containerId).innerHTML = DOMPurify.sanitize(data.map(d => `
    <div class="bar-row">
      <div class="bar-label" title="${esc(d.label)}">${esc(d.label)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${(d.count / total * 100).toFixed(1)}%;background:${colorFn(d.key)}"></div></div>
      <div class="bar-count">${d.count}</div>
    </div>
  `).join(''));
}

/* ===== TAB 1: DASHBOARD ===== */
async function loadDashboard() {
    const { data, error } = await sb.from('manikins')
        .select('status, needs_review, asset_name')
        .eq('is_active', true);

    if (error) { showToast('โหลด Dashboard ล้มเหลว', 'error'); return; }

    const all = data.filter(m => !m.needs_review);
    const reviewCount = data.filter(m => m.needs_review).length;

    document.getElementById('d-total').textContent = all.length;
    document.getElementById('d-ready').textContent = all.filter(m => m.status === 'ready').length;
    document.getElementById('d-maintenance').textContent = all.filter(m => m.status === 'maintenance').length;
    document.getElementById('d-broken').textContent = all.filter(m => m.status === 'broken').length;
    document.getElementById('d-review').textContent = reviewCount;
    document.getElementById('review-badge').textContent = reviewCount;

    // Status bars
    const statusKeys = ['ready', 'in_use', 'maintenance', 'broken', 'missing'];
    const statusColors = { ready: '#22c55e', in_use: '#a78bfa', maintenance: '#f59e0b', broken: '#ef4444', missing: '#94a3b8' };
    renderBars('status-bars', statusKeys.map(k => ({
        key: k, label: STATUS_TH[k] || k, count: all.filter(m => m.status === k).length
    })).filter(d => d.count > 0), k => statusColors[k] || '#888');

    // Age bars
    const ageGroups = { adult: 0, child: 0, infant: 0, other: 0 };
    all.forEach(m => ageGroups[detectAge(m.asset_name)]++);
    const ageColors = { adult: '#4a9fd4', child: '#fbbf24', infant: '#a78bfa', other: '#94a3b8' };
    renderBars('age-bars', Object.entries(ageGroups).map(([k, c]) => ({
        key: k, label: `${ageEmoji[k]} ${ageTh[k]}`, count: c
    })).filter(d => d.count > 0), k => ageColors[k] || '#888');

    // Mini review table
    const { data: reviewData } = await sb.from('manikins').select('sap_id, asset_name').eq('is_active', true).eq('needs_review', true).limit(5);
    const tbody = document.getElementById('dash-review-tbody');
    if (!reviewData || reviewData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="tbl-empty">✅ ไม่มีรายการรออนุมัติ</td></tr>';
    } else {
        tbody.innerHTML = DOMPurify.sanitize(reviewData.map(m => `
      <tr>
        <td class="sap-code">${esc(m.sap_id)}</td>
        <td class="asset-name-cell"><div class="asset-name-text">${esc(m.asset_name) || '—'}</div></td>
        <td>${agePill(m.asset_name)}</td>
        <td><button class="btn btn-success btn-sm" data-action="approve" data-id="${esc(m.sap_id)}">✓ อนุมัติ</button></td>
      </tr>
    `).join(''));
    }
    setSync();
}

/* ===== TAB 2: REVIEW QUEUE ===== */
let reviewData = [];
let reviewFiltered = [];

async function loadReviewQueue() {
    document.getElementById('review-tbody').innerHTML = '<tr><td colspan="6" class="tbl-loading"><span class="spinner-sm"></span>โหลดข้อมูล...</td></tr>';
    const { data, error } = await sb.from('manikins')
        .select('sap_id, team_code, asset_name, asset_code')
        .eq('is_active', false)
        .eq('needs_review', true)
        .order('asset_name');

    if (error) { showToast('โหลดคิวรออนุมัติล้มเหลว', 'error'); return; }
    reviewData = data || [];
    reviewFiltered = [...reviewData];
    reviewPage = 1;
    renderReviewTable();
    document.getElementById('review-badge').textContent = reviewData.length;
    setSync();
}

function renderReviewTable() {
    const start = (reviewPage - 1) * PAGE_SIZE;
    const page = reviewFiltered.slice(start, start + PAGE_SIZE);
    const tbody = document.getElementById('review-tbody');

    if (page.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="tbl-empty">✅ ไม่มีรายการรออนุมัติ</td></tr>';
        document.getElementById('review-pagination').innerHTML = '';
        hideBulkBar();
        return;
    }

    tbody.innerHTML = DOMPurify.sanitize(page.map(m => `
    <tr>
      <td><input type="checkbox" class="review-cb" data-sap="${esc(m.sap_id)}" /></td>
      <td class="sap-code">${esc(m.sap_id)}</td>
      <td class="asset-name-cell"><div class="asset-name-text">${esc(m.asset_name) || '—'}</div></td>
      <td>${agePill(m.asset_name)}</td>
      <td class="sap-code">${esc(m.asset_code) || '—'}</td>
      <td style="display:flex;gap:6px">
        <button class="btn btn-success btn-sm" data-action="approve" data-id="${esc(m.sap_id)}">✓ อนุมัติ</button>
        <button class="btn btn-danger btn-sm" data-action="reject" data-id="${esc(m.sap_id)}">✕ ปฏิเสธ</button>
      </td>
    </tr>
  `).join(''));

    buildPagination('review-pagination', reviewFiltered.length, reviewPage, (p) => { reviewPage = p; renderReviewTable(); });
}

/* ==== BULK ACTION BAR LOGIC ==== */
function updateBulkBar() {
    const checked = [...document.querySelectorAll('.review-cb:checked')];
    const count = checked.length;
    if (count === 0) {
        hideBulkBar();
        return;
    }
    const bar = document.getElementById('bulk-action-bar');
    document.getElementById('bulk-count').textContent = count;
    if (bar.classList.contains('hidden')) {
        bar.classList.remove('hidden');
        requestAnimationFrame(() => requestAnimationFrame(() => bar.classList.add('visible')));
    }
}

function hideBulkBar() {
    const bar = document.getElementById('bulk-action-bar');
    bar.classList.remove('visible');
    setTimeout(() => bar.classList.add('hidden'), 300);
    // uncheck select-all
    const sa = document.getElementById('review-select-all');
    if (sa) sa.checked = false;
}

document.getElementById('review-search').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    reviewFiltered = reviewData.filter(m => !q || m.asset_name?.toLowerCase().includes(q) || m.sap_id?.includes(q));
    reviewPage = 1;
    renderReviewTable();
});

document.getElementById('review-select-all').addEventListener('change', (e) => {
    document.querySelectorAll('.review-cb').forEach(cb => cb.checked = e.target.checked);
    updateBulkBar();
});

// Old "approve all shown" button — now approve only checked
document.getElementById('btn-approve-all').addEventListener('click', async () => {
    const checked = [...document.querySelectorAll('.review-cb:checked')].map(cb => cb.dataset.sap);
    if (checked.length === 0) { showToast('กรุณาเลือกรายการก่อน', 'error'); return; }
    await bulkApprove(checked);
});

// Floating bar — approve
document.getElementById('btn-bulk-approve').addEventListener('click', async () => {
    const checked = [...document.querySelectorAll('.review-cb:checked')].map(cb => cb.dataset.sap);
    if (checked.length === 0) return;
    await bulkApprove(checked);
});

// Floating bar — reject
document.getElementById('btn-bulk-reject').addEventListener('click', async () => {
    const checked = [...document.querySelectorAll('.review-cb:checked')].map(cb => cb.dataset.sap);
    if (checked.length === 0) return;
    const ok = await showConfirm({
        title: 'ปฏิเสธแบบกลุ่ม',
        messageNode: createConfirmMsg('ยืนยันปฏิเสธและลบ ', checked.length + ' รายการ', ' ออกจากระบบ?'),
        okText: 'ลบ ' + checked.length + ' รายการ',
        okClass: 'btn-danger'
    });
    if (!ok) return;
    await bulkReject(checked);
});

// Floating bar — clear
document.getElementById('btn-bulk-clear').addEventListener('click', () => {
    document.querySelectorAll('.review-cb').forEach(cb => cb.checked = false);
    hideBulkBar();
});

async function approveOne(sapId) {
    const { error } = await sb.from('manikins')
        .update({ is_active: true, needs_review: false, status: 'ready' })
        .eq('sap_id', sapId)
        .eq('needs_review', true); // DB Guard

    if (error) { showToast('อนุมัติล้มเหลว: ' + error.message, 'error'); return; }
    await insertAuditLog('approve_one', [sapId]); // Warn-only
    showToast('อนุมัติ ' + sapId + ' สำเร็จ');

    reviewData = reviewData.filter(m => m.sap_id !== sapId);
    reviewFiltered = reviewFiltered.filter(m => m.sap_id !== sapId);
    renderReviewTable();
    document.getElementById('review-badge').textContent = reviewData.length;
    document.getElementById('d-review').textContent = reviewData.length;
}

async function rejectOne(sapId) {
    const ok = await showConfirm({
        title: 'ปฏิเสธและลบรายการ',
        messageNode: createConfirmMsg('ยืนยันปฏิเสธและลบ ', sapId, ' ออกจากระบบ?'),
        okText: 'ลบออก',
        okClass: 'btn-danger'
    });
    if (!ok) return;

    try {
        // Strict audit log for destructive action — throws on fail!
        await insertAuditLog('reject_one', [sapId], '', { strict: true });

        // Soft delete: mark as deleted instead of hard DELETE
        const { error } = await sb.from('manikins')
            .update({ deleted_at: new Date().toISOString(), is_active: false })
            .eq('sap_id', sapId)
            .eq('needs_review', true); // DB Guard

        if (error) { showToast('ลบล้มเหลว: ' + error.message, 'error'); return; }

        showToast('ลบ ' + sapId + ' ออกจากระบบแล้ว (สามารถกู้คืนได้)');
        reviewData = reviewData.filter(m => m.sap_id !== sapId);
        reviewFiltered = reviewFiltered.filter(m => m.sap_id !== sapId);
        renderReviewTable();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function bulkApprove(sapIds) {
    // Client-side Guard: Only allow IDs that are actually in the current reviewData
    const validIds = sapIds.filter(id => reviewData.some(m => m.sap_id === id));
    if (validIds.length === 0) return;

    const { error } = await sb.from('manikins')
        .update({ is_active: true, needs_review: false, status: 'ready' })
        .in('sap_id', validIds)
        .eq('needs_review', true); // DB Guard

    if (error) { showToast('อนุมัติล้มเหลว', 'error'); return; }
    await insertAuditLog('bulk_approve', validIds); // Warn-only
    showToast('อนุมัติ ' + validIds.length + ' รายการสำเร็จ');

    reviewData = reviewData.filter(m => !validIds.includes(m.sap_id));
    reviewFiltered = reviewFiltered.filter(m => !validIds.includes(m.sap_id));
    reviewPage = 1;
    renderReviewTable();
    document.getElementById('review-badge').textContent = reviewData.length;
    hideBulkBar();
}

async function bulkReject(sapIds) {
    // Client-side Guard
    const validIds = sapIds.filter(id => reviewData.some(m => m.sap_id === id));
    if (validIds.length === 0) return;

    try {
        // Strict audit log for destructive bulk action
        await insertAuditLog('bulk_reject', validIds, '', { strict: true });

        // Soft delete in bulk
        const { error } = await sb.from('manikins')
            .update({ deleted_at: new Date().toISOString(), is_active: false })
            .in('sap_id', validIds)
            .eq('needs_review', true); // DB Guard

        if (error) { showToast('ลบล้มเหลว: ' + error.message, 'error'); return; }

        showToast('ลบ ' + validIds.length + ' รายการออกจากระบบแล้ว (สามารถกู้คืนได้)');
        reviewData = reviewData.filter(m => !validIds.includes(m.sap_id));
        reviewFiltered = reviewFiltered.filter(m => !validIds.includes(m.sap_id));
        reviewPage = 1;
        renderReviewTable();
        document.getElementById('review-badge').textContent = reviewData.length;
        hideBulkBar();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

/* ===== TAB 3: MANIKINS CRUD ===== */
let manikinData = [];
let manikinFiltered = [];
let allCapabilities = [];

async function loadCapabilities() {
    if (allCapabilities.length > 0) return;
    const { data } = await sb.from('capabilities').select('id, code, label_th').eq('active', true).order('label_th');
    allCapabilities = data || [];
}

async function loadManikins() {
    document.getElementById('manikin-tbody').innerHTML = '<tr><td colspan="8" class="tbl-loading"><span class="spinner-sm"></span>โหลดข้อมูล...</td></tr>';
    const { data, error } = await sb.from('manikins')
        .select('sap_id, asset_name, status, location_id, note, manikin_type')
        .eq('is_active', true).eq('needs_review', false)
        .order('asset_name');

    if (error) { showToast('โหลดข้อมูลล้มเหลว', 'error'); return; }
    manikinData = data || [];
    manikinFiltered = [...manikinData];
    manikinPage = 1;
    renderManikinTable();
    setSync();
}

function filterManikins() {
    const q = document.getElementById('manikin-search').value.toLowerCase();
    const s = document.getElementById('manikin-status-filter').value;
    manikinFiltered = manikinData.filter(m => {
        const matchQ = !q || m.asset_name?.toLowerCase().includes(q) || m.sap_id?.includes(q);
        const matchS = !s || m.status === s;
        return matchQ && matchS;
    });
    manikinPage = 1;
    renderManikinTable();
}

document.getElementById('manikin-search').addEventListener('input', filterManikins);
document.getElementById('manikin-status-filter').addEventListener('change', filterManikins);

function locationLabel(lid) {
    if (!lid) return '<span style="color:var(--text-dim)">—</span>';
    const loc = allLocations.find(l => l.id === lid);
    return loc ? `${esc(loc.building)} / ${esc(loc.room)}` : `(${esc(lid)})`;
}

function renderManikinTable() {
    const start = (manikinPage - 1) * PAGE_SIZE;
    const page = manikinFiltered.slice(start, start + PAGE_SIZE);
    const tbody = document.getElementById('manikin-tbody');

    if (page.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="tbl-empty">ไม่พบรายการ</td></tr>';
        document.getElementById('manikin-pagination').innerHTML = '';
        return;
    }

    tbody.innerHTML = DOMPurify.sanitize(page.map(m => `
    <tr>
      <td class="sap-code">${esc(m.sap_id)}</td>
      <td class="asset-name-cell"><div class="asset-name-text">${esc(m.asset_name) || '—'}</div></td>
      <td>${agePill(m.asset_name)}</td>
      <td>${statusBadge(m.status)}</td>
      <td style="font-size:0.78rem;color:var(--text-secondary)">${locationLabel(m.location_id)}</td>
      <td style="font-size:0.75rem;color:var(--text-secondary);max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(m.note) || '—'}</td>
      <td><button class="btn btn-ghost btn-sm" data-action="edit" data-id="${esc(m.sap_id)}">✏️ แก้ไข</button></td>
    </tr>
  `).join(''));

    buildPagination('manikin-pagination', manikinFiltered.length, manikinPage, (p) => { manikinPage = p; renderManikinTable(); });
}

/* Edit Modal */
async function openEditModal(sapId) {
    const m = manikinData.find(x => x.sap_id === sapId);
    if (!m) return;
    document.getElementById('edit-sap-id').value = sapId;
    document.getElementById('edit-display-sap').value = sapId;
    document.getElementById('edit-status').value = m.status || 'ready';
    document.getElementById('edit-notes').value = m.note || '';

    // Set manikin_type radio
    const typeVal = m.manikin_type || '';
    document.querySelectorAll('[name="edit-manikin-type"]').forEach(r => r.checked = (r.value === typeVal));

    const locSel = document.getElementById('edit-location');
    locSel.innerHTML = DOMPurify.sanitize('<option value="">— ยังไม่ได้ระบุ —</option>' +
        allLocations.map(l => `<option value="${esc(l.id)}" ${m.location_id === l.id ? 'selected' : ''}>${esc(l.building)} / ${esc(l.room)}</option>`).join(''));

    // Load capabilities and render checkboxes
    await loadCapabilities();
    const { data: existing } = await sb.from('manikin_capabilities').select('capability_id').eq('sap_id', sapId);
    const existingIds = new Set((existing || []).map(x => x.capability_id));
    const wrap = document.getElementById('edit-capabilities-wrap');
    if (allCapabilities.length === 0) {
        wrap.innerHTML = '<span style="color:var(--text-dim);font-size:0.8rem">ไม่มีข้อมูลฟังก์ชัน</span>';
    } else {
        wrap.innerHTML = DOMPurify.sanitize(allCapabilities.map(c => `
            <label class="checkbox-item">
                <input type="checkbox" class="cap-cb" data-cap-id="${esc(c.id)}" ${existingIds.has(c.id) ? 'checked' : ''} />
                <span class="checkbox-label">${esc(c.label_th)}</span>
            </label>`).join(''));
    }

    openModal('edit-modal');
}

document.getElementById('edit-cancel').addEventListener('click', () => closeModal('edit-modal'));
document.getElementById('edit-modal').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeModal('edit-modal'); });

document.getElementById('edit-save').addEventListener('click', async () => {
    const sapId = document.getElementById('edit-sap-id').value;
    const selectedType = document.querySelector('[name="edit-manikin-type"]:checked')?.value || null;
    const payload = {
        status: document.getElementById('edit-status').value,
        location_id: document.getElementById('edit-location').value || null,
        note: document.getElementById('edit-notes').value.trim() || null,
        manikin_type: selectedType || null
    };
    const { error } = await sb.from('manikins').update(payload).eq('sap_id', sapId);
    if (error) { showToast('บันทึกล้มเหลว: ' + error.message, 'error'); return; }

    // Sync capabilities via atomic RPC (delete + insert in one DB transaction)
    const checkedCapIds = [...document.querySelectorAll('.cap-cb:checked')].map(cb => cb.dataset.capId);
    const { error: capErr } = await sb.rpc('sync_manikin_capabilities', {
        p_sap_id: sapId,
        p_cap_ids: checkedCapIds
    });
    if (capErr) {
        showToast('บันทึกสำเร็จ แต่อัปเดตความสามารถล้มเหลว: ' + capErr.message, 'error');
        return;
    }
    await insertAuditLog('edit_manikin', [sapId]);

    showToast('บันทึกสำเร็จ');
    closeModal('edit-modal');
    const idx = manikinData.findIndex(m => m.sap_id === sapId);
    if (idx >= 0) Object.assign(manikinData[idx], payload);
    filterManikins();
});

/* ===== TAB 4: LOCATIONS ===== */
async function loadLocations() {
    document.getElementById('locations-tbody').innerHTML = '<tr><td colspan="5" class="tbl-loading"><span class="spinner-sm"></span>โหลด...</td></tr>';
    const { data: locs, error } = await sb.from('locations').select('*').order('building');
    const { data: counts } = await sb.from('manikins').select('location_id').eq('is_active', true).eq('needs_review', false);

    if (error) { showToast('โหลดสถานที่ล้มเหลว', 'error'); return; }
    allLocations = locs || [];

    const countMap = {};
    (counts || []).forEach(c => { if (c.location_id) countMap[c.location_id] = (countMap[c.location_id] || 0) + 1; });

    const tbody = document.getElementById('locations-tbody');
    if (allLocations.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="tbl-empty">ยังไม่มีสถานที่ กรุณาเพิ่มใหม่</td></tr>';
        return;
    }
    tbody.innerHTML = DOMPurify.sanitize(allLocations.map(l => `
    <tr>
      <td class="sap-code">${esc(l.id)}</td>
      <td>${esc(l.building) || '—'}</td>
      <td>${esc(l.room) || '—'}</td>
      <td>${countMap[l.id] || 0} ตัว</td>
      <td style="display:flex;gap:6px">
        <button class="btn btn-ghost btn-sm" data-action="editLoc" data-id="${esc(l.id)}">✏️</button>
        <button class="btn btn-danger btn-sm" data-action="deleteLoc" data-id="${esc(l.id)}">🗑</button>
      </td>
    </tr>
  `).join(''));
}

function openLocationModal(id = null) {
    document.getElementById('loc-edit-id').value = id || '';
    document.getElementById('loc-modal-title').textContent = id ? 'แก้ไขสถานที่' : 'เพิ่มสถานที่';
    const existing = id ? allLocations.find(l => l.id === id) : null;
    document.getElementById('loc-building').value = existing?.building || '';
    document.getElementById('loc-room').value = existing?.room || '';
    openModal('location-modal');
}

document.getElementById('btn-add-location').addEventListener('click', () => openLocationModal());
document.getElementById('loc-cancel').addEventListener('click', () => closeModal('location-modal'));
document.getElementById('location-modal').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeModal('location-modal'); });

document.getElementById('loc-save').addEventListener('click', async () => {
    const id = document.getElementById('loc-edit-id').value;
    const payload = {
        building: document.getElementById('loc-building').value.trim(),
        room: document.getElementById('loc-room').value.trim()
    };
    if (!payload.building || !payload.room) { showToast('กรุณากรอกข้อมูลให้ครบ', 'error'); return; }

    const { error } = id
        ? await sb.from('locations').update(payload).eq('id', parseInt(id))
        : await sb.from('locations').insert(payload);

    if (error) { showToast('บันทึกล้มเหลว: ' + error.message, 'error'); return; }
    showToast('บันทึกสถานที่สำเร็จ');
    closeModal('location-modal');
    loadLocations();
});

async function deleteLocation(id) {
    const loc = allLocations.find(l => l.id === id);
    const locName = loc ? loc.building + ' / ' + loc.room : 'ID ' + id;
    const ok = await showConfirm({
        title: 'ลบสถานที่',
        messageNode: createConfirmMsg('ยืนยันลบ ', locName, ' ออกจากระบบ?', 'หุ่นที่อยู่ในสถานที่นี้จะถูกยกเลิกการผูก'),
        okText: 'ลบสถานที่',
        okClass: 'btn-danger'
    });
    if (!ok) return;
    // Atomic RPC: unlink all manikins + delete location in one transaction
    const { error } = await sb.rpc('delete_location_atomic', { p_location_id: id });
    if (error) { showToast('ลบล้มเหลว: ' + error.message, 'error'); return; }
    await insertAuditLog('delete_location', [String(id)], locName);
    showToast('ลบสถานที่สำเร็จ');
    loadLocations();
}

/* ===== TAB 5: REPORTS ===== */
async function loadReports() {
    const { data } = await sb.from('manikins').select('status, asset_name').eq('is_active', true).eq('needs_review', false);
    const all = data || [];

    const statusColors = { ready: '#22c55e', in_use: '#06b6d4', maintenance: '#f59e0b', broken: '#ef4444', missing: '#94a3b8' };
    const ageColors = { adult: '#4a9fd4', child: '#fbbf24', infant: '#06b6d4', other: '#94a3b8' };

    // Status bars
    renderBars('rpt-status-bars', ['ready', 'in_use', 'maintenance', 'broken', 'missing'].map(k => ({
        key: k, label: STATUS_TH[k] || k, count: all.filter(m => m.status === k).length
    })).filter(d => d.count > 0), k => statusColors[k] || '#888');

    // Age bars
    const ageGroups = { adult: 0, child: 0, infant: 0, other: 0 };
    all.forEach(m => ageGroups[detectAge(m.asset_name)]++);
    renderBars('rpt-age-bars', Object.entries(ageGroups).map(([k, c]) => ({
        key: k, label: `${ageEmoji[k]} ${ageTh[k]}`, count: c
    })).filter(d => d.count > 0), k => ageColors[k] || '#888');

    // Top models
    const modelCount = {};
    all.forEach(m => modelCount[m.asset_name] = (modelCount[m.asset_name] || 0) + 1);
    const top10 = Object.entries(modelCount).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ key: name, label: name, count }));
    renderBars('rpt-model-bars', top10, () => '#2575b8');

    setSync();
}

/* ===== EXPORT CSV ===== */
document.getElementById('btn-export').addEventListener('click', async () => {
    const { data } = await sb.from('manikins').select('sap_id, asset_name, asset_code, status, note').eq('is_active', true).eq('needs_review', false).order('asset_name');
    const rows = data || [];
    const csv = [
        ['SAP ID', 'ชื่อหุ่น', 'Asset Code', 'สถานะ', 'หมายเหตุ'].join(','),
        ...rows.map(m => [m.sap_id, `"${(m.asset_name || '').replace(/"/g, '""')}"`, m.asset_code || '', STATUS_TH[m.status] || m.status, `"${(m.note || '').replace(/"/g, '""')}"`].join(','))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `simset_manikins_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Export CSV สำเร็จ');
});

/* ===== INIT ===== */
async function init() {
    await checkAuth();
    await loadLocations();
    loadDashboard();
}

init();

/* ===== GLOBAL EVENT DELEGATION (STRICT CSP) ===== */
document.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    // Static dashboard buttons
    if (btn.id === 'btn-dash-review') switchTab('review');
    else if (btn.id === 'btn-refresh-review') loadReviewQueue();
    else if (btn.id === 'btn-refresh-manikins') loadManikins();
    else if (btn.id === 'btn-close-edit') closeModal('edit-modal');
    else if (btn.id === 'btn-close-loc') closeModal('location-modal');

    // Dynamic table buttons
    else if (btn.dataset.action === 'approve') approveOne(btn.dataset.id);
    else if (btn.dataset.action === 'reject') rejectOne(btn.dataset.id);
    else if (btn.dataset.action === 'edit') openEditModal(btn.dataset.id);
    else if (btn.dataset.action === 'editLoc') openLocationModal(parseInt(btn.dataset.id));
    else if (btn.dataset.action === 'deleteLoc') deleteLocation(parseInt(btn.dataset.id));
    else if (btn.dataset.page) onPage(parseInt(btn.dataset.page));
});
