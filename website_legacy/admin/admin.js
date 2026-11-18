/* ===== SIMSET Admin Panel — admin.js ===== */

const SUPABASE_URL = 'https://ifogcvymwhcfbfjzhwsl.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_DZyIDHVZ-kfD1o3baz0qmw_tTyRCJG8';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const adminParams = new URLSearchParams(window.location.search);
const TEST_MODE = adminParams.get('test_mode') === '1' || window.localStorage.getItem('simset_test_mode') === '1' || navigator.webdriver;
if (adminParams.get('test_mode') === '1') {
    window.localStorage.setItem('simset_test_mode', '1');
}
const TEST_ADMIN_LOGIN_KEY = 'simset_test_admin_logged_in';

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
let reviewPage = 1, manikinPage = 1, recyclePage = 1, locationsPage = 1;
let allLocations = [];
let locationRows = [];
let locationFiltered = [];
let currentUser = null;
let reportsAutoRefreshTimer = null;
let reportsRefreshRemaining = 60;
let reportsAutoRefreshInFlight = false;
const reviewQueryState = { search: '', sort: 'name-asc' };
const manikinQueryState = { search: '', status: '', sort: 'name-asc' };
const recycleQueryState = { search: '', sort: 'deleted-desc' };
const locationsQueryState = { search: '', sort: 'building-asc' };

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
            showToast('บันทึก Audit Log ล้มเหลว กรุณาแจ้ง IT', 'error');
        }
    }
}

/* ===== AUTH CHECK ===== */
async function checkAuth() {
    if (TEST_MODE) {
        if (window.localStorage.getItem(TEST_ADMIN_LOGIN_KEY) !== '1') {
            window.location.href = 'index.html?test_mode=1';
            return;
        }
        currentUser = {
            id: 'test-admin-001',
            email: 'example@gmail.com',
            app_metadata: { role: 'admin' }
        };
        const email = currentUser.email || '';
        document.getElementById('user-email').textContent = email;
        document.getElementById('user-avatar').textContent = email.charAt(0).toUpperCase();
        return;
    }

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
    if (TEST_MODE) {
        window.localStorage.removeItem(TEST_ADMIN_LOGIN_KEY);
        window.location.href = 'index.html?test_mode=1';
        return;
    }
    await sb.auth.signOut();
    window.location.href = 'index.html';
});

/* ===== NAVIGATION ===== */
const tabMeta = {
    'dashboard': { title: 'Dashboard', sub: 'ภาพรวมระบบ SiMSET' },
    'review': { title: 'อนุมัติหุ่นใหม่เข้าคลัง', sub: 'พิจารณาหุ่นจำลองที่นำเข้าใหม่จาก AppSheet/Docs ก่อนเผยแพร่เข้าคลังหลัก' },
    'borrow-requests': { title: 'คำขอยืมจากผู้ใช้', sub: 'ตรวจคำขอยืม อนุมัติ ปฏิเสธ และตรวจรับคืนจากผู้ใช้งาน' },
    'manikins': { title: 'คลังหุ่นจำลองทั้งหมด', sub: 'รายชื่อหุ่นจำลองและข้อมูลทางเทคนิค' },
    'recycle': { title: 'ประวัติการปฏิเสธ (ถังขยะ)', sub: 'ข้อมูลที่ถูกล้อคค แอดมินปฏิเสธไปแล้ว (สามารถกู้คืนได้)' },
    'locations': { title: 'สถานที่ / ห้อง', sub: 'จัดการสถานที่จัดเก็บหุ่นจำลองและห้องฝึก' },
    'teams': { title: 'จัดการ Team', sub: 'กำหนดกลุ่มหุ่น พร้อมลำดับการจ่ายและระบบแจ้งเตือน' },
    'reports': { title: 'รายงานและสถิติ', sub: 'Export ข้อมูลและดูการใช้งานย้อนหลัง' }
};

const STAFF_REGROUP_META = {
    dashboard: { title: 'งานเร่งด่วนวันนี้', sub: 'ภาพรวมงานที่ต้องเปิดดูทันทีหลังเข้าสู่ระบบ' },
    review: { title: 'อนุมัติหุ่นใหม่เข้าคลัง', sub: 'ตรวจรายการหุ่นใหม่ก่อนเผยแพร่เข้าสู่คลังหลัก' },
    'borrow-requests': { title: 'คิวคำขอยืมจากผู้ใช้', sub: 'ตรวจคำขอยืม อนุมัติ ปฏิเสธ และตรวจรับคืนจากจุดเดียว' },
    manikins: { title: 'คลังอุปกรณ์และหุ่นจำลอง', sub: 'ดูสถานะสต็อก แก้ไขข้อมูล และติดตามความพร้อมใช้งาน' },
    recycle: { title: 'ประวัติการปฏิเสธและกู้คืน', sub: 'ตรวจสอบรายการที่ถูกปฏิเสธไปแล้วและกู้คืนเมื่อจำเป็น' },
    locations: { title: 'ข้อมูลอ้างอิงสถานที่', sub: 'จัดการอาคาร ห้อง และจุดเก็บอุปกรณ์สำหรับทีมงาน' },
    teams: { title: 'ข้อมูลอ้างอิงทีมและชุดจ่าย', sub: 'จัดการทีม ชุดอุปกรณ์ และลำดับการจ่ายตาม workflow' },
    reports: { title: 'รายงานและวิเคราะห์', sub: 'ติดตามสถิติการใช้งานและข้อมูลสรุปสำหรับผู้ดูแลระบบ' }
};

function setSidebarLinkLabel(tabName, label) {
    const el = document.querySelector(`.sidebar-link[data-tab="${tabName}"]`);
    if (!el) return;
    const icon = el.querySelector('svg');
    const badge = el.querySelector('.nav-badge');
    el.title = label;
    el.textContent = '';
    if (icon) el.appendChild(icon);
    el.appendChild(document.createTextNode(` ${label}`));
    if (badge) el.appendChild(badge);
}

function applyStaffRegroupStructure() {
    const nav = document.querySelector('.sidebar-nav');
    if (!nav) return;

    const links = {};
    document.querySelectorAll('.sidebar-link[data-tab]').forEach((link) => {
        links[link.dataset.tab] = link;
    });

    const labels = [...nav.querySelectorAll('.nav-group-label')];
    const operationLabel = labels[0] || document.createElement('div');
    const referenceLabel = labels[1] || document.createElement('div');
    const analyticsLabel = labels[2] || document.createElement('div');

    operationLabel.className = 'nav-group-label';
    referenceLabel.className = 'nav-group-label';
    analyticsLabel.className = 'nav-group-label';

    operationLabel.textContent = 'งานปฏิบัติการ';
    referenceLabel.textContent = 'คลังและข้อมูลอ้างอิง';
    analyticsLabel.textContent = 'ประวัติและวิเคราะห์';

    nav.replaceChildren(
        operationLabel,
        links.dashboard,
        links['borrow-requests'],
        links.review,
        links.manikins,
        referenceLabel,
        links.locations,
        links.teams,
        analyticsLabel,
        links.recycle,
        links.reports
    );
}

function applyStaffRegroupLabels() {
    const groupLabels = document.querySelectorAll('.nav-group-label');
    if (groupLabels[0]) groupLabels[0].textContent = 'งานปฏิบัติการ';
    if (groupLabels[1]) groupLabels[1].textContent = 'คลังและข้อมูลอ้างอิง';
    if (groupLabels[2]) groupLabels[2].textContent = 'ประวัติและวิเคราะห์';

    setSidebarLinkLabel('dashboard', 'งานเร่งด่วนวันนี้');
    setSidebarLinkLabel('borrow-requests', 'คิวคำขอยืมจากผู้ใช้');
    setSidebarLinkLabel('review', 'อนุมัติหุ่นใหม่เข้าคลัง');
    setSidebarLinkLabel('manikins', 'คลังอุปกรณ์');
    setSidebarLinkLabel('locations', 'สถานที่และห้อง');
    setSidebarLinkLabel('teams', 'ทีมและชุดจ่าย');
    setSidebarLinkLabel('recycle', 'ประวัติการปฏิเสธ');
    setSidebarLinkLabel('reports', 'รายงานและวิเคราะห์');
}

const tabLoaders = {
    dashboard: () => loadDashboard(),
    review: () => loadReviewQueue(),
    'borrow-requests': () => (typeof loadBorrowRequests === 'function' ? loadBorrowRequests() : undefined),
    manikins: () => loadManikins(),
    recycle: () => loadRecycleBin(),
    locations: () => loadLocations(),
    teams: () => loadTeams(),
    reports: () => loadReportsExperience()
};

function runTabLoader(tabName, options = {}) {
    const { resetPage = false } = options;
    if (resetPage) {
        if (tabName === 'review') reviewPage = 1;
        if (tabName === 'manikins') manikinPage = 1;
        if (tabName === 'recycle') recyclePage = 1;
    }
    const loader = tabLoaders[tabName];
    if (!loader) return Promise.resolve();
    try {
        return Promise.resolve(loader());
    } catch (err) {
        return Promise.reject(err);
    }
}

function switchTab(tabName) {
    document.querySelectorAll('.sidebar-link').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));

    const navEl = document.querySelector(`[data-tab="${tabName}"]`);
    if (navEl) navEl.classList.add('active');

    const paneEl = document.getElementById(`tab-${tabName}`);
    if (paneEl) paneEl.classList.add('active');

    const meta = STAFF_REGROUP_META[tabName] || tabMeta[tabName] || {};
    document.getElementById('topbar-title').textContent = meta.title || tabName;
    document.getElementById('topbar-sub').textContent = meta.sub || '';

    runTabLoader(tabName, { resetPage: true }).catch((err) => {
        console.error('[Tab] Failed to load tab:', tabName, err);
    });
}

document.querySelectorAll('.sidebar-link').forEach(el => {
    el.addEventListener('click', () => {
        switchTab(el.dataset.tab);
        if (window.innerWidth <= 768) closeSidebar();
    });
});

document.addEventListener('click', handleDashboardTargetActivation);
document.addEventListener('keydown', handleDashboardTargetActivation);

