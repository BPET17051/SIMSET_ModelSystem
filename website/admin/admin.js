/* ===== SIMSET Admin Panel — admin.js ===== */

const SUPABASE_URL = 'https://ifogcvymwhcfbfjzhwsl.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_DZyIDHVZ-kfD1o3baz0qmw_tTyRCJG8';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const STATUS_TH = {
    ready: 'ใช้งานได้ปกติ',
    in_session: 'กำลังใช้งานอยู่',
    in_use: 'ถูกยืม',
    maintenance: 'รอซ่อม ใช้งานได้',
    broken: 'รอซ่อม ใช้งานไม่ได้',
    pending_disposal: 'รอจำหน่าย',
    disposed: 'จำหน่ายแล้ว/ส่งคืน',
    dept_purchase: 'จัดซื้อให้หน่วยงาน/ภาควิชา',
    pending_transfer: 'รอโอนย้าย',
    transferred: 'โอนย้ายแล้ว'
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
    'dashboard': { title: 'Dashboard', sub: 'ภาพรวมระบบ SiMSET' },
    'review': { title: 'รออนุมัติ (หุ่นใหม่)', sub: 'พิจารณาหุ่นจำลองที่นำเข้าใหม่จาก AppSheet/Docs' },
    'borrow-requests': { title: 'คำร้องยืมคืน', sub: 'รายการคำร้องขอยืมหุ่นจำลองทั้งหมด และการนำออก' },
    'manikins': { title: 'คลังหุ่นจำลองทั้งหมด', sub: 'รายชื่อหุ่นจำลองและข้อมูลทางเทคนิค' },
    'recycle': { title: 'ประวัติการปฏิเสธ (ถังขยะ)', sub: 'ข้อมูลที่ถูกล้อคค แอดมินปฏิเสธไปแล้ว (สามารถกู้คืนได้)' },
    'locations': { title: 'สถานที่ / ห้อง', sub: 'จัดการสถานที่จัดเก็บหุ่นจำลองและห้องฝึก' },
    'teams': { title: 'จัดการ Team', sub: 'กำหนดกลุ่มหุ่น พร้อมลำดับการจ่ายและระบบแจ้งเตือน' },
    'reports': { title: 'รายงานและสถิติ', sub: 'Export ข้อมูลและดูการใช้งานย้อนหลัง' }
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
    if (tabName === 'borrow-requests') { if (typeof loadBorrowRequests === 'function') loadBorrowRequests(); }
    if (tabName === 'manikins') { manikinPage = 1; loadManikins(); }
    if (tabName === 'recycle') { recyclePage = 1; loadRecycleBin(); }
    if (tabName === 'locations') loadLocations();
    if (tabName === 'teams') loadTeams();
    if (tabName === 'reports') loadReports();
}

document.querySelectorAll('.sidebar-link').forEach(el => {
    el.addEventListener('click', () => switchTab(el.dataset.tab));
});

/* ===== GLOBAL REFRESH BUTTON ===== */
function refreshCurrentTab() {
    const activeLink = document.querySelector('.sidebar-link.active');
    if (!activeLink) return;
    const tabName = activeLink.dataset.tab;

    const btn = document.getElementById('btn-global-refresh');
    const icon = document.getElementById('refresh-icon');
    btn.disabled = true;
    icon.classList.add('spinning');
    setTimeout(() => {
        icon.classList.remove('spinning');
        btn.disabled = false;
    }, 800);

    switchTab(tabName);
}
document.getElementById('btn-global-refresh').addEventListener('click', refreshCurrentTab);

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
        btn.onclick = () => onPage(p);
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
let allowedReviewLocationIds = null;
async function getAllowedReviewLocationIds() {
    if (allowedReviewLocationIds !== null) return allowedReviewLocationIds;
    const { data: locs, error } = await sb.from('locations').select('id, building');
    if (error || !locs) return [];

    // Normalize target strings to ignore small spacing differences
    const targetBuildings = ['อดุลยเดชวิกรม ชั้น 10', 'อดุลยเดชวิกรม ชั้น10', 'อาคารโภชนาการ (ชั้น5)', 'อาคารโภชนาการ (ชั้น5 )', 'พระศรีฯ ชั้น 3', 'พระศรีฯ ชั้น3'];

    allowedReviewLocationIds = locs
        .filter(l => targetBuildings.includes(l.building ? l.building.trim() : ''))
        .map(l => l.id);

    return allowedReviewLocationIds;
}