/* ===== GLOBAL REFRESH BUTTON ===== */
async function refreshCurrentTab() {
    const activeLink = document.querySelector('.sidebar-link.active');
    if (!activeLink) return;
    const tabName = activeLink.dataset.tab;

    const btn = document.getElementById('btn-global-refresh');
    const icon = document.getElementById('refresh-icon');

    // Make sure we don't double invoke it while spinning
    if (btn.disabled) return;
    btn.disabled = true;
    icon.classList.add('spinning');

    try {
        await runTabLoader(tabName);
    } catch (err) {
        console.error('[Refresh] Error:', err);
    } finally {
        icon.classList.remove('spinning');
        btn.disabled = false;
    }
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
const ageIcon = {
    adult: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block; vertical-align:middle;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    child: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block; vertical-align:middle;"><circle cx="12" cy="8" r="3"/><path d="M7 21v-2a5 5 0 0 1 10 0v2"/></svg>',
    infant: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block; vertical-align:middle;"><circle cx="12" cy="9" r="2.5"/><path d="M9 22v-3a3 3 0 0 1 6 0v3"/></svg>',
    other: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block; vertical-align:middle;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12.01" y2="8"/><line x1="12" y1="12" x2="12" y2="16"/></svg>'
};

function agePill(name) {
    const a = detectAge(name);
    return `<span class="age-pill ${a}">${ageIcon[a]} ${ageTh[a]}</span>`;
}

function statusBadge(s) {
    const enStatus = {
        pending: 'Pending',
        approved: 'Approved',
        rejected: 'Rejected',
        returned_pending_inspection: 'Returned Pending Inspection',
        returned: 'Returned',
        cancelled: 'Cancelled'
    };
    return `<span class="sb ${esc(s)}">${esc(STATUS_TH[s] || s)} <span class="sr-only">${esc(enStatus[s] || s)}</span></span>`;
}

/* ===== TOAST ===== */
function showToast(msg, type = 'success') {
    const el = document.getElementById('toast');
    el.className = `toast ${type} show`;
    document.getElementById('toast-icon').innerHTML = type === 'success'
        ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>'
        : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    document.getElementById('toast-msg').textContent = msg;
    setTimeout(() => el.classList.remove('show'), 3500);
}

/* ===== TIMESTAMP ===== */
function setSync() {
    const t = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    document.getElementById('last-sync').textContent = `ล่าสุด ${t} น.`;
}

function setDashboardCardState(cardId, count, { zeroMuted = true, warning = false, alert = false, ok = false } = {}) {
    const el = document.getElementById(cardId);
    if (!el) return;
    el.classList.remove('is-muted', 'is-warning', 'is-alert', 'is-ok');
    if (zeroMuted && count === 0) el.classList.add('is-muted');
    if (warning && count > 0) el.classList.add('is-warning');
    if (alert && count > 0) el.classList.add('is-alert');
    if (ok && count > 0) el.classList.add('is-ok');
}

function setDashboardPrimaryAction(target, config) {
    const primaryCard = document.getElementById('dash-primary-card');
    const primaryButton = document.getElementById('btn-dash-primary-action');
    const chip = document.getElementById('dash-primary-chip');
    if (!primaryCard || !primaryButton || !chip) return;

    primaryCard.dataset.dashboardTarget = target;
    primaryButton.dataset.dashboardTarget = target;
    primaryCard.classList.remove('is-danger', 'is-warning', 'is-ok');
    chip.classList.remove('is-danger', 'is-warning', 'is-ok');

    document.getElementById('dash-primary-eyebrow').textContent = config.eyebrow;
    document.getElementById('dash-primary-title').textContent = config.title;
    document.getElementById('dash-primary-copy').textContent = config.copy;
    document.getElementById('dash-primary-value').textContent = config.value;
    document.getElementById('dash-primary-meta').textContent = config.meta;
    document.getElementById('dash-primary-cta').textContent = config.cta;
    document.getElementById('dash-primary-footnote').textContent = config.footnote;
    chip.textContent = config.chip;
    primaryButton.textContent = config.buttonLabel || config.cta;

    if (config.tone === 'danger') {
        primaryCard.classList.add('is-danger');
        chip.classList.add('is-danger');
    } else if (config.tone === 'warning') {
        primaryCard.classList.add('is-warning');
        chip.classList.add('is-warning');
    } else if (config.tone === 'ok') {
        primaryCard.classList.add('is-ok');
        chip.classList.add('is-ok');
    }
}

function setDashboardEmptyState(title, copy) {
    const titleEl = document.getElementById('dash-empty-title');
    const copyEl = document.getElementById('dash-empty-copy');
    if (titleEl) titleEl.textContent = title;
    if (copyEl) copyEl.textContent = copy;
}

function handleDashboardTargetActivation(event) {
    const targetEl = event.target.closest('[data-dashboard-target]');
    if (!targetEl) return;
    if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
    if (event.type === 'keydown') event.preventDefault();
    const target = targetEl.dataset.dashboardTarget;
    if (target) switchTab(target);
}

/* ===== MODAL HELPERS (animated) ===== */
let activeModalOverlay = null;
let lastFocusedBeforeModal = null;

function getFocusableElements(container) {
    if (!container) return [];
    return [...container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
        .filter((el) => !el.disabled && el.offsetParent !== null);
}

function openModal(id) {
    const overlay = document.getElementById(id);
    const panel = overlay.querySelector('[data-dialog-panel]');
    lastFocusedBeforeModal = document.activeElement;
    overlay.setAttribute('aria-hidden', 'false');
    overlay.classList.remove('hidden');
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            overlay.classList.add('visible');
            activeModalOverlay = overlay;
            setTimeout(() => {
                const focusable = getFocusableElements(panel);
                (focusable[0] || panel)?.focus();
            }, 0);
        });
    });
}

function closeModal(id) {
    const overlay = document.getElementById(id);
    overlay.setAttribute('aria-hidden', 'true');
    overlay.classList.remove('visible');
    if (activeModalOverlay === overlay) activeModalOverlay = null;
    setTimeout(() => overlay.classList.add('hidden'), 300);
    if (lastFocusedBeforeModal && typeof lastFocusedBeforeModal.focus === 'function') {
        lastFocusedBeforeModal.focus();
    }
}

/* ===== CUSTOM CONFIRM DIALOG ===== */
let _confirmResolve = null;