async function loadDashboard() {
    // 1. Get ALL ACTIVE manikins for inventory stats
    const { data: allActive, error } = await sb.from('manikins')
        .select('status, asset_name')
        .eq('is_active', true);

    if (error) { showToast('โหลด Dashboard ล้มเหลว', 'error'); return; }

    // 2. Get COUNT of pending review manikins (they are is_active = false)
    const allowedLocs = await getAllowedReviewLocationIds();

    let reviewCount = 0;
    if (allowedLocs.length > 0) {
        const { count } = await sb.from('manikins')
            .select('*', { count: 'exact', head: true })
            .eq('is_active', false)
            .eq('needs_review', true)
            .is('deleted_at', null)
            .in('location_id', allowedLocs);
        reviewCount = count || 0;
    }

    document.getElementById('d-total').textContent = allActive.length;
    document.getElementById('d-ready').textContent = allActive.filter(m => m.status === 'ready').length;
    document.getElementById('d-maintenance').textContent = allActive.filter(m => m.status === 'maintenance').length;
    document.getElementById('d-broken').textContent = allActive.filter(m => m.status === 'broken').length;
    document.getElementById('d-review').textContent = reviewCount || 0;
    document.getElementById('review-badge').textContent = reviewCount || 0;

    // Status bars
    const statusKeys = ['ready', 'in_use', 'maintenance', 'broken', 'missing'];
    const statusColors = { ready: '#22c55e', in_use: '#a78bfa', maintenance: '#f59e0b', broken: '#ef4444', missing: '#94a3b8' };
    renderBars('status-bars', statusKeys.map(k => ({
        key: k, label: STATUS_TH[k] || k, count: allActive.filter(m => m.status === k).length
    })).filter(d => d.count > 0), k => statusColors[k] || '#888');

    // Age bars
    const ageGroups = { adult: 0, child: 0, infant: 0, other: 0 };
    allActive.forEach(m => ageGroups[detectAge(m.asset_name)]++);
    const ageColors = { adult: '#4a9fd4', child: '#fbbf24', infant: '#a78bfa', other: '#94a3b8' };
    renderBars('age-bars', Object.entries(ageGroups).map(([k, c]) => ({
        key: k, label: `${ageEmoji[k]} ${ageTh[k]}`, count: c
    })).filter(d => d.count > 0), k => ageColors[k] || '#888');

    // Mini review table
    let reviewData = [];
    if (allowedLocs.length > 0) {
        const { data } = await sb.from('manikins')
            .select('sap_id, asset_name')
            .eq('is_active', false)
            .eq('needs_review', true)
            .is('deleted_at', null)
            .in('location_id', allowedLocs)
            .limit(5);
        reviewData = data || [];
    }

    const tbody = document.getElementById('dash-review-tbody');
    if (!reviewData || reviewData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="tbl-empty">✅ ไม่มีรายการรออนุมัติ</td></tr>';
    } else {
        tbody.innerHTML = reviewData.map(m => `
      <tr>
        <td class="sap-code">${esc(m.sap_id)}</td>
        <td class="asset-name-cell"><div class="asset-name-text">${esc(m.asset_name) || '—'}</div></td>
        <td>${agePill(m.asset_name)}</td>
        <td><button class="btn btn-success btn-sm" data-action="approve" data-id="${esc(m.sap_id)}">✓ อนุมัติ</button></td>
      </tr>
    `).join('');
    }
    setSync();
}

/* ===== TAB 2: REVIEW QUEUE ===== */
let reviewData = [];
let reviewFiltered = [];

async function loadReviewQueue() {
    document.getElementById('review-tbody').innerHTML = '<tr><td colspan="6" class="tbl-loading"><span class="spinner-sm"></span>โหลดข้อมูล...</td></tr>';

    const allowedLocs = await getAllowedReviewLocationIds();
    if (allowedLocs.length === 0) {
        reviewData = [];
        reviewFiltered = [];
        reviewPage = 1;
        renderReviewTable();
        document.getElementById('review-badge').textContent = '0';
        document.getElementById('d-review').textContent = '0';
        return;
    }

    const { data, error } = await sb.from('manikins')
        .select('sap_id, team_code, asset_name, asset_code')
        .eq('is_active', false)
        .eq('needs_review', true)
        .is('deleted_at', null)
        .in('location_id', allowedLocs)
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

    tbody.innerHTML = page.map(m => `
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
  `).join('');

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

document.getElementById('recycle-search')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    recycleFiltered = recycleData.filter(m => !q || m.asset_name?.toLowerCase().includes(q) || m.sap_id?.toLowerCase().includes(q) || m.asset_code?.toLowerCase().includes(q));
    recyclePage = 1;
    renderRecycleTable();
});

document.getElementById('review-select-all').addEventListener('change', (e) => {
    document.querySelectorAll('.review-cb').forEach(cb => cb.checked = e.target.checked);
    updateBulkBar();
});