function showConfirm({ title, messageNode, message, okText, okClass }) {
    document.getElementById('confirm-title').textContent = title || 'ยืนยันการดำเนินการ';
    const msgContainer = document.getElementById('confirm-msg');
    msgContainer.innerHTML = '';
    if (messageNode) {
        msgContainer.appendChild(messageNode);
    } else if (message) {
        msgContainer.textContent = message;
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

document.addEventListener('keydown', (event) => {
    if (!activeModalOverlay) return;
    const panel = activeModalOverlay.querySelector('[data-dialog-panel]');
    if (event.key === 'Escape') {
        if (activeModalOverlay.id === 'confirm-dialog' && _confirmResolve) {
            _confirmResolve(false);
            _confirmResolve = null;
        }
        closeModal(activeModalOverlay.id);
        return;
    }
    if (event.key === 'Tab') {
        const focusable = getFocusableElements(panel);
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

/* ===== HELPERS ===== */
function buildPagination(containerId, total, current, onPage, pageSize = PAGE_SIZE) {
    const totalPages = Math.ceil(total / pageSize);
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = '';
    if (totalPages <= 1) return;

    const info = document.createElement('span');
    info.className = 'page-info';
    info.textContent = `รายการ ${(current - 1) * pageSize + 1}–${Math.min(current * pageSize, total)} จาก ${total}`;
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

function renderListSummary(summaryId, message) {
    const target = document.getElementById(summaryId);
    if (target) target.textContent = message;
}

function renderListActiveFilters(rootId, filteredCount, totalCount, chips = []) {
    const root = document.getElementById(rootId);
    if (!root) return;

    if (!chips.length) {
        root.innerHTML = `
            <div class="active-filter-meta">
                <strong>${filteredCount}</strong> จาก <strong>${totalCount}</strong> รายการ
            </div>
        `;
        return;
    }

    root.innerHTML = `
        <div class="active-filter-meta">
            <strong>${filteredCount}</strong> จาก <strong>${totalCount}</strong> รายการ
        </div>
        <div class="active-filter-chips">
            ${chips.join('')}
        </div>
    `;
}

function buildListChip(label, value, clearKey, passive = false) {
    return `
        <button type="button" class="filter-chip ${passive ? 'is-passive' : 'is-active'}" data-list-chip-clear="${clearKey}">
            ${esc(label)}: ${esc(value)}
            <span aria-hidden="true">x</span>
        </button>
    `;
}

function buildClearAllChip(scope) {
    return `<button type="button" class="filter-chip filter-chip-clear" data-list-chip-clear="all" data-list-chip-scope="${scope}">ล้างตัวกรองทั้งหมด</button>`;
}

function buildWorkspaceEmptyRow(colspan, title, copy, actionLabel = '', actionScope = '', actionKey = '') {
    const actionMarkup = actionLabel
        ? `<button type="button" class="btn btn-outline btn-sm" data-empty-action="${actionKey}" data-empty-scope="${actionScope}">${esc(actionLabel)}</button>`
        : '';
    return `
        <tr>
            <td colspan="${colspan}" class="borrow-empty-cell">
                <div class="borrow-empty-state">
                    <div class="borrow-empty-icon">${esc(title)}</div>
                    <h3>${esc(title)}</h3>
                    <p>${esc(copy)}</p>
                    ${actionMarkup}
                </div>
            </td>
        </tr>
    `;
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

function percentageChange(current, previous) {
    if (previous === 0) return current === 0 ? 0 : 100;
    return ((current - previous) / previous) * 100;
}

function trendText(current, previous, { lowerIsBetter = false, suffix = '%' } = {}) {
    const delta = percentageChange(current, previous);
    const abs = Math.abs(delta).toFixed(0);
    if (current === 0 && previous === 0) return 'ยังไม่มีข้อมูลเปรียบเทียบ';
    if (previous === 0 && current > 0) return `เริ่มมีข้อมูลแล้ว (${current}${suffix})`;
    if (Math.abs(delta) < 1) return 'ใกล้เคียงกับช่วงก่อนหน้า';

    const better = lowerIsBetter ? delta < 0 : delta > 0;
    return better ? `ดีกว่าช่วงก่อน ${abs}%` : `ต่ำกว่าช่วงก่อน ${abs}%`;
}

function setReportScale(scaleId, value) {
    const el = document.getElementById(scaleId);
    if (el) el.textContent = String(value);
}

function setReportInsight(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function setReportCardTone(cardId, tone) {
    const el = document.getElementById(cardId);
    if (!el) return;
    el.classList.remove('is-alert', 'is-warning', 'is-ok', 'is-muted');
    if (tone === 'alert') el.classList.add('is-alert');
    else if (tone === 'warning') el.classList.add('is-warning');
    else if (tone === 'ok') el.classList.add('is-ok');
    else if (tone === 'muted') el.classList.add('is-muted');
}

function applyReportsStaticCopy() {
    const sectionTitle = document.querySelector('#tab-reports .section-title');
    const sectionSub = document.querySelector('#tab-reports .section-sub');
    const exportRange = document.getElementById('export-range');
    const exportButton = document.getElementById('btn-export');
    const summaryKicker = document.querySelector('#tab-reports .analytics-summary-kicker');
    const labels = {
        approved: document.querySelector('#kpi-approved-card .stat-label'),
        cancelled: document.querySelector('#kpi-cancelled-card .stat-label'),
        leadtime: document.querySelector('#kpi-leadtime-card .stat-label'),
        topusage: document.querySelector('#kpi-topusage-card .stat-label')
    };

    if (sectionTitle) sectionTitle.textContent = 'รายงานและวิเคราะห์การใช้งาน';
    if (sectionSub) sectionSub.textContent = 'สรุปภาพรวมคลัง ความต้องการใช้งาน และสัญญาณที่ควรตัดสินใจต่อ';
    if (summaryKicker) summaryKicker.textContent = 'สรุปให้ตัดสินใจได้ทันที';

    if (exportRange?.options[0]) exportRange.options[0].text = 'ส่งออกเดือนนี้';
    if (exportRange?.options[1]) exportRange.options[1].text = 'ส่งออกทั้งหมด';
    if (exportRange) exportRange.title = 'เลือกช่วงข้อมูลสำหรับส่งออกรายงาน';
    if (exportButton) {
        exportButton.title = 'ดาวน์โหลดข้อมูลรายงานตามช่วงที่เลือก';
        const labelNode = [...exportButton.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
        if (labelNode) labelNode.textContent = ' ส่งออก CSV';
    }

    if (labels.approved) labels.approved.textContent = 'อัตราคำขอที่ไปต่อได้';
    if (labels.cancelled) labels.cancelled.textContent = 'อัตราคำขอที่สะดุด';
    if (labels.leadtime) labels.leadtime.textContent = 'เวลาวางแผนล่วงหน้าเฉลี่ย';
    if (labels.topusage) labels.topusage.textContent = 'รุ่นที่ถูกขอใช้มากสุด';
}

function isReportsTabActive() {
    return document.querySelector('.sidebar-link.active')?.dataset.tab === 'reports';
}

function isReportsAutoRefreshEnabled() {
    return !!document.getElementById('reports-auto-refresh')?.checked;
}

function setReportsRefreshNote(text) {
    const el = document.getElementById('reports-refresh-note');
    if (el) el.textContent = text;
}

function resetReportsAutoRefreshCountdown() {
    reportsRefreshRemaining = 60;
    if (!isReportsTabActive()) return;
    setReportsRefreshNote(
        isReportsAutoRefreshEnabled()
            ? `รีเฟรชอัตโนมัติในอีก ${reportsRefreshRemaining} วินาที`
            : 'หยุดรีเฟรชอัตโนมัติชั่วคราว'
    );
}

function startReportsAutoRefresh() {
    if (reportsAutoRefreshTimer) return;
    reportsAutoRefreshTimer = window.setInterval(async () => {
        if (!isReportsTabActive()) return;
        if (!isReportsAutoRefreshEnabled()) {
            setReportsRefreshNote('หยุดรีเฟรชอัตโนมัติชั่วคราว');
            return;
        }

        reportsRefreshRemaining = Math.max(0, reportsRefreshRemaining - 1);
        setReportsRefreshNote(`รีเฟรชอัตโนมัติในอีก ${reportsRefreshRemaining} วินาที`);

        if (reportsRefreshRemaining > 0 || reportsAutoRefreshInFlight) return;

        reportsAutoRefreshInFlight = true;
        try {
            await loadReports();
        } catch (err) {
            console.error('[Reports] Auto refresh failed:', err);
        } finally {
            reportsAutoRefreshInFlight = false;
            reportsRefreshRemaining = 60;
            setReportsRefreshNote(`รีเฟรชอัตโนมัติในอีก ${reportsRefreshRemaining} วินาที`);
        }
    }, 1000);
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

    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const { data: borrowData } = await sb.from('borrow_requests')
        .select(`
            status,
            borrow_request_items(start_date, end_date)
        `);

    const requests = borrowData || [];
    const pendingBorrowCount = requests.filter((req) => req.status === 'pending').length;
    const returnsDueToday = requests.filter((req) =>
        ['approved', 'returned_pending_inspection'].includes(req.status) &&
        (req.borrow_request_items || []).some((item) => String(item.end_date || '').split('T')[0] === today)
    ).length;
    const overduePickups = requests.filter((req) =>
        req.status === 'approved' &&
        (req.borrow_request_items || []).some((item) => String(item.start_date || '').split('T')[0] < today)
    ).length;
    const preparingTomorrow = requests.filter((req) =>
        req.status === 'approved' &&
        (req.borrow_request_items || []).some((item) => String(item.start_date || '').split('T')[0] === tomorrow)
    ).length;

    if (document.getElementById('dash-b-pending')) {
        document.getElementById('dash-b-pending').textContent = pendingBorrowCount;
    }
    if (document.getElementById('dash-b-returns-today')) {
        document.getElementById('dash-b-returns-today').textContent = returnsDueToday;
    }
    if (document.getElementById('dash-b-overdue-pickups')) {
        document.getElementById('dash-b-overdue-pickups').textContent = overduePickups;
    }
    if (document.getElementById('dash-b-preparing')) {
        document.getElementById('dash-b-preparing').textContent = preparingTomorrow;
    }

    const totalIssues = overduePickups + pendingBorrowCount + reviewCount;
    const readyCount = allActive.filter(m => m.status === 'ready').length;
    const maintenanceCount = allActive.filter(m => m.status === 'maintenance').length;
    const brokenCount = allActive.filter(m => m.status === 'broken').length;

    const borrowBadge = document.getElementById('borrow-badge');
    if (borrowBadge) {
        if (pendingBorrowCount > 0) {
            borrowBadge.textContent = pendingBorrowCount;
            borrowBadge.style.display = 'inline-block';
        } else {
            borrowBadge.style.display = 'none';
        }
    }

    setDashboardCardState('card-total', allActive.length, { zeroMuted: false });
    setDashboardCardState('card-ready', readyCount, { zeroMuted: false, ok: true });
    setDashboardCardState('card-maintenance', maintenanceCount, { warning: true });
    setDashboardCardState('card-broken', brokenCount, { alert: true });
    setDashboardCardState('card-review', reviewCount, { warning: true });
    setDashboardCardState('card-overdue', overduePickups, { alert: true });
    setDashboardCardState('urgent-overdue-card', overduePickups, { alert: true });
    setDashboardCardState('urgent-pending-card', pendingBorrowCount, { warning: true });
    setDashboardCardState('urgent-returns-card', returnsDueToday, {});
    setDashboardCardState('urgent-preparing-card', preparingTomorrow, { ok: true });

    if (overduePickups > 0) {
        setDashboardPrimaryAction('borrow-requests', {
            eyebrow: 'งานค้างสำคัญสุด',
            chip: 'เร่งด่วน',
            title: 'มีคำขอที่เลยวันรับของ ต้องเปิดคิวคำขอยืมก่อน',
            copy: 'รายการกลุ่มนี้มีความเสี่ยงต่อการพลาดการใช้งานหรือการประสานงานล่าช้า ควรเข้าหน้าคิวคำขอยืมและจัดการรายการค้างทันที',
            value: String(overduePickups),
            meta: 'รายการค้างที่เกินวันรับของ',
            cta: 'จัดการคำร้องค้าง',
            footnote: 'คลิกเพื่อเปิดคิวคำขอยืมและกรองงานที่ต้องแก้ก่อน',
            buttonLabel: 'จัดการคำร้องค้าง',
            tone: 'danger'
        });
        setDashboardEmptyState('มีงานด่วนที่ต้องเปิดก่อน', `วันนี้มี ${totalIssues} รายการที่ต้องติดตาม โดยรายการค้างเกินวันรับของควรมาก่อน`);
    } else if (pendingBorrowCount > 0) {
        setDashboardPrimaryAction('borrow-requests', {
            eyebrow: 'รอดำเนินการ',
            chip: 'ต้องตัดสินใจ',
            title: 'มีคำร้องรออนุมัติ ควรเปิดคิวคำขอยืมเป็นงานแรก',
            copy: 'เริ่มจากการอนุมัติหรือปฏิเสธคำร้องที่ค้าง เพื่อให้ผู้ใช้รู้ผลเร็วและลดงานสะสมในระบบ',
            value: String(pendingBorrowCount),
            meta: 'คำร้องที่ยังรอการตัดสินใจ',
            cta: 'เปิดคิวคำขอยืม',
            footnote: 'คลิกเพื่อจัดการคำร้องที่รออนุมัติทั้งหมด',
            buttonLabel: 'เปิดคิวคำขอยืม',
            tone: 'warning'
        });
        setDashboardEmptyState('มีงานที่ต้องตัดสินใจวันนี้', `คำร้องรออนุมัติ ${pendingBorrowCount} รายการ และมีงานรวมที่ต้องติดตาม ${totalIssues} รายการ`);
    } else if (reviewCount > 0) {
        setDashboardPrimaryAction('review', {
            eyebrow: 'รายการใหม่เข้าคลัง',
            chip: 'รอตรวจ',
            title: 'ไม่มีคำร้องค้าง แต่ยังมีรายการรออนุมัติเข้าคลัง',
            copy: 'ขั้นตอนถัดไปคือเปิดคิวอนุมัติหุ่นใหม่ เพื่อลดรายการค้างและทำให้ข้อมูลคลังพร้อมใช้งาน',
            value: String(reviewCount),
            meta: 'รายการรออนุมัติเข้าคลัง',
            cta: 'ตรวจรายการรออนุมัติ',
            footnote: 'คลิกเพื่อเปิดหน้าตรวจรายการใหม่ทันที',
            buttonLabel: 'ตรวจรายการรออนุมัติ',
            tone: 'warning'
        });
        setDashboardEmptyState('งานหลักถัดไปคือคิวอนุมัติ', `ไม่มีคำร้องค้าง แต่ยังมีรายการเข้าคลังที่ต้องตรวจ ${reviewCount} รายการ`);
    } else {
        setDashboardPrimaryAction('borrow-requests', {
            eyebrow: 'ภาพรวมวันนี้',
            chip: 'พร้อมใช้งาน',
            title: 'ไม่มีงานค้างเร่งด่วน ระบบอยู่ในสถานะพร้อมใช้งาน',
            copy: 'ตอนนี้ไม่มีคำร้องค้างและไม่มีรายการเกินกำหนด คุณสามารถตรวจงานเตรียมของหรือดูภาพรวมคลังต่อได้ตามต้องการ',
            value: String(returnsDueToday + preparingTomorrow),
            meta: 'งานติดตามแบบไม่เร่งด่วนวันนี้',
            cta: 'ดูคิวคำขอยืม',
            footnote: 'ถัดจากนี้แนะนำให้ดูงานครบกำหนดคืนหรือการเตรียมของล่วงหน้า',
            buttonLabel: 'ดูคิวคำขอยืม',
            tone: 'ok'
        });
        setDashboardEmptyState('ไม่มีงานวันนี้ที่ต้องรีบทำ', 'คิวเร่งด่วนเป็นศูนย์ทั้งหมด คุณสามารถใช้ dashboard นี้เพื่อตรวจภาพรวมคลังและงานเตรียมล่วงหน้าได้');
    }

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
        key: k, label: `${ageTh[k]}`, count: c
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
        tbody.innerHTML = '<tr><td colspan="4" class="tbl-empty">ไม่มีรายการรออนุมัติ</td></tr>';
    } else {
        tbody.innerHTML = reviewData.map(m => `
      <tr>
        <td class="sap-code">${esc(m.sap_id)}</td>
        <td class="asset-name-cell"><div class="asset-name-text">${esc(m.asset_name) || '—'}</div></td>
        <td>${agePill(m.asset_name)}</td>
        <td><button class="btn btn-success btn-sm" data-action="approve" data-id="${esc(m.sap_id)}">
          <svg style="vertical-align:middle;margin-right:4px;" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>อนุมัติ</button></td>
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
    filterReview();
    document.getElementById('review-badge').textContent = reviewData.length;
    setSync();
}

function renderReviewTable() {
    const start = (reviewPage - 1) * PAGE_SIZE;
    const page = reviewFiltered.slice(start, start + PAGE_SIZE);
    const tbody = document.getElementById('review-tbody');
    const chips = [];
    if (reviewQueryState.search) {
        chips.push(buildListChip('ค้นหา', reviewQueryState.search, 'review-search'));
    }
    if (reviewQueryState.sort !== 'name-asc') {
        const sortLabel = {
            'name-desc': 'ชื่อหุ่น Z-A',
            'sap-asc': 'SAP ID น้อยไปมาก',
            'sap-desc': 'SAP ID มากไปน้อย'
        }[reviewQueryState.sort] || 'ชื่อหุ่น A-Z';
        chips.push(buildListChip('เรียง', sortLabel, 'review-sort', true));
    }
    if (chips.length) chips.push(buildClearAllChip('review'));
    renderListActiveFilters('review-active-filters', reviewFiltered.length, reviewData.length, chips);
    renderListSummary(
        'review-results-summary',
        reviewFiltered.length === reviewData.length
            ? `รออนุมัติเข้าคลัง ${reviewData.length} รายการ`
            : `ตรงเงื่อนไข ${reviewFiltered.length} จาก ${reviewData.length} รายการ`
    );

    if (page.length === 0) {
        tbody.innerHTML = reviewData.length === 0
            ? buildWorkspaceEmptyRow(6, 'ไม่มีรายการรออนุมัติ', 'ถ้ามีหุ่นใหม่จาก Google Sheet เข้ามา หน้านี้จะแสดงคิวให้ตรวจสอบทันที')
            : buildWorkspaceEmptyRow(6, 'ไม่พบผลลัพธ์', 'ลองล้างคำค้นหาหรือกลับไปดูรายการทั้งหมดเพื่อไม่ให้พลาดคิวที่ต้องอนุมัติ', 'ล้างตัวกรองทั้งหมด', 'review', 'clear-filters');
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
        <button class="btn btn-success btn-sm" data-action="approve" data-id="${esc(m.sap_id)}">
          <svg style="vertical-align:middle;margin-right:4px;" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>อนุมัติ</button>
        <button class="btn btn-danger btn-sm" data-action="reject" data-id="${esc(m.sap_id)}">
          <svg style="vertical-align:middle;margin-right:4px;" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>ปฏิเสธ</button>
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

function filterReview() {
    reviewQueryState.search = document.getElementById('review-search').value.trim().toLowerCase();
    reviewQueryState.sort = document.getElementById('review-sort')?.value || 'name-asc';
    reviewFiltered = reviewData.filter((m) => !reviewQueryState.search || m.asset_name?.toLowerCase().includes(reviewQueryState.search) || m.sap_id?.includes(reviewQueryState.search));
    reviewFiltered.sort((a, b) => {
        if (reviewQueryState.sort === 'name-desc') return String(b.asset_name || '').localeCompare(String(a.asset_name || ''), 'th');
        if (reviewQueryState.sort === 'sap-asc') return String(a.sap_id || '').localeCompare(String(b.sap_id || ''), 'en');
        if (reviewQueryState.sort === 'sap-desc') return String(b.sap_id || '').localeCompare(String(a.sap_id || ''), 'en');
        return String(a.asset_name || '').localeCompare(String(b.asset_name || ''), 'th');
    });
    reviewPage = 1;
    renderReviewTable();
}
document.getElementById('review-search').addEventListener('input', filterReview);
document.getElementById('review-sort')?.addEventListener('change', filterReview);

function filterRecycle() {
    recycleQueryState.search = document.getElementById('recycle-search')?.value.trim().toLowerCase() || '';
    recycleQueryState.sort = document.getElementById('recycle-sort')?.value || 'deleted-desc';
    recycleFiltered = recycleData.filter((m) => !recycleQueryState.search || m.asset_name?.toLowerCase().includes(recycleQueryState.search) || m.sap_id?.toLowerCase().includes(recycleQueryState.search) || m.asset_code?.toLowerCase().includes(recycleQueryState.search));
    recycleFiltered.sort((a, b) => {
        if (recycleQueryState.sort === 'deleted-asc') return new Date(a.deleted_at || 0) - new Date(b.deleted_at || 0);
        if (recycleQueryState.sort === 'name-asc') return String(a.asset_name || '').localeCompare(String(b.asset_name || ''), 'th');
        if (recycleQueryState.sort === 'sap-asc') return String(a.sap_id || '').localeCompare(String(b.sap_id || ''), 'en');
        return new Date(b.deleted_at || 0) - new Date(a.deleted_at || 0);
    });
    recyclePage = 1;
    renderRecycleTable();
}
document.getElementById('recycle-search')?.addEventListener('input', filterRecycle);
document.getElementById('recycle-sort')?.addEventListener('change', filterRecycle);

document.addEventListener('click', (event) => {
    const clearTarget = event.target.closest('[data-list-chip-clear], [data-empty-action="clear-filters"]');
    if (!clearTarget) return;

    const scope = clearTarget.dataset.listChipScope || clearTarget.dataset.emptyScope;
    const key = clearTarget.dataset.listChipClear || clearTarget.dataset.emptyAction;

    if (scope === 'review') {
        if (key === 'review-search') document.getElementById('review-search').value = '';
        if (key === 'review-sort') document.getElementById('review-sort').value = 'name-asc';
        if (key === 'all' || key === 'clear-filters') {
            document.getElementById('review-search').value = '';
            document.getElementById('review-sort').value = 'name-asc';
        }
        filterReview();
    }

    if (scope === 'recycle') {
        if (key === 'recycle-search') document.getElementById('recycle-search').value = '';
        if (key === 'recycle-sort') document.getElementById('recycle-sort').value = 'deleted-desc';
        if (key === 'all' || key === 'clear-filters') {
            document.getElementById('recycle-search').value = '';
            document.getElementById('recycle-sort').value = 'deleted-desc';
        }
        filterRecycle();
    }

    if (scope === 'manikin') {
        if (key === 'manikin-search') document.getElementById('manikin-search').value = '';
        if (key === 'manikin-status') document.getElementById('manikin-status-filter').value = '';
        if (key === 'manikin-sort') document.getElementById('manikin-sort').value = 'name-asc';
        if (key === 'all' || key === 'clear-filters') {
            document.getElementById('manikin-search').value = '';
            document.getElementById('manikin-status-filter').value = '';
            document.getElementById('manikin-sort').value = 'name-asc';
        }
        filterManikins();
    }

    if (scope === 'locations') {
        if (key === 'locations-search') document.getElementById('locations-search').value = '';
        if (key === 'locations-sort') document.getElementById('locations-sort').value = 'building-asc';
        if (key === 'all' || key === 'clear-filters') {
            document.getElementById('locations-search').value = '';
            document.getElementById('locations-sort').value = 'building-asc';
        }
        filterLocations();
    }
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
    filterRecycle();
}

function renderRecycleTable() {
    const start = (recyclePage - 1) * PAGE_SIZE;
    const page = recycleFiltered.slice(start, start + PAGE_SIZE);
    const tbody = document.getElementById('recycle-tbody');
    const chips = [];
    if (recycleQueryState.search) {
        chips.push(buildListChip('ค้นหา', recycleQueryState.search, 'recycle-search'));
    }
    if (recycleQueryState.sort !== 'deleted-desc') {
        const sortLabel = {
            'deleted-asc': 'เก่าสุดก่อน',
            'name-asc': 'ชื่อหุ่น A-Z',
            'sap-asc': 'SAP ID น้อยไปมาก'
        }[recycleQueryState.sort] || 'ล่าสุดก่อน';
        chips.push(buildListChip('เรียง', sortLabel, 'recycle-sort', true));
    }
    if (chips.length) chips.push(buildClearAllChip('recycle'));
    renderListActiveFilters('recycle-active-filters', recycleFiltered.length, recycleData.length, chips);
    renderListSummary(
        'recycle-results-summary',
        recycleFiltered.length === recycleData.length
            ? `ประวัติที่ถูกปฏิเสธ ${recycleData.length} รายการ`
            : `ตรงเงื่อนไข ${recycleFiltered.length} จาก ${recycleData.length} รายการ`
    );

    if (page.length === 0) {
        tbody.innerHTML = recycleData.length === 0
            ? buildWorkspaceEmptyRow(5, 'ถังขยะว่างเปล่า', 'ยังไม่มีรายการที่ถูกปฏิเสธหรือส่งกลับมารอการกู้คืน')
            : buildWorkspaceEmptyRow(5, 'ไม่พบผลลัพธ์', 'ลองล้างคำค้นหาหรือกลับไปดูรายการทั้งหมดเพื่อค้นหารายการที่ต้องการกู้คืน', 'ล้างตัวกรองทั้งหมด', 'recycle', 'clear-filters');
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
let recycleData = [];
let recycleFiltered = [];
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
    filterManikins();
    setSync();
}

function filterManikins() {
    manikinQueryState.search = document.getElementById('manikin-search').value.trim().toLowerCase();
    manikinQueryState.status = document.getElementById('manikin-status-filter').value;
    manikinQueryState.sort = document.getElementById('manikin-sort')?.value || 'name-asc';
    manikinFiltered = manikinData.filter(m => {
        const matchQ = !manikinQueryState.search || m.asset_name?.toLowerCase().includes(manikinQueryState.search) || m.sap_id?.includes(manikinQueryState.search);
        const matchS = !manikinQueryState.status || m.status === manikinQueryState.status;
        return matchQ && matchS;
    });
    manikinFiltered.sort((a, b) => {
        if (manikinQueryState.sort === 'name-desc') return String(b.asset_name || '').localeCompare(String(a.asset_name || ''), 'th');
        if (manikinQueryState.sort === 'status') return String(STATUS_TH[a.status] || a.status || '').localeCompare(String(STATUS_TH[b.status] || b.status || ''), 'th');
        if (manikinQueryState.sort === 'location') return locationLabel(a.location_id).localeCompare(locationLabel(b.location_id), 'th');
        return String(a.asset_name || '').localeCompare(String(b.asset_name || ''), 'th');
    });
    manikinPage = 1;
    renderManikinTable();
}

document.getElementById('manikin-search').addEventListener('input', filterManikins);
document.getElementById('manikin-status-filter').addEventListener('change', filterManikins);
document.getElementById('manikin-sort')?.addEventListener('change', filterManikins);

function locationLabel(lid) {
    if (!lid) return '<span style="color:var(--text-dim)">—</span>';
    const loc = allLocations.find(l => String(l.id) === String(lid));
    return loc ? `${esc(loc.building)} / ${esc(loc.room)}` : `(${esc(lid)})`;
}

function renderManikinTable() {
    const start = (manikinPage - 1) * PAGE_SIZE;
    const page = manikinFiltered.slice(start, start + PAGE_SIZE);
    const tbody = document.getElementById('manikin-tbody');
    const chips = [];
    if (manikinQueryState.search) chips.push(buildListChip('ค้นหา', manikinQueryState.search, 'manikin-search'));
    if (manikinQueryState.status) chips.push(buildListChip('สถานะ', STATUS_TH[manikinQueryState.status] || manikinQueryState.status, 'manikin-status'));
    if (manikinQueryState.sort !== 'name-asc') {
        const sortLabel = {
            'name-desc': 'ชื่อหุ่น Z-A',
            status: 'สถานะ',
            location: 'ที่ตั้ง'
        }[manikinQueryState.sort] || 'ชื่อหุ่น A-Z';
        chips.push(buildListChip('เรียง', sortLabel, 'manikin-sort', true));
    }
    if (chips.length) chips.push(buildClearAllChip('manikin'));
    renderListActiveFilters('manikin-active-filters', manikinFiltered.length, manikinData.length, chips);
    renderListSummary(
        'manikin-results-summary',
        manikinFiltered.length === manikinData.length
            ? `แสดงรายการในคลัง ${manikinData.length} รายการ`
            : `ตรงเงื่อนไข ${manikinFiltered.length} จาก ${manikinData.length} รายการ`
    );

    if (page.length === 0) {
        tbody.innerHTML = manikinData.length === 0
            ? buildWorkspaceEmptyRow(8, 'ยังไม่มีหุ่นในคลัง', 'เมื่อมีการอนุมัติเข้าคลัง รายการจะปรากฏที่หน้านี้ทันที')
            : buildWorkspaceEmptyRow(8, 'ไม่พบผลลัพธ์', 'ลองล้างคำค้นหา เปลี่ยนสถานะ หรือกลับไปดูรายการทั้งหมด', 'ล้างตัวกรองทั้งหมด', 'manikin', 'clear-filters');
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
      <td><button class="btn btn-ghost btn-sm" data-action="edit" data-id="${esc(m.sap_id)}">
          <svg style="vertical-align:middle;margin-right:4px;" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>แก้ไข</button></td>
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
    locationRows = allLocations.map((location) => ({
        ...location,
        active_count: countMap[location.id] || 0
    }));
    filterLocations();
}

function filterLocations() {
    locationsQueryState.search = document.getElementById('locations-search')?.value.trim().toLowerCase() || '';
    locationsQueryState.sort = document.getElementById('locations-sort')?.value || 'building-asc';
    locationFiltered = locationRows.filter((location) => {
        if (!locationsQueryState.search) return true;
        return String(location.id).toLowerCase().includes(locationsQueryState.search)
            || String(location.building || '').toLowerCase().includes(locationsQueryState.search)
            || String(location.room || '').toLowerCase().includes(locationsQueryState.search);
    });
    locationFiltered.sort((a, b) => {
        if (locationsQueryState.sort === 'building-desc') return String(b.building || '').localeCompare(String(a.building || ''), 'th');
        if (locationsQueryState.sort === 'room-asc') return String(a.room || '').localeCompare(String(b.room || ''), 'th');
        if (locationsQueryState.sort === 'count-desc') return (b.active_count || 0) - (a.active_count || 0);
        return String(a.building || '').localeCompare(String(b.building || ''), 'th');
    });
    locationsPage = 1;
    renderLocationsTable();
}

function renderLocationsTable() {
    const start = (locationsPage - 1) * PAGE_SIZE;
    const page = locationFiltered.slice(start, start + PAGE_SIZE);
    const tbody = document.getElementById('locations-tbody');
    const chips = [];
    if (locationsQueryState.search) chips.push(buildListChip('ค้นหา', locationsQueryState.search, 'locations-search'));
    if (locationsQueryState.sort !== 'building-asc') {
        const sortLabel = {
            'building-desc': 'อาคาร Z-A',
            'room-asc': 'ห้อง A-Z',
            'count-desc': 'จำนวนหุ่นมากสุด'
        }[locationsQueryState.sort] || 'อาคาร A-Z';
        chips.push(buildListChip('เรียง', sortLabel, 'locations-sort', true));
    }
    if (chips.length) chips.push(buildClearAllChip('locations'));
    renderListActiveFilters('locations-active-filters', locationFiltered.length, locationRows.length, chips);
    renderListSummary(
        'locations-results-summary',
        locationFiltered.length === locationRows.length
            ? `แสดงสถานที่ทั้งหมด ${locationRows.length} รายการ`
            : `ตรงเงื่อนไข ${locationFiltered.length} จาก ${locationRows.length} รายการ`
    );

    if (page.length === 0) {
        tbody.innerHTML = locationRows.length === 0
            ? buildWorkspaceEmptyRow(5, 'ยังไม่มีสถานที่', 'กรุณาเพิ่มสถานที่ใหม่เพื่อเริ่มผูกหุ่นเข้ากับคลังหรือห้องฝึก')
            : buildWorkspaceEmptyRow(5, 'ไม่พบผลลัพธ์', 'ลองล้างคำค้นหาหรือกลับไปดูรายการทั้งหมดของอาคารและห้อง', 'ล้างตัวกรองทั้งหมด', 'locations', 'clear-filters');
        document.getElementById('locations-pagination').innerHTML = '';
        return;
    }

    tbody.innerHTML = page.map(l => `
    <tr>
      <td class="sap-code">${esc(l.id)}</td>
      <td>${esc(l.building) || '—'}</td>
      <td>${esc(l.room) || '—'}</td>
      <td>${l.active_count || 0} ตัว</td>
      <td style="display:flex;gap:6px">
        <button class="btn btn-ghost btn-sm" data-action="editLoc" data-id="${esc(l.id)}" title="แก้ไข">
          <svg style="vertical-align:middle;" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
        </button>
        <button class="btn btn-danger btn-sm" data-action="deleteLoc" data-id="${esc(l.id)}" title="ลบ">
          <svg style="vertical-align:middle;" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
        </button>
      </td>
    </tr>
  `).join('');
    buildPagination('locations-pagination', locationFiltered.length, locationsPage, (p) => { locationsPage = p; renderLocationsTable(); });
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
document.getElementById('locations-search')?.addEventListener('input', filterLocations);
document.getElementById('locations-sort')?.addEventListener('change', filterLocations);

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
        key: k, label: `${ageTh[k]}`, count: c
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
                    const eqName = item.equipments?.name_th || 'ไม่ระบุชื่อ';
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

async function loadReportsExperience() {
    applyReportsStaticCopy();

    const statusColors = { ready: '#22c55e', in_use: '#06b6d4', maintenance: '#f59e0b', broken: '#ef4444', missing: '#94a3b8' };
    const ageColors = { adult: '#4a9fd4', child: '#fbbf24', infant: '#06b6d4', other: '#94a3b8' };

    const [manikinRes, borrowRes] = await Promise.all([
        sb.from('manikins').select('status, asset_name').eq('is_active', true).eq('needs_review', false),
        sb.from('borrow_requests').select(`
            tracking_id,
            borrower_name,
            borrower_email,
            purpose,
            status,
            created_at,
            borrow_request_items(start_date, equipments(name_th))
        `)
    ]);

    if (manikinRes.error || borrowRes.error) {
        console.error('[Reports] Load failed:', manikinRes.error || borrowRes.error);
        showToast('โหลดข้อมูลรายงานไม่สำเร็จ', 'error');
        return;
    }

    const all = manikinRes.data || [];
    const reqs = borrowRes.data || [];
    const now = new Date();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const currentMonthReqs = reqs.filter((r) => {
        const created = new Date(r.created_at);
        return created >= startOfThisMonth && created < startOfNextMonth;
    });
    const previousMonthReqs = reqs.filter((r) => {
        const created = new Date(r.created_at);
        return created >= startOfPrevMonth && created < startOfThisMonth;
    });

    const summarizeRequests = (rows) => {
        let approved = 0;
        let cancelled = 0;
        let leadTimeDays = 0;
        let leadTimeCount = 0;
        const topUsage = {};

        rows.forEach((r) => {
            if (['approved', 'returned_pending_inspection', 'returned'].includes(r.status)) approved += 1;
            if (['cancelled', 'rejected'].includes(r.status)) cancelled += 1;

            if (r.borrow_request_items?.length) {
                const createdAt = new Date(r.created_at);
                const earliestStart = r.borrow_request_items.reduce((min, cur) =>
                    !min || cur.start_date < min ? cur.start_date : min
                , null);
                if (earliestStart) {
                    const diffDays = Math.max(0, (new Date(earliestStart) - createdAt) / 86400000);
                    leadTimeDays += diffDays;
                    leadTimeCount += 1;
                }
            }

            if (!['cancelled', 'rejected'].includes(r.status)) {
                (r.borrow_request_items || []).forEach((item) => {
                    const name = item.equipments?.name_th || 'ไม่ระบุชื่อ';
                    topUsage[name] = (topUsage[name] || 0) + 1;
                });
            }
        });

        const total = rows.length;
        return {
            total,
            approvedRate: total ? (approved / total) * 100 : 0,
            cancelledRate: total ? (cancelled / total) * 100 : 0,
            avgLeadTime: leadTimeCount ? leadTimeDays / leadTimeCount : 0,
            topUsage
        };
    };

    const currentSummary = summarizeRequests(currentMonthReqs);
    const previousSummary = summarizeRequests(previousMonthReqs);

    const statusRows = ['ready', 'in_use', 'maintenance', 'broken', 'missing'].map((k) => ({
        key: k,
        label: STATUS_TH[k] || k,
        count: all.filter((m) => m.status === k).length
    })).filter((d) => d.count > 0);
    renderBars('rpt-status-bars', statusRows, (k) => statusColors[k] || '#888');
    setReportScale('rpt-status-scale-max', Math.max(...statusRows.map((row) => row.count), 0));

    const ageGroups = { adult: 0, child: 0, infant: 0, other: 0 };
    all.forEach((m) => ageGroups[detectAge(m.asset_name)]++);
    const ageRows = Object.entries(ageGroups).map(([k, c]) => ({
        key: k,
        label: ageTh[k],
        count: c
    })).filter((d) => d.count > 0);
    renderBars('rpt-age-bars', ageRows, (k) => ageColors[k] || '#888');

    const modelCount = {};
    all.forEach((m) => { modelCount[m.asset_name] = (modelCount[m.asset_name] || 0) + 1; });
    const top10 = Object.entries(modelCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, count]) => ({ key: name, label: name, count }));
    renderBars('rpt-model-bars', top10, () => '#2575b8');
    setReportScale('rpt-model-scale-max', Math.max(...top10.map((row) => row.count), 0));

    const approvedRate = currentSummary.approvedRate;
    const cancelledRate = currentSummary.cancelledRate;
    const avgLeadTime = currentSummary.avgLeadTime;
    const topUsageRows = Object.entries(currentSummary.topUsage).sort((a, b) => b[1] - a[1]);
    const topUsedName = topUsageRows.length ? topUsageRows[0][0] : 'ยังไม่มีข้อมูล';
    const topUsedCount = topUsageRows.length ? topUsageRows[0][1] : 0;

    document.getElementById('kpi-approved').textContent = `${approvedRate.toFixed(1)}%`;
    document.getElementById('kpi-cancelled').textContent = `${cancelledRate.toFixed(1)}%`;
    document.getElementById('kpi-leadtime').textContent = `${avgLeadTime.toFixed(1)} วัน`;
    document.getElementById('kpi-topusage').textContent = topUsedName;
    document.getElementById('kpi-topusage').title = topUsedName;

    document.getElementById('kpi-approved-card').title = 'อัตราคำขอที่ได้รับอนุมัติจากคำขอทั้งหมดของเดือนนี้';
    document.getElementById('kpi-cancelled-card').title = 'สัดส่วนคำขอที่ถูกยกเลิกหรือปฏิเสธในเดือนนี้';
    document.getElementById('kpi-leadtime-card').title = 'จำนวนวันเฉลี่ยระหว่างวันที่สร้างคำขอกับวันเริ่มยืมที่เร็วที่สุด';
    document.getElementById('kpi-topusage-card').title = 'หุ่นที่ถูกขอใช้งานมากที่สุดของเดือนนี้';

    document.getElementById('kpi-approved-context').textContent =
        `${trendText(approvedRate, previousSummary.approvedRate)} เทียบเดือนก่อน`;
    document.getElementById('kpi-cancelled-context').textContent =
        `${trendText(cancelledRate, previousSummary.cancelledRate, { lowerIsBetter: true })} เทียบเดือนก่อน`;
    document.getElementById('kpi-leadtime-context').textContent =
        `${trendText(avgLeadTime, previousSummary.avgLeadTime, { lowerIsBetter: true, suffix: ' วัน' })} เทียบเดือนก่อน`;
    document.getElementById('kpi-topusage-context').textContent = topUsageRows.length
        ? `${topUsedCount} รายการในเดือนนี้`
        : 'ยังไม่มีการยืมในเดือนนี้';

    document.getElementById('kpi-approved-insight').textContent = approvedRate >= 70
        ? 'การอนุมัติอยู่ในเกณฑ์ดีสำหรับเดือนนี้'
        : currentMonthReqs.length
            ? 'อัตราอนุมัติยังต่ำ ควรดูสาเหตุการปฏิเสธและคอขวดในคิวคำขอ'
            : 'ยังไม่มีการใช้งานพอสำหรับประเมินคุณภาพการอนุมัติ';
    document.getElementById('kpi-cancelled-insight').textContent = cancelledRate >= 20
        ? 'การยกเลิกสูง ควรตรวจว่ามาจากของไม่พร้อมหรือการตอบกลับช้า'
        : currentMonthReqs.length
            ? 'อัตรายกเลิกยังอยู่ในช่วงที่ควบคุมได้'
            : 'ยังไม่มีปริมาณคำขอ จึงยังไม่มีสัญญาณเรื่องการยกเลิก';
    document.getElementById('kpi-leadtime-insight').textContent = avgLeadTime <= 3 && currentSummary.total
        ? 'ผู้ใช้จองใกล้วันใช้งาน ควรเตรียมของให้ตอบสนองเร็ว'
        : currentSummary.total
            ? 'โดยเฉลี่ยยังมีเวลาเตรียมของเพียงพอ'
            : 'เวลาเตรียมของจะเริ่มคำนวณเมื่อมีคำขอที่ระบุวันใช้งาน';
    document.getElementById('kpi-topusage-insight').textContent = topUsageRows.length
        ? `${topUsedName} เป็นสัญญาณความต้องการที่ชัดที่สุดของเดือนนี้`
        : 'เดือนนี้ยังไม่เห็นรูปแบบความต้องการที่ชัดเจน';

    setReportCardTone('kpi-approved-card', currentMonthReqs.length === 0 ? 'muted' : approvedRate >= 70 ? 'ok' : approvedRate >= 50 ? 'warning' : 'alert');
    setReportCardTone('kpi-cancelled-card', currentMonthReqs.length === 0 ? 'muted' : cancelledRate >= 20 ? 'alert' : cancelledRate >= 10 ? 'warning' : 'ok');
    setReportCardTone('kpi-leadtime-card', currentMonthReqs.length === 0 ? 'muted' : avgLeadTime <= 2 ? 'warning' : 'ok');
    setReportCardTone('kpi-topusage-card', topUsageRows.length === 0 ? 'muted' : 'ok');

    const emptyState = document.getElementById('reports-empty-state');
    const emptyTitle = document.getElementById('reports-empty-title');
    const emptyCopy = document.getElementById('reports-empty-copy');
    if (currentMonthReqs.length === 0) {
        emptyState?.classList.remove('hidden');
        if (emptyTitle) emptyTitle.textContent = 'เดือนนี้ยังไม่มีการใช้งาน';
        if (emptyCopy) emptyCopy.textContent = 'เมื่อมีคำขอแรกเข้ามา ระบบจะเริ่มสรุปแนวโน้มการใช้งาน คุณภาพการอนุมัติ และเวลาการเตรียมของให้อัตโนมัติ';
    } else {
        emptyState?.classList.add('hidden');
    }

    const summaryTitle = document.getElementById('reports-summary-title');
    const summaryCopy = document.getElementById('reports-summary-copy');
    const summaryFoot = document.getElementById('reports-summary-foot');
    if (currentMonthReqs.length === 0) {
        summaryTitle.textContent = 'ตอนนี้ยังไม่มี insight สำหรับตัดสินใจจาก analytics';
        summaryCopy.textContent = 'เดือนนี้ยังไม่มีคำขอยืมเข้ามา หน้านี้จึงเน้นบอกความพร้อมของคลังและสิ่งที่จะเริ่มแสดงเมื่อมีการใช้งาน';
        summaryFoot.textContent = 'แนะนำให้ตรวจความพร้อมของคลัง หรือรอคำขอแรกเพื่อเริ่มอ่านแนวโน้ม';
    } else if (cancelledRate >= 20) {
        summaryTitle.textContent = 'ความเสี่ยงหลักตอนนี้คือคำขอที่ยกเลิกหรือไม่ผ่าน';
        summaryCopy.textContent = `เดือนนี้มีคำขอที่ยกเลิกหรือถูกปฏิเสธ ${cancelledRate.toFixed(1)}% ซึ่งเป็นสัญญาณที่ควรลงไปตรวจสอบก่อน`;
        summaryFoot.textContent = 'แนะนำให้ตรวจคำขอที่ไม่สำเร็จ แล้วแยกว่าเกิดจากของไม่พร้อม เวลาชนกัน หรือกระบวนการอนุมัติช้า';
    } else if (approvedRate < 70) {
        summaryTitle.textContent = 'กระบวนการอนุมัติยังต้องปรับ';
        summaryCopy.textContent = `เดือนนี้อัตราอนุมัติอยู่ที่ ${approvedRate.toFixed(1)}% จึงควรโฟกัสที่ความเร็วในการตัดสินใจและคุณภาพของคำขอ`;
        summaryFoot.textContent = 'แนะนำให้เปิดดูคำขอค้างและคำขอที่ถูกปฏิเสธเพื่อลด friction ที่เลี่ยงได้';
    } else {
        summaryTitle.textContent = 'ภาพรวมเดือนนี้ยังอยู่ในเกณฑ์ดี';
        summaryCopy.textContent = `เดือนนี้มีคำขอ ${currentMonthReqs.length} รายการ และคุณภาพการอนุมัติยังคงเสถียร ใช้กราฟด้านล่างดูว่าความต้องการไปกองอยู่ที่รุ่นไหนและมีแรงกดดันเรื่องการเตรียมของหรือไม่`;
        summaryFoot.textContent = 'แนะนำให้ติดตามรุ่นที่ถูกใช้มากที่สุด และอย่าปล่อยให้เวลาเตรียมของสั้นลงเกินไป';
    }

    const problemStatus = statusRows
        .filter((row) => ['maintenance', 'broken', 'missing'].includes(row.key))
        .sort((a, b) => b.count - a.count)[0];
    const readyStatus = statusRows.find((row) => row.key === 'ready');
    setReportInsight(
        'rpt-status-insight',
        problemStatus
            ? `${problemStatus.label} เป็นกลุ่มปัญหาหลักตอนนี้ ${problemStatus.count} ชิ้น ขณะที่หุ่นพร้อมใช้ยังเหลือ ${readyStatus?.count || 0} ชิ้น`
            : `หุ่นพร้อมใช้เป็นสัดส่วนหลัก ${readyStatus?.count || 0} ชิ้น และยังไม่เห็น backlog งานซ่อมที่น่ากังวล`
    );

    const topAge = ageRows.slice().sort((a, b) => b.count - a.count)[0];
    const lowAge = ageRows.slice().sort((a, b) => a.count - b.count)[0];
    const totalAge = ageRows.reduce((sum, row) => sum + row.count, 0) || 1;
    setReportInsight(
        'rpt-age-insight',
        topAge
            ? `${topAge.label} มีสัดส่วนมากที่สุด ${((topAge.count / totalAge) * 100).toFixed(0)}% ${lowAge && lowAge.key !== topAge.key ? `${lowAge.label} เป็นกลุ่มที่มีน้อยที่สุด` : 'โครงสร้างคลังค่อนข้างกระจุกในช่วงอายุเดียว'}`
            : 'สัดส่วนตามช่วงอายุจะแสดงเมื่อมีข้อมูลหุ่นที่ active'
    );

    const topModel = top10[0];
    const secondModel = top10[1];
    setReportInsight(
        'rpt-model-insight',
        topModel
            ? `${topModel.label} เป็นรุ่นที่มีมากที่สุด ${topModel.count} ชิ้น${secondModel ? ` มากกว่ารุ่นถัดไป ${topModel.count - secondModel.count} ชิ้น` : ''}`
            : 'อันดับรุ่นที่มีมากที่สุดจะแสดงเมื่อมีข้อมูลหุ่นที่พร้อมใช้งาน'
    );

    resetReportsAutoRefreshCountdown();
    setSync();
}

async function exportReportsCsv(range = 'month') {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    let query = sb.from('borrow_requests')
        .select(`
            tracking_id,
            borrower_name,
            borrower_email,
            purpose,
            status,
            created_at,
            borrow_request_items(start_date, equipments(name_th))
        `)
        .order('created_at', { ascending: false });

    if (range === 'month') query = query.gte('created_at', monthStart);

    const { data, error } = await query;
    if (error) throw error;

    const rows = data || [];
    if (!rows.length) {
        showToast('ไม่มีข้อมูลรายงานสำหรับ export', 'warning');
        return;
    }

    const csv = [
        ['รหัสติดตาม', 'ผู้ยืม', 'อีเมล', 'สถานะ', 'วันที่สร้างคำขอ', 'วันเริ่มใช้งานแรกสุด', 'รายการที่ยืม', 'วัตถุประสงค์'].join(','),
        ...rows.map((r) => {
            const earliestStart = (r.borrow_request_items || [])
                .map((item) => item.start_date || '')
                .filter(Boolean)
                .sort()[0] || '';
            const itemNames = (r.borrow_request_items || [])
                .map((item) => item.equipments?.name_th || 'ไม่ระบุชื่อ')
                .join(' | ');

            return [
                r.tracking_id || '',
                `"${String(r.borrower_name || '').replace(/"/g, '""')}"`,
                `"${String(r.borrower_email || '').replace(/"/g, '""')}"`,
                `"${String(r.status || '').replace(/"/g, '""')}"`,
                r.created_at || '',
                earliestStart,
                `"${itemNames.replace(/"/g, '""')}"`,
                `"${String(r.purpose || '').replace(/"/g, '""')}"`
            ].join(',');
        })
    ].join('\n');

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `simset_reports_${range}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Export ข้อมูลรายงาน${range === 'month' ? 'เดือนนี้' : 'ทั้งหมด'}สำเร็จ`);
}

document.getElementById('btn-export')?.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();

    const btn = event.currentTarget;
    const range = document.getElementById('export-range')?.value || 'month';
    btn.disabled = true;
    try {
        await exportReportsCsv(range);
    } catch (error) {
        console.error('[Reports] Export failed:', error);
        showToast('Export ไม่สำเร็จ', 'error');
    } finally {
        btn.disabled = false;
    }
}, true);

document.getElementById('reports-auto-refresh')?.addEventListener('change', () => {
    resetReportsAutoRefreshCountdown();
});

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
    applyStaffRegroupStructure();
    applyStaffRegroupLabels();
    applyReportsStaticCopy();
    startReportsAutoRefresh();
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

/* ===== GLOBAL EVENT DELEGATION (STRICT CSP) ===== */
document.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    // Static dashboard buttons
    if (btn.id === 'btn-dash-review' || btn.id === 'btn-dash-review-secondary') switchTab('review');
    else if (btn.id === 'btn-dash-borrow-requests') switchTab('borrow-requests');
    else if (btn.id === 'btn-dash-primary-action') switchTab(btn.dataset.dashboardTarget || 'borrow-requests');
    else if (btn.id === 'btn-close-edit') closeModal('edit-modal');
    else if (btn.id === 'btn-close-loc') closeModal('location-modal');
    // Teams buttons
    else if (btn.id === 'btn-new-team') openTeamModal();
    else if (btn.id === 'btn-edit-team') openTeamModal(true);
    else if (btn.id === 'btn-delete-team') deleteTeam();
    else if (btn.id === 'btn-add-member') openAddMemberModal();
    else if (btn.id === 'btn-close-team-skip-alert') document.getElementById('team-skip-alert')?.classList.add('hidden');
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
    loadTeamImages(code);
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
            '<td style="text-align:center;"><button class="btn btn-sm" style="color:#ef4444;border:1px solid rgba(239,68,68,0.3);font-size:0.72rem;display:inline-flex;align-items:center;justify-content:center;gap:4px;" data-action="removeMember" data-sap="' + esc(m.sap_id) + '"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>เอาออก</button></td>' +
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
            alertMsg.textContent = 'ข้าม ' + skipped.join(', ') + ' เนื่องจากสถานะ In-use จ่ายตัวถัดไป: ' + code + ' ' + String(next.team_order).padStart(2, '0');
            alertEl.classList.remove('hidden');
        } else {
            alertEl.classList.add('hidden');
        }
    } else {
        badge.textContent = '⚫ ไม่มีหุ่นพร้อมใช้';
        alertMsg.textContent = 'หุ่นทุกตัวใน Team ' + code + ' ไม่พร้อม ไม่สามารถจ่ายได้ขณะนี้';
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

async function syncTeamToEquipments(teamCode, displayName) {
    const { error } = await sb.from('equipments').upsert({
        source_team_code: teamCode,
        name_th: displayName,
        type: 'UNIT',
        total_quantity: 0,
        maintenance_quantity: 0,
        borrow_enabled: true
    }, { onConflict: 'source_team_code' });
    if (error) console.warn('[syncTeamToEquipments] upsert failed:', error.message);
}

async function saveTeam() {
    const code = document.getElementById('team-modal-code').value.trim().toUpperCase();
    const name = document.getElementById('team-modal-name').value.trim();
    if (!code || !name) { showToast('กรุณากรอกข้อมูลให้ครบถ้วน', 'error'); return; }
    if (!/^[A-Z0-9_-]+$/.test(code)) { showToast('Team Code ต้องเป็นตัวอักษรตัวใหญ่เท่านั้น', 'error'); return; }
    const { error } = await sb.from('teams').upsert({ team_code: code, display_name: name }, { onConflict: 'team_code' });
    if (error) { showToast('บันทึกล้มเหลว: ' + error.message, 'error'); return; }
    // Auto-sync to equipments table so borrower page works without manual setup
    await syncTeamToEquipments(code, name);
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
    // Soft-disable equipment row (preserve borrow_request history)
    await sb.from('equipments')
        .update({ borrow_enabled: false })
        .eq('source_team_code', currentTeamCode);
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

    // Suggest next available order
    const { data: members } = await sb.from('manikins').select('team_order').eq('team_code', currentTeamCode).order('team_order', { ascending: false }).limit(1);
    const nextOrder = (members && members.length && members[0].team_order) ? members[0].team_order + 1 : 1;
    document.getElementById('add-member-order').value = nextOrder;
    document.getElementById('add-member-order-hint').textContent = 'ลำดับถัดไปที่ว่าง: ' + currentTeamCode + ' ' + String(nextOrder).padStart(2, '0');
    openModal('add-member-modal');
    renderComboboxOptions('');
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
}

const addMemberInput = document.getElementById('add-member-sap-input');
const addMemberDropdown = document.getElementById('add-member-dropdown');
const addMemberComboboxWrap = document.getElementById('add-member-combobox-wrap');

if (addMemberInput) {
    addMemberInput.addEventListener('input', () => renderComboboxOptions(addMemberInput.value));
    addMemberInput.addEventListener('focus', () => renderComboboxOptions(addMemberInput.value));
}

if (addMemberDropdown) {
    addMemberDropdown.addEventListener('click', (e) => {
        const option = e.target.closest('.combobox-option');
        if (!option) return;
        addMemberInput.value = option.dataset.sap + ' — ' + option.dataset.name;
        document.getElementById('add-member-sap').value = option.dataset.sap;
        addMemberDropdown.classList.add('hidden');
    });
}

document.addEventListener('click', (e) => {
    if (!addMemberComboboxWrap || !addMemberDropdown) return;
    if (!addMemberComboboxWrap.contains(e.target)) {
        addMemberDropdown.classList.add('hidden');
    }
});

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

/* ===== TEAM IMAGE MANAGER ===== */
const TEAM_IMG_BUCKET = 'team-images';
const TEAM_IMG_MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const TEAM_IMG_ALLOWED = ['image/webp', 'image/jpeg', 'image/png'];

function validateImageFile(file) {
    if (!TEAM_IMG_ALLOWED.includes(file.type)) return 'รองรับเฉพาะ JPG, WebP, PNG เท่านั้น';
    if (file.size > TEAM_IMG_MAX_BYTES) return 'ไฟล์ใหญ่เกิน 2 MB กรุณาบีบอัดก่อน';
    return null;
}

function renderCoverImageUI(url) {
    const img = document.getElementById('team-cover-img');
    const ph = document.getElementById('team-cover-placeholder');
    const delBtn = document.getElementById('btn-cover-delete');
    if (url) {
        img.src = url;
        img.style.display = 'block';
        ph.style.display = 'none';
        delBtn.style.display = 'inline-flex';
    } else {
        img.src = '';
        img.style.display = 'none';
        ph.style.display = 'block';
        delBtn.style.display = 'none';
    }
}

function setCoverProgress(pct, text) {
    const wrap = document.getElementById('cover-upload-progress');
    const bar = document.getElementById('cover-upload-bar');
    const status = document.getElementById('cover-upload-status');
    wrap.style.display = pct > 0 && pct < 100 ? 'block' : 'none';
    bar.style.width = pct + '%';
    status.textContent = text || '';
}

function setCoverError(msg) {
    const el = document.getElementById('cover-upload-error');
    el.textContent = msg || '';
    el.style.display = msg ? 'block' : 'none';
}

function renderGalleryGrid(items) {
    const grid = document.getElementById('team-gallery-grid');
    grid.innerHTML = '';
    items.forEach(item => {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'position:relative;width:90px;height:67px;border-radius:6px;overflow:hidden;border:1px solid var(--border);';
        wrap.innerHTML =
            '<img src="' + esc(item.image_url) + '" style="width:100%;height:100%;object-fit:cover;" />' +
            '<button data-action="deleteGallery" data-gid="' + esc(item.id) + '" title="ลบ" ' +
            'style="position:absolute;top:2px;right:2px;background:rgba(0,0,0,0.65);border:none;border-radius:50%;' +
            'width:20px;height:20px;cursor:pointer;color:#fff;font-size:11px;display:flex;align-items:center;justify-content:center;">x</button>';
        grid.appendChild(wrap);
    });
    if (items.length < 3) {
        const addBtn = document.createElement('button');
        addBtn.className = 'btn btn-outline btn-sm';
        addBtn.id = 'btn-gallery-add';
        addBtn.textContent = '+ เพิ่มรูป';
        addBtn.style.height = '67px';
        grid.appendChild(addBtn);
    }
}

async function loadTeamImages(code) {
    if (!code) return;
    document.getElementById('team-image-section').classList.remove('hidden');
    setCoverError('');
    const errEl = document.getElementById('team-gallery-error');
    errEl.textContent = '';
    errEl.style.display = 'none';

    const { data: team } = await sb.from('teams').select('cover_image_url').eq('team_code', code).single();
    renderCoverImageUI(team ? team.cover_image_url : null);

    const { data: gallery } = await sb.from('team_images')
        .select('id, image_url, image_order')
        .eq('team_code', code)
        .gt('image_order', 0)
        .order('image_order', { ascending: true });
    renderGalleryGrid(gallery || []);
}

async function uploadCoverImage(file) {
    const code = currentTeamCode;
    if (!code) return;
    const err = validateImageFile(file);
    if (err) { setCoverError(err); return; }
    setCoverError('');

    const ext = file.type === 'image/webp' ? 'webp' : file.type === 'image/png' ? 'png' : 'jpg';
    const path = code + '/cover_' + Date.now() + '.' + ext;

    const { data: oldTeam } = await sb.from('teams').select('cover_image_url').eq('team_code', code).single();
    const oldUrl = oldTeam ? oldTeam.cover_image_url : null;

    setCoverProgress(40, 'กำลังอัปโหลด...');
    document.getElementById('btn-cover-upload').disabled = true;

    const { error: upErr } = await sb.storage.from(TEAM_IMG_BUCKET).upload(path, file, { upsert: false, cacheControl: '3600' });
    if (upErr) {
        setCoverProgress(0, '');
        document.getElementById('btn-cover-upload').disabled = false;
        setCoverError('อัปโหลดล้มเหลว: ' + upErr.message);
        return;
    }

    setCoverProgress(80, 'บันทึก URL...');
    const { data: urlData } = sb.storage.from(TEAM_IMG_BUCKET).getPublicUrl(path);
    const newUrl = urlData.publicUrl;

    const { error: updateErr } = await sb.from('teams').update({
        cover_image_url: newUrl,
        cover_image_updated_at: new Date().toISOString(),
        cover_image_updated_by: currentUser ? currentUser.id : null
    }).eq('team_code', code);

    if (updateErr) {
        setCoverProgress(0, '');
        document.getElementById('btn-cover-upload').disabled = false;
        setCoverError('บันทึก URL ล้มเหลว: ' + updateErr.message);
        return;
    }

    await sb.from('team_images').upsert(
        { team_code: code, image_url: newUrl, image_order: 0, uploaded_by: currentUser ? currentUser.id : null, uploaded_at: new Date().toISOString() },
        { onConflict: 'team_code,image_order' }
    );

    await sb.from('team_image_audit_log').insert({
        team_code: code, action: oldUrl ? 'replace' : 'upload',
        old_url: oldUrl, new_url: newUrl, changed_by: currentUser ? currentUser.id : null
    });

    if (oldUrl) {
        const oldPath = oldUrl.split('/team-images/')[1];
        if (oldPath) sb.storage.from(TEAM_IMG_BUCKET).remove([oldPath]);
    }

    setCoverProgress(0, '');
    document.getElementById('btn-cover-upload').disabled = false;
    renderCoverImageUI(newUrl);
    showToast('อัปโหลดรูปปกสำเร็จ');
}

async function deleteCoverImage() {
    const code = currentTeamCode;
    if (!code) return;
    const ok = await showConfirm({ title: 'ลบรูปปก', message: 'ยืนยันลบรูปปกของ Team ' + code + '?', okText: 'ลบรูป', okClass: 'btn-danger' });
    if (!ok) return;

    const { data: teamRow } = await sb.from('teams').select('cover_image_url').eq('team_code', code).single();
    const oldUrl = teamRow ? teamRow.cover_image_url : null;

    await sb.from('teams').update({ cover_image_url: null, cover_image_updated_at: new Date().toISOString(), cover_image_updated_by: currentUser ? currentUser.id : null }).eq('team_code', code);
    await sb.from('team_images').delete().eq('team_code', code).eq('image_order', 0);
    await sb.from('team_image_audit_log').insert({ team_code: code, action: 'delete', old_url: oldUrl, new_url: null, changed_by: currentUser ? currentUser.id : null });

    if (oldUrl) {
        const p = oldUrl.split('/team-images/')[1];
        if (p) sb.storage.from(TEAM_IMG_BUCKET).remove([p]);
    }
    renderCoverImageUI(null);
    showToast('ลบรูปปกสำเร็จ');
}

async function uploadGalleryImage(file) {
    const code = currentTeamCode;
    if (!code) return;
    const errEl = document.getElementById('team-gallery-error');
    const valErr = validateImageFile(file);
    if (valErr) { errEl.textContent = valErr; errEl.style.display = 'block'; return; }
    errEl.style.display = 'none';

    const { data: existing } = await sb.from('team_images').select('image_order').eq('team_code', code).gt('image_order', 0).order('image_order', { ascending: false });
    if (existing && existing.length >= 3) { errEl.textContent = 'มีรูปรายละเอียดครบ 3 รูปแล้ว'; errEl.style.display = 'block'; return; }

    const nextOrder = (existing && existing.length > 0) ? existing[0].image_order + 1 : 1;
    const ext = file.type === 'image/webp' ? 'webp' : file.type === 'image/png' ? 'png' : 'jpg';
    const path = code + '/detail_' + nextOrder + '_' + Date.now() + '.' + ext;

    const { error: upErr } = await sb.storage.from(TEAM_IMG_BUCKET).upload(path, file, { upsert: false });
    if (upErr) { errEl.textContent = 'อัปโหลดล้มเหลว: ' + upErr.message; errEl.style.display = 'block'; return; }

    const { data: urlData } = sb.storage.from(TEAM_IMG_BUCKET).getPublicUrl(path);
    const newUrl = urlData.publicUrl;

    await sb.from('team_images').insert({ team_code: code, image_url: newUrl, image_order: nextOrder, uploaded_by: currentUser ? currentUser.id : null });
    await sb.from('team_image_audit_log').insert({ team_code: code, action: 'upload', old_url: null, new_url: newUrl, changed_by: currentUser ? currentUser.id : null });

    showToast('เพิ่มรูปรายละเอียดสำเร็จ');
    await loadTeamImages(code);
}

async function deleteGalleryImage(galleryId) {
    const code = currentTeamCode;
    if (!code || !galleryId) return;
    const ok = await showConfirm({ title: 'ลบรูปรายละเอียด', message: 'ยืนยันลบรูปนี้?', okText: 'ลบ', okClass: 'btn-danger' });
    if (!ok) return;

    const { data: row } = await sb.from('team_images').select('image_url').eq('id', galleryId).single();
    const imgUrl = row ? row.image_url : null;

    await sb.from('team_images').delete().eq('id', galleryId);
    await sb.from('team_image_audit_log').insert({ team_code: code, action: 'delete', old_url: imgUrl, new_url: null, changed_by: currentUser ? currentUser.id : null });

    if (imgUrl) {
        const p = imgUrl.split('/team-images/')[1];
        if (p) sb.storage.from(TEAM_IMG_BUCKET).remove([p]);
    }
    showToast('ลบรูปรายละเอียดสำเร็จ');
    await loadTeamImages(code);
}

(function initTeamImageEvents() {
    document.addEventListener('click', function(e) {
        const btn = e.target.closest('button');
        if (!btn) return;
        if (btn.id === 'btn-cover-upload') document.getElementById('team-cover-input').click();
        else if (btn.id === 'btn-cover-delete') deleteCoverImage();
        else if (btn.id === 'btn-gallery-add') document.getElementById('team-gallery-input').click();
        else if (btn.dataset.action === 'deleteGallery') deleteGalleryImage(btn.dataset.gid);
    }, true);

    document.getElementById('team-cover-input').addEventListener('change', function(e) {
        const f = e.target.files[0];
        if (f) uploadCoverImage(f);
        e.target.value = '';
    });

    document.getElementById('team-gallery-input').addEventListener('change', function(e) {
        const f = e.target.files[0];
        if (f) uploadGalleryImage(f);
        e.target.value = '';
    });
})();