document.getElementById('review-tbody')?.addEventListener('change', (e) => {
    if (e.target.classList.contains('review-cb')) {
        updateBulkBar();
        const allCbs = document.querySelectorAll('.review-cb');
        const checkedCbs = document.querySelectorAll('.review-cb:checked');
        const selectAll = document.getElementById('review-select-all');
        if (selectAll) {
            selectAll.checked = (allCbs.length > 0 && allCbs.length === checkedCbs.length);
            selectAll.indeterminate = (checkedCbs.length > 0 && checkedCbs.length < allCbs.length);
        }
    }
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

/* ===== TAB: RECYCLE BIN ===== */
async function loadRecycleBin() {
    const tbody = document.getElementById('recycle-tbody');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">กำลังโหลด...</td></tr>';

    const { data, error } = await sb.from('manikins')
        .select('sap_id, asset_name, asset_code, deleted_at, status, is_active')
        .not('deleted_at', 'is', null) // Fetch only deleted
        .order('deleted_at', { ascending: false });

    if (error) { showToast('อัปเดตถังขยะล้มเหลว', 'error'); return; }

    recycleData = data || [];
    recycleFiltered = [...recycleData];
    renderRecycleTable();
}

function renderRecycleTable() {
    const start = (recyclePage - 1) * PAGE_SIZE;
    const page = recycleFiltered.slice(start, start + PAGE_SIZE);
    const tbody = document.getElementById('recycle-tbody');

    if (page.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="tbl-empty">ถังขยะว่างเปล่า</td></tr>';
        document.getElementById('recycle-pagination').innerHTML = '';
        return;
    }

    tbody.innerHTML = page.map(m => {
        const dInfo = m.deleted_at ? new Date(m.deleted_at).toLocaleDateString('th-TH') : '—';
        return `
    <tr>
      <td class="sap-code">${esc(m.sap_id)}</td>
      <td class="asset-name-cell"><div class="asset-name-text">${esc(m.asset_name) || '—'}</div></td>
      <td class="sap-code">${esc(m.asset_code) || '—'}</td>
      <td style="color:var(--danger)">${dInfo}</td>
      <td>
        <button class="btn btn-ghost btn-sm" style="color:#f59e0b; border-color:rgba(245,158,11,0.3)" data-action="restore" data-id="${esc(m.sap_id)}">
          <svg style="vertical-align:middle;margin-right:2px;" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="1 4 1 10 7 10"></polyline>
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
          </svg>
          กู้คืน
        </button>
      </td>
    </tr>
  `;
    }).join('');

    buildPagination('recycle-pagination', recycleFiltered.length, recyclePage, (p) => { recyclePage = p; renderRecycleTable(); });
}

async function restoreOne(sapId) {
    const ok = await showConfirm({
        title: 'กู้คืนหุ่นจำลอง',
        messageNode: createConfirmMsg('ต้องการกู้คืน ', sapId, ' กลับไปที่หน้ารออนุมัติใช่หรือไม่?'),
        okText: 'กู้คืน',
        okClass: 'btn-success'
    });
    if (!ok) return;

    try {
        await insertAuditLog('restore_one', [sapId]);

        const { error } = await sb.from('manikins')
            .update({ deleted_at: null, is_active: true, needs_review: true }) // Send back to queue
            .eq('sap_id', sapId)
            .not('deleted_at', 'is', null); // DB guard

        if (error) throw new Error(error.message);

        showToast('กู้คืน ' + sapId + ' สำเร็จ กลับไปที่หน้ารออนุมัติแล้ว');

        // Remove from recycle UI
        recycleData = recycleData.filter(m => m.sap_id !== sapId);
        recycleFiltered = recycleFiltered.filter(m => m.sap_id !== sapId);
        renderRecycleTable();

        // Navigate to review tab after 1s
        setTimeout(() => switchTab('review'), 1000);
    } catch (err) {
        showToast('กู้คืนล้มเหลว: ' + err.message, 'error');
    }
}

// Delegate events for the recycle bin
document.getElementById('recycle-tbody')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    if (action === 'restore') restoreOne(id);
});

/* ===== TAB 3: MANIKINS CRUD ===== */
let manikinData = [];
let manikinFiltered = [];
let recycleData = [], recycleFiltered = [], recyclePage = 1;
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
    const loc = allLocations.find(l => String(l.id) === String(lid));
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

    tbody.innerHTML = page.map(m => `
    <tr>
      <td class="sap-code">${esc(m.sap_id)}</td>
      <td class="asset-name-cell"><div class="asset-name-text">${esc(m.asset_name) || '—'}</div></td>
      <td>${agePill(m.asset_name)}</td>
      <td>${statusBadge(m.status)}</td>
      <td style="font-size:0.78rem;color:var(--text-secondary)">${locationLabel(m.location_id)}</td>
      <td style="font-size:0.75rem;color:var(--text-secondary);max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(m.note) || '—'}</td>
      <td><button class="btn btn-ghost btn-sm" data-action="edit" data-id="${esc(m.sap_id)}">✏️ แก้ไข</button></td>
    </tr>
  `).join('');

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
    locSel.innerHTML = '<option value="">— ยังไม่ได้ระบุ —</option>' +
        allLocations.map(l => `<option value="${esc(l.id)}" ${String(m.location_id) === String(l.id) ? 'selected' : ''}>${esc(l.building)} / ${esc(l.room)}</option>`).join('');

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
    const rawLoc = document.getElementById('edit-location').value;
    const payload = {
        status: document.getElementById('edit-status').value,
        location_id: rawLoc ? Number(rawLoc) : null,
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
    tbody.innerHTML = allLocations.map(l => `
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
  `).join('');
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
    // 1. Load Manikins Status Data (Existing)
    const { data: mData } = await sb.from('manikins').select('status, asset_name').eq('is_active', true).eq('needs_review', false);
    const all = mData || [];

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

    // 2. Load Borrow Requests for Phase 1 Executive KPIs
    const startDate = new Date();
    startDate.setDate(1); // Start of current month for top usage
    const startOfThisMonth = startDate.toISOString();

    const { data: bData } = await sb.from('borrow_requests')
        .select(`
            status, created_at, 
            borrow_request_items(start_date, equipments(name_th))
        `);

    const reqs = bData || [];

    // KPI 1 & 2: Approved / Cancelled Rates
    let totalReqs = reqs.length;
    let approvedReqs = 0;
    let cancelledReqs = 0;

    // KPI 3: Avg Lead Time
    let totalLeadTimeDays = 0;
    let leadTimeCount = 0;

    // KPI 4: Top Model (Month)
    const usageThisMonthCount = {};

    reqs.forEach(r => {
        // Status counts
        if (['approved', 'returned_pending_inspection', 'returned'].includes(r.status)) approvedReqs++;
        if (['cancelled', 'rejected'].includes(r.status)) cancelledReqs++;

        // Lead Time (only for valid requests with items)
        if (r.borrow_request_items && r.borrow_request_items.length > 0) {
            const createdAt = new Date(r.created_at);
            // Get earliest start date among items
            const earliestStartStr = r.borrow_request_items.reduce((min, cur) => cur.start_date < min.start_date ? cur : min).start_date;
            const earliestStart = new Date(earliestStartStr);
            const diffTime = earliestStart - createdAt;
            const diffDays = Math.max(0, diffTime / (1000 * 60 * 60 * 24)); // clamp to 0 if they book in the past/same day weirdly

            totalLeadTimeDays += diffDays;
            leadTimeCount++;

            // Usage freq this month
            if (r.created_at >= startOfThisMonth && r.status !== 'cancelled' && r.status !== 'rejected') {
                r.borrow_request_items.forEach(item => {
                    const eqName = item.equipments?.name_th || 'Unknown';
                    usageThisMonthCount[eqName] = (usageThisMonthCount[eqName] || 0) + 1;
                });
            }
        }
    });

    const approvedRate = totalReqs > 0 ? ((approvedReqs / totalReqs) * 100).toFixed(1) : 0;
    const cancelledRate = totalReqs > 0 ? ((cancelledReqs / totalReqs) * 100).toFixed(1) : 0;
    const avgLeadTime = leadTimeCount > 0 ? (totalLeadTimeDays / leadTimeCount).toFixed(1) : 0;

    let topUsedName = 'ไม่มีข้อมูล';
    if (Object.keys(usageThisMonthCount).length > 0) {
        const sorted = Object.entries(usageThisMonthCount).sort((a, b) => b[1] - a[1]);
        topUsedName = sorted[0][0]; // the name
    }

    document.getElementById('kpi-approved').textContent = `${approvedRate}%`;
    document.getElementById('kpi-cancelled').textContent = `${cancelledRate}%`;
    document.getElementById('kpi-leadtime').textContent = `${avgLeadTime} วัน`;
    document.getElementById('kpi-topusage').textContent = topUsedName;
    document.getElementById('kpi-topusage').title = topUsedName; // toolltip for long text

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

/* ===== MOBILE SIDEBAR TOGGLE ===== */
function openSidebar() {
    document.querySelector('.sidebar').classList.add('open');
    document.getElementById('sidebar-overlay').classList.add('open');
}
function closeSidebar() {
    document.querySelector('.sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('open');
}
document.getElementById('btn-menu-toggle').addEventListener('click', openSidebar);
document.getElementById('sidebar-overlay').addEventListener('click', closeSidebar);
// Close sidebar on nav link tap (mobile)
document.querySelectorAll('.sidebar-link').forEach(link => {
    link.addEventListener('click', () => {
        if (window.innerWidth <= 768) closeSidebar();
    });
});

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
    // Teams buttons
    else if (btn.id === 'btn-new-team') openTeamModal();
    else if (btn.id === 'btn-edit-team') openTeamModal(true);
    else if (btn.id === 'btn-delete-team') deleteTeam();
    else if (btn.id === 'btn-add-member') openAddMemberModal();
    else if (btn.id === 'btn-close-team-modal') closeModal('team-modal');
    else if (btn.id === 'team-modal-cancel') closeModal('team-modal');
    else if (btn.id === 'team-modal-save') saveTeam();
    else if (btn.id === 'btn-close-add-member') closeModal('add-member-modal');
    else if (btn.id === 'add-member-cancel') closeModal('add-member-modal');
    else if (btn.id === 'add-member-save') addMemberToTeam();
    else if (btn.id === 'btn-dispense-check') checkDispense();

    // Dynamic table buttons
    else if (btn.id === 'btn-save-team-caps') saveTeamCapabilities(currentTeamCode);
    else if (btn.id === 'btn-sync-caps') syncCapabilitiesToTeam(currentTeamCode);
    else if (btn.dataset.action === 'approve') approveOne(btn.dataset.id);
    else if (btn.dataset.action === 'reject') rejectOne(btn.dataset.id);
    else if (btn.dataset.action === 'edit') openEditModal(btn.dataset.id);
    else if (btn.dataset.action === 'editLoc') openLocationModal(parseInt(btn.dataset.id));
    else if (btn.dataset.action === 'deleteLoc') deleteLocation(parseInt(btn.dataset.id));
    else if (btn.dataset.action === 'selectTeam') selectTeam(btn.dataset.code);
    else if (btn.dataset.action === 'removeMember') removeMemberFromTeam(btn.dataset.sap);
    // Numbered page buttons use direct onclick in buildPagination — no delegation needed
});

/* ===== TEAMS MODULE ===== */
let currentTeamCode = null;

async function loadTeams() {
    const listEl = document.getElementById('teams-list');
    listEl.innerHTML = '<div class="tbl-loading"><span class="spinner-sm"></span></div>';
    const { data, error } = await sb.from('teams').select('*').order('team_code');
    if (error) { listEl.innerHTML = '<div class="err-box">โหลดล้มเหลว</div>'; return; }
    if (!data.length) {
        listEl.innerHTML = '<div style="padding:16px;color:var(--text-dim);font-size:0.85rem;">ยังไม่มี Team — กด + สร้าง</div>';
        return;
    }
    listEl.innerHTML = data.map(t => {
        const active = t.team_code === currentTeamCode ? 'active' : '';
        return '<div class="team-card ' + active + '" data-code="' + esc(t.team_code) + '">' +
            '<div class="team-card-code">' + esc(t.team_code) + '</div>' +
            '<div class="team-card-name">' + esc(t.display_name) + '</div>' +
            '<button class="btn btn-sm btn-outline" style="font-size:0.72rem;" data-action="selectTeam" data-code="' + esc(t.team_code) + '">เปิด</button>' +
            '</div>';
    }).join('');
}

async function selectTeam(code) {
    currentTeamCode = code;
    document.querySelectorAll('.team-card').forEach(el => el.classList.toggle('active', el.dataset.code === code));
    document.getElementById('teams-detail-empty').classList.add('hidden');
    document.getElementById('teams-detail-content').classList.remove('hidden');
    document.getElementById('detail-team-code').textContent = code;

    const team = (await sb.from('teams').select('display_name').eq('team_code', code).single()).data;
    document.getElementById('detail-team-name').textContent = team ? team.display_name : '';

    // Show caps section and load
    document.getElementById('team-caps-section').classList.remove('hidden');
    loadTeamCapabilities(code);

    loadTeamMembers(code);
    checkDispense();
}

async function loadTeamMembers(code) {
    const tbody = document.getElementById('team-members-tbody');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;"><span class="spinner-sm"></span></td></tr>';
    const { data, error } = await sb.from('manikins')
        .select('sap_id, asset_name, status, team_order')
        .eq('team_code', code)
        .is('deleted_at', null)
        .order('team_order', { ascending: true });
    if (error || !data || !data.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-dim);">ไม่มีสมาชิก</td></tr>';
        return;
    }
    tbody.innerHTML = data.map(m => {
        const orderLabel = code + ' ' + String(m.team_order).padStart(2, '0');
        return '<tr>' +
            '<td style="text-align:center;"><span class="order-badge">' + esc(orderLabel) + '</span></td>' +
            '<td style="font-family:monospace;">' + esc(m.sap_id) + '</td>' +
            '<td>' + esc(m.asset_name) + '</td>' +
            '<td>' + statusBadge(m.status) + '</td>' +
            '<td style="text-align:center;"><button class="btn btn-sm" style="color:#ef4444;border:1px solid rgba(239,68,68,0.3);font-size:0.72rem;" data-action="removeMember" data-sap="' + esc(m.sap_id) + '">✕ เอาออก</button></td>' +
            '</tr>';
    }).join('');
}

async function checkDispense() {
    const code = currentTeamCode;
    if (!code) return;
    const { data } = await sb.from('manikins')
        .select('sap_id, asset_name, status, team_order')
        .eq('team_code', code)
        .is('deleted_at', null)
        .order('team_order', { ascending: true });
    if (!data || !data.length) {
        document.getElementById('dispense-next-badge').textContent = '—';
        return;
    }
    const skipped = [];
    let next = null;
    for (const m of data) {
        if (m.status === 'ready') { next = m; break; }
        else { skipped.push(code + ' ' + String(m.team_order).padStart(2, '0')); }
    }
    const badge = document.getElementById('dispense-next-badge');
    const alertEl = document.getElementById('team-skip-alert');
    const alertMsg = document.getElementById('team-skip-msg');
    if (next) {
        badge.textContent = code + ' ' + String(next.team_order).padStart(2, '0') + ' — ' + next.asset_name;
        if (skipped.length) {
            alertMsg.textContent = '⚠️ ข้าม ' + skipped.join(', ') + ' เนื่องจากสถานะ In-use — จ่ายตัวถัดไป: ' + code + ' ' + String(next.team_order).padStart(2, '0');
            alertEl.classList.remove('hidden');
        } else {
            alertEl.classList.add('hidden');
        }
    } else {
        badge.textContent = '⚫ ไม่มีหุ่นพร้อมใช้';
        alertMsg.textContent = '⚠️ หุ่นทุกตัวใน Team ' + code + ' ไม่พร้อม — ไม่สามารถจ่ายได้ขณะนี้';
        alertEl.classList.remove('hidden');
    }
}

function openTeamModal(isEdit = false) {
    document.getElementById('team-modal-title').textContent = isEdit ? 'แก้ไขข้อมูล Team' : 'สร้าง Team ใหม่';
    if (isEdit && currentTeamCode) {
        document.getElementById('team-modal-code').value = currentTeamCode;
        document.getElementById('team-modal-code').disabled = true;
        document.getElementById('team-modal-original-code').value = currentTeamCode;
        const nameEl = document.getElementById('detail-team-name');
        document.getElementById('team-modal-name').value = nameEl ? nameEl.textContent : '';
    } else {
        document.getElementById('team-modal-code').value = '';
        document.getElementById('team-modal-code').disabled = false;
        document.getElementById('team-modal-original-code').value = '';
        document.getElementById('team-modal-name').value = '';
    }
    openModal('team-modal');
}

async function saveTeam() {
    const code = document.getElementById('team-modal-code').value.trim().toUpperCase();
    const name = document.getElementById('team-modal-name').value.trim();
    if (!code || !name) { showToast('กรุณากรอกข้อมูลให้ครบถ้วน', 'error'); return; }
    if (!/^[A-Z0-9_-]+$/.test(code)) { showToast('Team Code ต้องเป็นตัวอักษรตัวใหญ่เท่านั้น', 'error'); return; }
    const { error } = await sb.from('teams').upsert({ team_code: code, display_name: name }, { onConflict: 'team_code' });
    if (error) { showToast('บันทึกล้มเหลว: ' + error.message, 'error'); return; }
    await insertAuditLog('TEAM_UPSERT', [code], 'display_name: ' + name);
    showToast('บันทึก Team สำเร็จ');
    closeModal('team-modal');
    await loadTeams();
    selectTeam(code);
}

async function deleteTeam() {
    if (!currentTeamCode) return;
    const ok = await showConfirm({
        title: 'ยืนยันลบ Team',
        messageNode: createConfirmMsg('ลบ Team ', currentTeamCode, ' หุ่นทุกตัวจะถูกเอาออกจาก Team อัตโนมัติ'),
        okText: 'ลบ Team',
        okClass: 'btn-danger'
    });
    if (!ok) return;
    // Remove team from all manikins first
    await sb.from('manikins').update({ team_code: null, team_order: null }).eq('team_code', currentTeamCode);
    const { error } = await sb.from('teams').delete().eq('team_code', currentTeamCode);
    if (error) { showToast('ลบล้มเหลว: ' + error.message, 'error'); return; }
    await insertAuditLog('TEAM_DELETE', [currentTeamCode]);
    showToast('ลบ Team ' + currentTeamCode + ' เรียบร้อย');
    currentTeamCode = null;
    document.getElementById('teams-detail-empty').classList.remove('hidden');
    document.getElementById('teams-detail-content').classList.add('hidden');
    await loadTeams();
}

let _allTeamlessManikins = [];

async function openAddMemberModal() {
    if (!currentTeamCode) return;
    document.getElementById('add-member-team-name').textContent = currentTeamCode;

    // Reset combobox
    const input = document.getElementById('add-member-sap-input');
    const hidden = document.getElementById('add-member-sap');
    const dropdown = document.getElementById('add-member-dropdown');
    input.value = '';
    hidden.value = '';
    dropdown.classList.add('hidden');
    input.placeholder = 'โหลดรายการ...';

    // Load manikins without a team
    const { data } = await sb.from('manikins')
        .select('sap_id, asset_name')
        .is('team_code', null)
        .is('deleted_at', null)
        .eq('is_active', true)
        .order('sap_id');

    _allTeamlessManikins = data || [];
    input.placeholder = _allTeamlessManikins.length
        ? 'พิมพ์ SAP ID หรือชื่อหุ่นเพื่อค้นหา...'
        : 'ไม่มีหุ่นที่ยังไม่มี Team';

    // Attach input filter listener (replace old one)
    const newInput = input.cloneNode(true);
    input.parentNode.replaceChild(newInput, input);
    newInput.addEventListener('input', () => renderComboboxOptions(newInput.value));
    newInput.addEventListener('focus', () => renderComboboxOptions(newInput.value));

    // Close dropdown on click outside
    document.addEventListener('click', (e) => {
        if (!document.getElementById('add-member-combobox-wrap').contains(e.target)) {
            dropdown.classList.add('hidden');
        }
    }, { once: true });

    // Suggest next available order
    const { data: members } = await sb.from('manikins').select('team_order').eq('team_code', currentTeamCode).order('team_order', { ascending: false }).limit(1);
    const nextOrder = (members && members.length && members[0].team_order) ? members[0].team_order + 1 : 1;
    document.getElementById('add-member-order').value = nextOrder;
    document.getElementById('add-member-order-hint').textContent = 'ลำดับถัดไปที่ว่าง: ' + currentTeamCode + ' ' + String(nextOrder).padStart(2, '0');
    openModal('add-member-modal');
    // Focus the combobox after modal opens
    setTimeout(() => document.getElementById('add-member-sap-input').focus(), 320);
}

function renderComboboxOptions(query) {
    const dropdown = document.getElementById('add-member-dropdown');
    const q = (query || '').toLowerCase();
    const filtered = q
        ? _allTeamlessManikins.filter(m => m.sap_id.toLowerCase().includes(q) || m.asset_name.toLowerCase().includes(q))
        : _allTeamlessManikins;

    if (!filtered.length) {
        dropdown.innerHTML = '<div class="combobox-no-result">ไม่พบรายการ</div>';
        dropdown.classList.remove('hidden');
        return;
    }

    dropdown.innerHTML = filtered.slice(0, 30).map(m =>
        '<div class="combobox-option" data-sap="' + esc(m.sap_id) + '" data-name="' + esc(m.asset_name) + '">' +
        '<span class="combobox-sap">' + esc(m.sap_id) + '</span>' +
        '<span class="combobox-name">' + esc(m.asset_name) + '</span>' +
        '</div>'
    ).join('');
    dropdown.classList.remove('hidden');

    // Attach click listeners to options
    dropdown.querySelectorAll('.combobox-option').forEach(el => {
        el.addEventListener('click', () => {
            document.getElementById('add-member-sap-input').value = el.dataset.sap + ' — ' + el.dataset.name;
            document.getElementById('add-member-sap').value = el.dataset.sap;
            dropdown.classList.add('hidden');
        });
    });
}

async function addMemberToTeam() {
    const sapId = document.getElementById('add-member-sap').value;
    const order = parseInt(document.getElementById('add-member-order').value);
    if (!sapId || !order || order < 1) { showToast('กรุณาเลือกหุ่นและระบุลำดับ', 'error'); return; }
    const { error } = await sb.from('manikins').update({ team_code: currentTeamCode, team_order: order }).eq('sap_id', sapId);
    if (error) { showToast('เพิ่มล้มเหลว: ' + error.message, 'error'); return; }
    await insertAuditLog('TEAM_ADD_MEMBER', [sapId], currentTeamCode + ' ' + String(order).padStart(2, '0'));
    showToast('เพิ่มหุ่นเข้า Team สำเร็จ');
    closeModal('add-member-modal');
    await loadTeamMembers(currentTeamCode);
    await checkDispense();
}

async function removeMemberFromTeam(sapId) {
    if (!currentTeamCode) return;
    const ok = await showConfirm({
        title: 'ยืนยันการเอาออก',
        messageNode: createConfirmMsg('นำหุ่น ', sapId, ' ออกจาก Team ' + currentTeamCode + '?'),
        okText: 'เอาออก',
        okClass: 'btn-danger'
    });
    if (!ok) return;

    // Remove capabilities inherited from team
    const { data: teamCaps } = await sb.from('team_capabilities').select('capability_id').eq('team_code', currentTeamCode);
    if (teamCaps && teamCaps.length) {
        const capIds = teamCaps.map(tc => tc.capability_id);
        await sb.from('manikin_capabilities').delete().eq('sap_id', sapId).in('capability_id', capIds);
    }

    const { error } = await sb.from('manikins').update({ team_code: null, team_order: null }).eq('sap_id', sapId);
    if (error) { showToast('นำออกล้มเหลว: ' + error.message, 'error'); return; }
    await insertAuditLog('TEAM_MEMBER_REMOVE', [sapId], 'Team: ' + currentTeamCode);
    showToast('นำหุ่น ' + sapId + ' ออกจาก Team แล้ว');
    loadTeamMembers(currentTeamCode);
}

/* ===== TEAM CAPABILITIES LOGIC ===== */

async function loadTeamCapabilities(code) {
    const grid = document.getElementById('team-caps-checkboxes');
    grid.innerHTML = '<div class="text-dim text-xs">กำลังโหลด Default Capabilities...</div>';

    // Fetch all available caps
    if (!allCapabilities.length) await loadCapabilities();

    // Fetch team caps
    const { data: teamCaps } = await sb.from('team_capabilities').select('capability_id').eq('team_code', code);
    const selectedIds = (teamCaps || []).map(tc => tc.capability_id);

    grid.innerHTML = allCapabilities.map(cap => `
        <label class="cap-item">
            <input type="checkbox" value="${cap.id}" ${selectedIds.includes(cap.id) ? 'checked' : ''}>
            <span class="cap-label">${esc(cap.label_th || cap.code)}</span>
        </label>
    `).join('');
}

async function saveTeamCapabilities(code) {
    if (!code) return;
    const checkedIds = [...document.querySelectorAll('#team-caps-checkboxes input:checked')].map(el => el.value);

    // DELETE all and INSERT selected (transactional-ish)
    await sb.from('team_capabilities').delete().eq('team_code', code);
    if (checkedIds.length) {
        const payload = checkedIds.map(id => ({ team_code: code, capability_id: id }));
        const { error } = await sb.from('team_capabilities').insert(payload);
        if (error) { showToast('บันทึกล้มเหลว: ' + error.message, 'error'); return; }
    }

    await insertAuditLog('TEAM_CAPS_SAVE', [code], 'Caps: ' + checkedIds.length);
    showToast('บันทึก Default Capabilities สำเร็จ');
}

async function syncCapabilitiesToTeam(code) {
    if (!code) return;

    // Get team caps
    const { data: teamCaps } = await sb.from('team_capabilities').select('capability_id').eq('team_code', code);
    if (!teamCaps || !teamCaps.length) {
        showToast('กรุณากำหนด Default Capabilities ก่อน Sync', 'warning');
        return;
    }

    // Get all members
    const { data: members } = await sb.from('manikins').select('sap_id').eq('team_code', code);
    if (!members || !members.length) {
        showToast('ยังไม่มีหุ่นใน Team นี้', 'warning');
        return;
    }

    const ok = await showConfirm({
        title: 'ยืนยันการ Sync',
        message: 'ต้องการใส่ Capabilities ทั้งหมดหุ่นทั้ง ' + members.length + ' ตัวในกลุ่มนี้ใช่หรือไม่? (หุ่นที่มีอยู่แล้วจะไม่ได้รับผลกระทบ)',
        okText: 'Sync ทันที'
    });
    if (!ok) return;

    // Prepare bulk insert
    const payload = [];
    members.forEach(m => {
        teamCaps.forEach(tc => {
            payload.push({ sap_id: m.sap_id, capability_id: tc.capability_id });
        });
    });

    const { error } = await sb.from('manikin_capabilities').upsert(payload, { onConflict: 'sap_id,capability_id' });
    if (error) { showToast('Sync ล้มเหลว: ' + error.message, 'error'); return; }

    await insertAuditLog('TEAM_CAPS_SYNC', [code], 'Members: ' + members.length);
    showToast('Sync Capabilities ให้หุ่นทั้ง ' + members.length + ' ตัวสำเร็จ');
}
