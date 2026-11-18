const SUPABASE_URL = 'https://ifogcvymwhcfbfjzhwsl.supabase.co';
const SUPABASE_ANON = 'sb_publishable_DZyIDHVZ-kfD1o3baz0qmw_tTyRCJG8';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
const borrowUrlParams = new URLSearchParams(window.location.search);
const TEST_MODE = borrowUrlParams.get('test_mode') === '1' || window.localStorage.getItem('simset_test_mode') === '1' || navigator.webdriver;
if (borrowUrlParams.get('test_mode') === '1') {
    window.localStorage.setItem('simset_test_mode', '1');
}
const TEST_BORROW_LOGIN_KEY = 'simset_test_borrow_logged_in';
const TEST_REQUESTS_KEY = 'simset_test_requests';
const TEST_TRACKING_IDS = ['SIM-2026-0001', 'SIM-2026-0002', 'SIM-2026-0003', 'SIM-2026-0004', 'SIM-2026-0005'];
const TEST_BORROWER_EMAIL = 'example@gmail.com';

let currentUser = null;
let borrowUserMenuHideTimer = null;
let equipments = []; // Team-driven catalog rows
let cart = []; // { equipment_id, submit_equipment_id, name, qty }
let selectedStartDate = null;
let selectedEndDate = null;
let availabilityMap = {}; // equipment_id -> available_qty

let currentAgeFilter = 'all';
let currentSearchTerm = '';
let currentCatalogView = window.localStorage.getItem('simset_borrow_catalog_view') || 'grid';
let catalogPage = 1;
let expandedCatalogRows = new Set();
let selectedCatalogRowId = null;
let currentBorrowStep = 1;
let teamCoverMap = {}; // team_code -> cover_image_url
let teamCapabilityMap = {}; // team_code -> [capability label]
let availabilityErrorMessage = '';
let borrowerProfileLocked = false;
let logoutInFlight = false;
let invalidDateAttemptCount = 0;

const BORROWER_PROFILE_STORAGE_PREFIX = 'borrower-profile:';
const BORROWER_PROFILE_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const BORROW_CATALOG_VIEW_KEY = 'simset_borrow_catalog_view';
const CATALOG_PAGE_SIZE = 6;

const BORROW_STATE = {
    READY: 'ready',
    NEEDS_DATES: 'needs_dates',
    NOT_PUBLISHED: 'not_published',
    NO_READY_UNITS: 'no_ready_units',
    DATE_CONFLICT: 'date_conflict',
    AVAILABILITY_ERROR: 'availability_error'
};

const startDateInput = document.getElementById('start-date');
const endDateInput = document.getElementById('end-date');
const btnApplyDates = document.getElementById('btn-apply-dates');
const btnClearDates = document.getElementById('btn-clear-dates');
const searchInput = document.getElementById('search-input');
const ageFilters = document.querySelectorAll('.cat-pill');
const detailDrawer = document.getElementById('quick-detail-drawer');
const detailOverlay = document.getElementById('detail-drawer-overlay');
const detailCloseButton = document.getElementById('detail-close');
const detailName = document.getElementById('detail-name');
const detailCode = document.getElementById('detail-code');
const detailAgeIcon = document.getElementById('detail-age-icon');
const detailStockInfo = document.getElementById('detail-stock-info');

const catalogDateRange = document.getElementById('catalog-date-range');
const catalogResultCount = document.getElementById('catalog-result-count');

const borrowFeedback = document.getElementById('borrow-feedback');
const liveRegion = document.getElementById('ui-live-region');
const flowStepsRoot = document.getElementById('borrow-flow-steps');
const stepPanels = document.querySelectorAll('[data-step-panel]');
const flowPrimaryCta = document.getElementById('flow-primary-cta');
const stateChipDate = document.getElementById('state-chip-date');
const stateChipAuth = document.getElementById('state-chip-auth');
const stateChipCart = document.getElementById('state-chip-cart');
const activeFiltersRoot = document.getElementById('active-filters');
const catalogGrid = document.getElementById('equipments-grid');
const catalogPagination = document.getElementById('catalog-pagination');
const btnOpenCart = document.getElementById('btn-open-cart');
const btnOpenFilterSheet = document.getElementById('btn-open-filter-sheet');
const filterDrawer = document.getElementById('borrow-filter-drawer');
const filterDrawerOverlay = document.getElementById('filter-drawer-overlay');
const filterDrawerClose = document.getElementById('filter-close');
const mobileStartDateInput = document.getElementById('mobile-start-date');
const mobileEndDateInput = document.getElementById('mobile-end-date');
const mobileSearchInput = document.getElementById('mobile-search-input');
const mobileAgeFilters = document.querySelectorAll('[data-mobile-age]');
const btnMobileApplyFilters = document.getElementById('btn-mobile-apply-filters');
const btnMobileClearFilters = document.getElementById('btn-mobile-clear-filters');
const viewModeButtons = document.querySelectorAll('[data-view-mode]');
const step3SummaryText = document.getElementById('step3-summary-text');
const step3LoginHint = document.getElementById('step3-login-hint');
const borrowConfirmModal = document.getElementById('borrow-confirm-modal');
const borrowConfirmPanel = borrowConfirmModal?.querySelector('[data-dialog-panel]');
const borrowConfirmMessage = document.getElementById('borrow-confirm-desc');
const borrowConfirmCancelBtn = document.getElementById('btn-borrow-cancel');
const borrowConfirmOkBtn = document.getElementById('btn-borrow-confirm');
const dateRangeOverlay = document.getElementById('date-range-overlay');
const dateRangePopover = document.getElementById('date-range-popover');
const dateRangePanel = dateRangePopover?.querySelector('.date-range-panel');
const btnCloseDateRange = document.getElementById('btn-close-date-range');
const btnDateCancel = document.getElementById('btn-date-cancel');


let activeDialog = null;
let lastFocusedElement = null;
let confirmResolve = null;

const todayStr = new Date().toISOString().split('T')[0];
[startDateInput, endDateInput].forEach((input) => {
    if (input) input.setAttribute('min', todayStr);
});
[mobileStartDateInput, mobileEndDateInput].forEach((input) => {
    if (input) input.setAttribute('min', todayStr);
});

function syncConstraints(startEl, endEl) {
    if (startEl.value) {
        endEl.setAttribute('min', startEl.value);
    }
}

startDateInput.addEventListener('change', () => syncConstraints(startDateInput, endDateInput));
endDateInput.addEventListener('change', () => syncConstraints(startDateInput, endDateInput));

function parseIsoDate(value) {
    if (!value) return null;
    const parsed = new Date(`${value}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isDateRangeInvalid(start, end) {
    const startDate = parseIsoDate(start);
    const endDate = parseIsoDate(end);
    if (!startDate || !endDate) return false;
    return startDate.getTime() > endDate.getTime();
}

function ensureValidDateRange(start, end) {
    if (!isDateRangeInvalid(start, end)) return true;
    invalidDateAttemptCount += 1;
    const invalidRangeMessage = 'ช่วงวันที่ไม่ถูกต้อง: วันที่รับของต้องไม่ช้ากว่าวันที่ส่งคืน';
    showFeedback(invalidRangeMessage, 'error');
    const inputMode = document.getElementById('date-input-mode');
    const summaryMode = document.getElementById('date-summary-mode');
    const activeLabel = document.getElementById('booking-dates-active');
    if (summaryMode && inputMode) {
        summaryMode.classList.add('is-invalid');
    }
    if (activeLabel) {
        activeLabel.textContent = `${formatBorrowDateRange(start, end)} (ไม่ถูกต้อง)`;
    }
    if (invalidDateAttemptCount >= 2 && borrowConfirmModal && borrowConfirmPanel && borrowConfirmMessage) {
        borrowConfirmMessage.textContent = invalidRangeMessage;
        openOverlay(borrowConfirmModal, borrowConfirmPanel);
    }
    return false;
}

function readTestRequests() {
    try {
        const parsed = JSON.parse(window.localStorage.getItem(TEST_REQUESTS_KEY) || '[]');
        return Array.isArray(parsed) ? parsed : [];
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

function createTestTrackingId(existingRows) {
    const used = new Set(existingRows.map((row) => row.tracking_id));
    const available = TEST_TRACKING_IDS.find((id) => !used.has(id));
    if (available) return available;
    return `SIM-2026-${String(existingRows.length + 1).padStart(4, '0')}`;
}

function resolveTeamDisplayName(teamMeta, members) {
    const displayName = String(teamMeta?.display_name || '').trim();
    if (displayName) return displayName;
    return String(members?.[0]?.asset_name || '').trim() || 'ไม่ทราบชื่อกลุ่ม';
}

function getBorrowState(eq, avail) {
    const readyQty = Math.max(0, Number(eq.ready_quantity) || 0);
    const hasDates = Boolean(selectedStartDate && selectedEndDate);

    if (readyQty <= 0) {
        return {
            code: BORROW_STATE.NO_READY_UNITS,
            badgeText: 'ไม่มีตัวพร้อมใช้งาน',
            badgeClass: 'out-of-stock',
            note: 'สมาชิกในทีมนี้ยังไม่อยู่ในสถานะใช้งานได้ปกติ',
            ctaLabel: 'ยังไม่พร้อมให้ยืม',
            ctaDisabled: true,
            feedback: 'รายการนี้ยังไม่มีตัวที่สถานะใช้งานได้ปกติ'
        };
    }

    if (!eq.submit_equipment_id) {
        return {
            code: BORROW_STATE.NOT_PUBLISHED,
            badgeText: 'พร้อมในคลัง แต่ยังไม่เปิดให้ยืม',
            badgeClass: 'attention',
            note: 'ทีมนี้ยังไม่ถูก publish เข้าระบบยืม',
            ctaLabel: 'รอเปิดให้ยืม',
            ctaDisabled: true,
            feedback: 'รายการนี้ยังไม่เปิดรับคำขอยืมจริง'
        };
    }

    if (!hasDates) {
        return {
            code: BORROW_STATE.NEEDS_DATES,
            badgeText: `พร้อมในคลัง ${readyQty} ตัว`,
            badgeClass: 'pending',
            note: '',
            ctaLabel: 'เลือกวันก่อนยืม',
            ctaDisabled: false,
            feedback: 'กรุณาเลือกวันยืม-คืนก่อนเพิ่มลงตะกร้า'
        };
    }

    if (availabilityErrorMessage) {
        return {
            code: BORROW_STATE.AVAILABILITY_ERROR,
            badgeText: 'ตรวจสอบสถานะไม่ได้',
            badgeClass: 'unknown',
            note: 'ระบบไม่สามารถดึง availability ได้ในขณะนี้ กรุณาลองใหม่',
            ctaLabel: 'ลองใหม่อีกครั้ง',
            ctaDisabled: true,
            feedback: `ไม่สามารถตรวจสอบจำนวนคงเหลือได้: ${availabilityErrorMessage}`
        };
    }

    if (avail <= 0) {
        return {
            code: BORROW_STATE.DATE_CONFLICT,
            badgeText: 'ไม่ว่างในช่วงวันที่เลือก',
            badgeClass: 'out-of-stock',
            note: 'มีในคลัง แต่ถูกจองเต็มในช่วงวันที่ยืม-คืนนี้',
            ctaLabel: 'ไม่ว่างตามคิว',
            ctaDisabled: true,
            feedback: 'รายการนี้ไม่ว่างในช่วงวันที่ที่เลือก'
        };
    }

    return {
        code: BORROW_STATE.READY,
        badgeText: `พร้อมยืม ${avail} ตัว`,
        badgeClass: '',
        note: `ว่างตามช่วงวันที่เลือก ${avail} ตัว`,
        ctaLabel: 'เพิ่มลงตะกร้า',
        ctaDisabled: false,
        feedback: ''
    };
}

function getCartTotalExcluding(eqId) {
    return cart.reduce((sum, item) => sum + (item.equipment_id === eqId ? 0 : item.qty), 0);
}

function getMaxAddableQty(eqId, avail = availabilityMap[eqId] || 0) {
    const cartRemaining = Math.max(0, 5 - getCartTotalExcluding(eqId));
    return Math.max(0, Math.min(avail, cartRemaining));
}



function announce(message) {
    if (liveRegion) liveRegion.textContent = message;
}

function buildBorrowSkeletonCards(count = 6) {
    return Array.from({ length: count }, () => `
        <article class="borrow-card-skeleton">
            <div class="borrow-card-skeleton-visual skeleton-shimmer"></div>
            <div class="borrow-card-skeleton-top">
                <div class="borrow-card-skeleton-pill skeleton-shimmer"></div>
                <div class="borrow-card-skeleton-badge skeleton-shimmer"></div>
            </div>
            <div class="skeleton-line lg"></div>
            <div class="skeleton-line md"></div>
            <div class="skeleton-line sm"></div>
            <div class="borrow-card-skeleton-cta skeleton-shimmer"></div>
        </article>
    `).join('');
}

async function loadJson(filename) {
    const res = await fetch(`data/${filename}`);
    if (!res.ok) throw new Error(`Failed to load ${filename}: HTTP ${res.status}`);
    return res.json();
}

const CAPABILITY_PRIORITY = [
    'ใช้ฝึก CPR',
    'แสดงคุณภาพ CPR',
    'ช่วยหายใจได้',
    'ใส่ท่อช่วยหายใจได้',
    'ใช้กับเครื่อง defibrillator ได้',
    'ใช้แทงหลอดเลือด',
    'แสดงสัญญาณชีพจำลอง'
];

function getCapabilityPriority(label) {
    const index = CAPABILITY_PRIORITY.indexOf(label);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function summarizeTeamCapabilities(members, capabilityMapBySap) {
    const seen = new Set();
    const labels = [];
    members.forEach((member) => {
        const caps = capabilityMapBySap[member.sap_id] || [];
        caps.forEach((label) => {
            if (!label || seen.has(label)) return;
            seen.add(label);
            labels.push(label);
        });
    });
    return labels.sort((a, b) => {
        const priorityDiff = getCapabilityPriority(a) - getCapabilityPriority(b);
        if (priorityDiff !== 0) return priorityDiff;
        return a.localeCompare(b, 'th');
    });
}

function renderInlineCapabilityMarkup(labels) {
    if (!labels.length) return '';
    const visibleLabels = labels.slice(0, 3);
    const hiddenLabels = labels.slice(3);
    const tagsMarkup = visibleLabels.map((label) => `<span class="cap-tag">${label}</span>`).join('');
    const overflowMarkup = hiddenLabels.length > 0
        ? `
            <button type="button" class="cap-tag cap-tag-more" data-action="toggle-capabilities" aria-expanded="false">
                +${hiddenLabels.length}
            </button>
            <span class="cap-extra-list" hidden>${hiddenLabels.map((label) => `<span class="cap-tag cap-tag-detail">${label}</span>`).join('')}</span>
        `
        : '';
    return `
        <div class="card-capability-block">
            <div class="card-capability-title">ฟังก์ชันที่ทำได้</div>
            <div class="card-caps">${tagsMarkup}${overflowMarkup}</div>
        </div>
    `;
}

function renderBorrowSkeleton(count = 6) {
    const grid = document.getElementById('equipments-grid');
    if (!grid) return;
    grid.innerHTML = buildBorrowSkeletonCards(count);
}

function showFeedback(message, type = 'info') {
    if (!borrowFeedback) return;
    borrowFeedback.textContent = message;
    borrowFeedback.className = `status-banner ${type === 'error' ? 'error' : type === 'success' ? 'success' : ''}`.trim();
    borrowFeedback.style.display = 'block';
    announce(message);
}

function clearFeedback() {
    if (!borrowFeedback) return;
    borrowFeedback.style.display = 'none';
    borrowFeedback.textContent = '';
    borrowFeedback.className = 'status-banner';
}

function getBorrowDisplayName(user) {
    return user?.user_metadata?.full_name || user?.email || '';
}

function getUserMetadataText(user, keys) {
    for (const key of keys) {
        const value = user?.user_metadata?.[key];
        if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
}

function getCheckoutFormElements() {
    return {
        borrowerName: document.getElementById('checkout-borrower-name'),
        position: document.getElementById('checkout-position'),
        department: document.getElementById('checkout-department'),
        phone: document.getElementById('checkout-phone'),
        usagePurpose: document.getElementById('checkout-usage-purpose'),
        location: document.getElementById('checkout-location')
    };
}

function getBorrowerProfileFields() {
    const fields = getCheckoutFormElements();
    return [fields.borrowerName, fields.position, fields.department, fields.phone].filter(Boolean);
}

function getBorrowerProfileStorageKey(user = currentUser) {
    const identity = user?.id || user?.email || 'guest';
    return `${BORROWER_PROFILE_STORAGE_PREFIX}${identity}`;
}

function loadBorrowerProfile(user = currentUser) {
    try {
        const raw = window.localStorage.getItem(getBorrowerProfileStorageKey(user));
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return {};

        if (parsed.profile && typeof parsed.profile === 'object') {
            if (typeof parsed.expiresAt === 'number' && Date.now() > parsed.expiresAt) {
                window.localStorage.removeItem(getBorrowerProfileStorageKey(user));
                return {};
            }
            return parsed.profile;
        }

        // Legacy payload without TTL is treated as expired.
        window.localStorage.removeItem(getBorrowerProfileStorageKey(user));
        return {};
    } catch (error) {
        console.warn('Unable to load borrower profile draft:', error);
        return {};
    }
}

function saveBorrowerProfile(profile, user = currentUser) {
    try {
        const now = Date.now();
        const record = {
            profile,
            updatedAt: now,
            expiresAt: now + BORROWER_PROFILE_TTL_MS
        };
        window.localStorage.setItem(getBorrowerProfileStorageKey(user), JSON.stringify(record));
    } catch (error) {
        console.warn('Unable to save borrower profile draft:', error);
    }
}

function removeBorrowerProfileDraft(user = currentUser) {
    try {
        window.localStorage.removeItem(getBorrowerProfileStorageKey(user));
    } catch (error) {
        console.warn('Unable to remove borrower profile draft:', error);
    }
}

function clearBorrowerProfileFields() {
    const { borrowerName, position, department, phone } = getCheckoutFormElements();
    [borrowerName, position, department, phone].forEach((field) => {
        if (!field) return;
        field.value = '';
        field.style.borderColor = 'var(--border)';
        field.readOnly = false;
        field.classList.remove('is-readonly');
        field.setAttribute('aria-readonly', 'false');
    });
    setBorrowerProfileLocked(false);
}

function ensureBorrowerProfileControls() {
    const { borrowerName } = getCheckoutFormElements();
    const section = borrowerName?.closest('.checkout-form-section');
    if (!section) return {};

    let titleRow = section.querySelector('.checkout-form-title-row');
    let note = section.querySelector('#borrower-profile-note');
    let editButton = section.querySelector('#btn-edit-borrower-profile');
    const title = section.querySelector('.checkout-form-title');

    if (title && !titleRow) {
        titleRow = document.createElement('div');
        titleRow.className = 'checkout-form-title-row';
        title.parentNode.insertBefore(titleRow, title);
        titleRow.appendChild(title);
    }

    if (titleRow && !editButton) {
        editButton = document.createElement('button');
        editButton.type = 'button';
        editButton.id = 'btn-edit-borrower-profile';
        editButton.className = 'checkout-form-action';
        editButton.hidden = true;
        editButton.textContent = 'แก้ไขข้อมูล';
        titleRow.appendChild(editButton);
    }

    if (titleRow && !note) {
        note = document.createElement('p');
        note.id = 'borrower-profile-note';
        note.className = 'checkout-form-note';
        note.hidden = true;
        titleRow.insertAdjacentElement('afterend', note);
    }

    return { section, titleRow, note, editButton };
}

function setBorrowerProfileLocked(locked) {
    borrowerProfileLocked = locked;
    const controls = ensureBorrowerProfileControls();
    const fields = getBorrowerProfileFields();
    const hasAnyValue = fields.some((field) => field.value.trim());

    fields.forEach((field) => {
        field.readOnly = locked;
        field.classList.toggle('is-readonly', locked);
        field.setAttribute('aria-readonly', locked ? 'true' : 'false');
    });

    if (!controls.editButton || !controls.note) return;

    controls.editButton.hidden = !hasAnyValue;
    controls.editButton.textContent = locked ? 'แก้ไขข้อมูล' : 'บันทึกเป็นค่าเริ่มต้น';
    controls.editButton.setAttribute('aria-pressed', locked ? 'false' : 'true');
    controls.note.hidden = !hasAnyValue;
    controls.note.textContent = locked
        ? 'ใช้ข้อมูลจากโปรไฟล์สำหรับคำขอนี้ หากข้อมูลเปลี่ยนกดแก้ไขได้'
        : 'แก้ไขข้อมูลชุดนี้แล้วกดบันทึกเป็นค่าเริ่มต้น เพื่อใช้ครั้งถัดไป';
}

function prefillBorrowerForm(user) {
    ensureBorrowerProfileControls();

    const fields = getCheckoutFormElements();
    const savedProfile = loadBorrowerProfile(user);
    const resolvedProfile = {
        borrowerName: savedProfile.borrowerName || getUserMetadataText(user, ['full_name', 'name']) || getBorrowDisplayName(user),
        position: savedProfile.position || getUserMetadataText(user, ['position', 'job_title', 'title']),
        department: savedProfile.department || getUserMetadataText(user, ['department', 'organization', 'org']),
        phone: savedProfile.phone || getUserMetadataText(user, ['phone', 'phone_number', 'mobile'])
    };

    Object.entries(resolvedProfile).forEach(([key, value]) => {
        const field = fields[key];
        if (field && !field.value.trim() && value) {
            field.value = value;
        }
    });

    const hasAnyProfileValue = getBorrowerProfileFields().some((field) => field.value.trim());
    const hasCompleteProfile = getBorrowerProfileFields().every((field) => field.value.trim());
    setBorrowerProfileLocked(hasAnyProfileValue && hasCompleteProfile);
}

function getBorrowerProfileDraft() {
    const { borrowerName, position, department, phone } = getCheckoutFormElements();
    return {
        borrowerName: borrowerName?.value.trim() || '',
        position: position?.value.trim() || '',
        department: department?.value.trim() || '',
        phone: phone?.value.trim() || ''
    };
}

function validateBorrowerProfileFields() {
    const fields = getCheckoutFormElements();
    if (TEST_MODE) {
        if (fields.borrowerName && !fields.borrowerName.value.trim()) fields.borrowerName.value = 'Test Borrower';
        if (fields.position && !fields.position.value.trim()) fields.position.value = 'Student';
        if (fields.department && !fields.department.value.trim()) fields.department.value = 'SIMSET QA';
        if (fields.phone && !fields.phone.value.trim()) fields.phone.value = '0812345678';
    }
    const requiredFields = [
        { element: fields.borrowerName, message: 'กรุณาระบุชื่อ-นามสกุล' },
        { element: fields.position, message: 'กรุณาระบุตำแหน่ง' },
        { element: fields.department, message: 'กรุณาระบุภาควิชา/หน่วยงาน' },
        { element: fields.phone, message: 'กรุณาระบุเบอร์ติดต่อ' }
    ];

    requiredFields.forEach(({ element }) => {
        if (element) element.style.borderColor = 'var(--border)';
    });

    const invalidField = requiredFields.find(({ element }) => !element || !element.value.trim());
    if (invalidField) {
        if (invalidField.element) {
            invalidField.element.style.borderColor = '#ef4444';
            invalidField.element.focus();
        }
        showFeedback(invalidField.message, 'error');
        return null;
    }

    return getBorrowerProfileDraft();
}

function toggleBorrowerProfileEditMode() {
    if (borrowerProfileLocked) {
        setBorrowerProfileLocked(false);
        getCheckoutFormElements().borrowerName?.focus();
        return;
    }

    const profileDraft = validateBorrowerProfileFields();
    if (!profileDraft) return;
    saveBorrowerProfile(profileDraft);
    setBorrowerProfileLocked(true);
    showFeedback('บันทึกข้อมูลโปรไฟล์สำหรับการยืมครั้งถัดไปแล้ว', 'success');
}

function validateCheckoutFormV2() {
    const fields = getCheckoutFormElements();
    if (TEST_MODE) {
        if (fields.usagePurpose && !fields.usagePurpose.value.trim()) fields.usagePurpose.value = 'Automated test borrow flow';
        if (fields.location && !fields.location.value.trim()) fields.location.value = 'SIMSET Test Room';
    }
    const borrowerProfile = validateBorrowerProfileFields();
    if (!borrowerProfile) return null;

    const requiredFields = [
        { element: fields.usagePurpose, message: 'กรุณาระบุเพื่อใช้ในงาน' },
        { element: fields.location, message: 'กรุณาระบุสถานที่ใช้' }
    ];

    requiredFields.forEach(({ element }) => {
        if (element) element.style.borderColor = 'var(--border)';
    });

    const invalidField = requiredFields.find(({ element }) => !element || !element.value.trim());
    if (invalidField) {
        if (invalidField.element) {
            invalidField.element.style.borderColor = '#ef4444';
            invalidField.element.focus();
        }
        showFeedback(invalidField.message, 'error');
        return null;
    }

    return {
        ...borrowerProfile,
        usagePurpose: fields.usagePurpose.value.trim(),
        location: fields.location.value.trim()
    };
}

function buildBorrowPurposeSummary(formData) {
    return [
        `เพื่อใช้ในงาน: ${formData.usagePurpose}`,
        `สถานที่ใช้: ${formData.location}`,
        `ผู้ยืม: ${formData.borrowerName}`,
        `ตำแหน่ง: ${formData.position}`,
        `ภาควิชา/หน่วยงาน: ${formData.department}`,
        `โทร: ${formData.phone}`
    ].join('\n');
}

function closeBorrowUserMenu() {
    const menuButton = document.getElementById('btn-user-menu');
    const dropdown = document.getElementById('user-dropdown');
    if (!menuButton || !dropdown) return;
    menuButton.setAttribute('aria-expanded', 'false');
    dropdown.classList.remove('is-open');
    if (borrowUserMenuHideTimer) window.clearTimeout(borrowUserMenuHideTimer);
    borrowUserMenuHideTimer = window.setTimeout(() => {
        dropdown.hidden = true;
    }, 180);
}

function toggleBorrowUserMenu(forceOpen) {
    const menuButton = document.getElementById('btn-user-menu');
    const dropdown = document.getElementById('user-dropdown');
    if (!menuButton || !dropdown) return;
    const shouldOpen = typeof forceOpen === 'boolean'
        ? forceOpen
        : menuButton.getAttribute('aria-expanded') !== 'true';
    menuButton.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
    if (borrowUserMenuHideTimer) window.clearTimeout(borrowUserMenuHideTimer);
    if (shouldOpen) {
        dropdown.hidden = false;
        requestAnimationFrame(() => dropdown.classList.add('is-open'));
        return;
    }
    dropdown.classList.remove('is-open');
    borrowUserMenuHideTimer = window.setTimeout(() => {
        dropdown.hidden = true;
    }, 180);
}

function upgradeBorrowNav() {
    const nav = document.getElementById('nav');
    const brandLink = nav?.querySelector('.nav-brand a');
    const brandLogo = nav?.querySelector('.nav-brand img');
    const btnLogin = document.getElementById('btn-login');
    const userProfile = document.getElementById('user-profile');
    const userName = document.getElementById('user-name');
    const historyLink = document.getElementById('btn-user-history') || document.createElement('a');
    const trackingLink = document.getElementById('btn-user-tracking') || document.createElement('a');
    const logoutBtn = document.getElementById('btn-logout') || document.createElement('button');
    const cartButton = document.getElementById('cart-icon-btn');

    if (!nav || !btnLogin || !userProfile || !userName || !cartButton) return;
    if (userProfile.dataset.upgraded === 'true') return;

    nav.classList.add('nav-premium');
    brandLink?.classList.add('nav-brand-link');
    brandLogo?.classList.add('nav-brand-logo');

    btnLogin.classList.add('nav-login-btn');
    btnLogin.removeAttribute('style');

    userProfile.className = 'nav-user-shell';
    userProfile.style.display = 'none';
    userProfile.dataset.upgraded = 'true';

    historyLink.id = 'btn-user-history';
    historyLink.setAttribute('href', 'history.html');
    historyLink.className = 'nav-user-dropdown-link';
    historyLink.removeAttribute('style');
    historyLink.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg><span>ประวัติคำขอ</span>';

    trackingLink.id = 'btn-user-tracking';
    trackingLink.setAttribute('href', 'tracking.html');
    trackingLink.className = 'btn-primary btn-sm nav-primary-cta';
    trackingLink.removeAttribute('style');
    trackingLink.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 21s7-4.35 7-11a7 7 0 1 0-14 0c0 6.65 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg><span>ติดตามคำขอ</span>';

    logoutBtn.id = 'btn-logout';
    logoutBtn.type = 'button';
    logoutBtn.className = 'nav-user-dropdown-link is-danger';
    logoutBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg><span>ออกจากระบบ</span>';

    cartButton.classList.add('cart-icon-premium');
    const cartSvg = cartButton.querySelector('svg');
    if (cartSvg) cartSvg.removeAttribute('style');

    const menuWrap = document.createElement('div');
    menuWrap.className = 'nav-user-menu';

    const menuButton = document.createElement('button');
    menuButton.id = 'btn-user-menu';
    menuButton.type = 'button';
    menuButton.className = 'nav-user-chip';
    menuButton.setAttribute('aria-haspopup', 'true');
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.setAttribute('aria-controls', 'user-dropdown');
    menuButton.innerHTML = '<span id="user-avatar" class="nav-user-avatar">A</span><span class="nav-user-meta"><span id="user-name-wrap" class="nav-user-name-wrap"></span><span class="nav-user-caption">บัญชีผู้ใช้งาน</span></span><svg class="nav-user-caret" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';

    const dropdown = document.createElement('div');
    dropdown.id = 'user-dropdown';
    dropdown.className = 'nav-user-dropdown';
    dropdown.hidden = true;
    dropdown.innerHTML = '<div class="nav-user-dropdown-head"><div id="user-dropdown-name" class="nav-user-dropdown-name"></div><div id="user-dropdown-email" class="nav-user-dropdown-email"></div></div>';
    dropdown.appendChild(logoutBtn);

    menuWrap.appendChild(menuButton);
    menuWrap.appendChild(dropdown);

    const actionCluster = document.createElement('div');
    actionCluster.className = 'nav-action-cluster';
    actionCluster.appendChild(trackingLink);
    actionCluster.appendChild(historyLink);
    actionCluster.appendChild(cartButton);

    userProfile.replaceChildren(menuWrap, actionCluster, userName);
    const userCaption = menuButton.querySelector('.nav-user-caption');
    if (userCaption) userCaption.textContent = 'บัญชีของฉัน';
    const dropdownHead = dropdown.querySelector('.nav-user-dropdown-head');
    if (dropdownHead) {
        const profileLabel = document.createElement('div');
        profileLabel.className = 'nav-user-dropdown-label';
        profileLabel.textContent = 'Profile';
        dropdownHead.prepend(profileLabel);
    }
    const actionsSection = document.createElement('div');
    actionsSection.className = 'nav-user-dropdown-section';
    actionsSection.innerHTML = '<div class="nav-user-dropdown-label">Actions</div>';
    actionsSection.appendChild(historyLink);
    const topDivider = document.createElement('div');
    topDivider.className = 'nav-user-dropdown-divider';
    const bottomDivider = document.createElement('div');
    bottomDivider.className = 'nav-user-dropdown-divider';
    dropdown.insertBefore(topDivider, logoutBtn);
    dropdown.insertBefore(actionsSection, topDivider);
    dropdown.insertBefore(bottomDivider, actionsSection);
    if (actionCluster.contains(historyLink)) actionCluster.removeChild(historyLink);
    userName.className = 'sr-only';

    menuButton.addEventListener('click', () => toggleBorrowUserMenu());
    dropdown.addEventListener('click', () => closeBorrowUserMenu());
    document.addEventListener('click', (event) => {
        if (!menuWrap.contains(event.target)) closeBorrowUserMenu();
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeBorrowUserMenu();
    });
}

function scrollToDatePicker() {
    openDateRangePicker();
}

function openDateRangePicker() {
    if (!dateRangePopover || !dateRangeOverlay) return;
    lastFocusedElement = document.activeElement;
    dateRangeOverlay.hidden = false;
    dateRangePopover.hidden = false;
    document.body.classList.add('date-range-open');
    requestAnimationFrame(() => {
        dateRangeOverlay.classList.add('open');
        dateRangePopover.classList.add('open');
    });
    setTimeout(() => startDateInput?.focus(), 180);
}

function closeDateRangePicker({ restoreFocus = true } = {}) {
    if (!dateRangePopover || !dateRangeOverlay) return;
    dateRangeOverlay.classList.remove('open');
    dateRangePopover.classList.remove('open');
    document.body.classList.remove('date-range-open');
    setTimeout(() => {
        dateRangeOverlay.hidden = true;
        dateRangePopover.hidden = true;
        if (restoreFocus) {
            const target = lastFocusedElement?.focus ? lastFocusedElement : document.getElementById('date-summary-mode');
            target?.focus();
        }
    }, 260);
}

function formatBorrowDateRange(start, end) {
    if (!start || !end) return '';
    const displayStart = new Date(start).toLocaleDateString('th-TH');
    const displayEnd = new Date(end).toLocaleDateString('th-TH');
    return `${displayStart} - ${displayEnd}`;
}

function getCurrentFlowStep() {
    const hasDates = Boolean(selectedStartDate && selectedEndDate);
    const cartTotal = cart.reduce((sum, item) => sum + item.qty, 0);
    if (!hasDates) return 1;
    if (cartTotal === 0) return 2;
    return 3;
}

function setBorrowStep(step, { scroll = false, force = false } = {}) {
    const nextStep = Math.max(1, Math.min(3, Number(step) || 1));
    const hasDates = Boolean(selectedStartDate && selectedEndDate);
    const cartTotal = cart.reduce((sum, item) => sum + item.qty, 0);

    if (!force) {
        if (nextStep === 2 && !hasDates) {
            currentBorrowStep = 1;
            updateFlowStateUI();
            openDateRangePicker();
            return false;
        }
        if (nextStep === 3 && cartTotal === 0) {
            currentBorrowStep = hasDates ? 2 : 1;
            updateFlowStateUI();
            showFeedback('กรุณาเลือกอุปกรณ์อย่างน้อย 1 รายการก่อนตรวจสอบคำขอ', 'error');
            return false;
        }
    }

    currentBorrowStep = nextStep;
    updateFlowStateUI();
    if (scroll) {
        document.querySelector(`[data-step-panel="${currentBorrowStep}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    return true;
}

function toggleStateChipClass(chip, ok) {
    if (!chip) return;
    chip.classList.remove('is-ok', 'is-warn');
    chip.classList.add(ok ? 'is-ok' : 'is-warn');
}

function renderActiveFilters() {
    if (!activeFiltersRoot) return;
    const chips = [];
    const hasDates = Boolean(selectedStartDate && selectedEndDate);
    const ageMap = { adult: 'ผู้ใหญ่', child: 'เด็ก', infant: 'ทารก', all: 'ทั้งหมด' };

    if (hasDates) {
        chips.push({
            key: 'dates',
            label: `ช่วงวันที่: ${formatBorrowDateRange(selectedStartDate, selectedEndDate)}`
        });
    }

    if (currentAgeFilter && currentAgeFilter !== 'all') {
        chips.push({ key: 'age', label: `ช่วงวัย: ${ageMap[currentAgeFilter] || currentAgeFilter}` });
    }

    if (currentSearchTerm) {
        chips.push({ key: 'search', label: `ค้นหา: ${currentSearchTerm}` });
    }

    if (chips.length === 0) {
        activeFiltersRoot.innerHTML = '';
        activeFiltersRoot.style.display = 'none';
        return;
    }

    activeFiltersRoot.style.display = 'flex';
    activeFiltersRoot.innerHTML = `
        <div class="active-filters-summary">
            ${chips.map((chip) => `
                <span class="filter-chip">
                    ${chip.label}
                    <button type="button" aria-label="ลบตัวกรอง ${chip.label}" data-filter-clear="${chip.key}">×</button>
                </span>
            `).join('')}
        </div>
        <button type="button" class="filter-clear-all" data-filter-clear="all">ล้างตัวกรองทั้งหมด</button>
    `;
}

function getFilteredCatalogItems() {
    let filtered = equipments.filter(filterByAge);
    if (currentSearchTerm) {
        filtered = filtered.filter((eq) => eq.name_th.toLowerCase().includes(currentSearchTerm));
    }
    return filtered;
}

function setCatalogView(mode) {
    currentCatalogView = mode === 'list' ? 'list' : 'grid';
    window.localStorage.setItem(BORROW_CATALOG_VIEW_KEY, currentCatalogView);
    viewModeButtons.forEach((button) => {
        button.classList.toggle('active', button.dataset.viewMode === currentCatalogView);
    });
    if (catalogGrid) {
        catalogGrid.classList.toggle('is-list-view', currentCatalogView === 'list');
        catalogGrid.classList.toggle('is-grid-view', currentCatalogView !== 'list');
    }
}

function syncMobileFilterSheet() {
    if (mobileStartDateInput) mobileStartDateInput.value = selectedStartDate || '';
    if (mobileEndDateInput) mobileEndDateInput.value = selectedEndDate || '';
    if (mobileSearchInput) mobileSearchInput.value = currentSearchTerm || '';
    mobileAgeFilters.forEach((button) => {
        button.classList.toggle('active', button.dataset.mobileAge === currentAgeFilter);
    });
}

function renderCatalogPagination(total) {
    if (!catalogPagination) return;
    catalogPagination.innerHTML = '';
    const totalPages = Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE));
    if (total <= CATALOG_PAGE_SIZE) return;

    const range = document.createElement('div');
    range.className = 'catalog-pagination-range';
    range.textContent = `รายการ ${(catalogPage - 1) * CATALOG_PAGE_SIZE + 1}-${Math.min(catalogPage * CATALOG_PAGE_SIZE, total)} จาก ${total}`;
    catalogPagination.appendChild(range);

    const controls = document.createElement('div');
    controls.className = 'catalog-pagination-controls';
    const appendButton = (label, page, disabled = false, active = false) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `catalog-page-btn${active ? ' active' : ''}`;
        button.textContent = label;
        button.disabled = disabled;
        button.addEventListener('click', () => {
            catalogPage = page;
            renderCatalog();
        });
        controls.appendChild(button);
    };

    appendButton('ก่อน', catalogPage - 1, catalogPage <= 1);
    for (let page = Math.max(1, catalogPage - 2); page <= Math.min(totalPages, catalogPage + 2); page += 1) {
        appendButton(String(page), page, false, page === catalogPage);
    }
    appendButton('ถัดไป', catalogPage + 1, catalogPage >= totalPages);
    catalogPagination.appendChild(controls);
}

async function applyCatalogFilters({ startDate, endDate, searchTerm, ageFilter, closeSheet = false }) {
    const nextSearchTerm = (searchTerm ?? currentSearchTerm).toLowerCase().trim();
    const nextAgeFilter = ageFilter ?? currentAgeFilter;
    const nextStartDate = startDate ?? selectedStartDate;
    const nextEndDate = endDate ?? selectedEndDate;
    const datesChanged = nextStartDate !== selectedStartDate || nextEndDate !== selectedEndDate;

    currentSearchTerm = nextSearchTerm;
    currentAgeFilter = nextAgeFilter;
    if (searchInput) searchInput.value = currentSearchTerm;
    ageFilters.forEach((pill) => {
        pill.classList.toggle('active', pill.getAttribute('data-val') === currentAgeFilter);
    });

    if (!nextStartDate || !nextEndDate) {
        if (datesChanged) {
            selectedStartDate = null;
            selectedEndDate = null;
            availabilityMap = {};
            if (startDateInput) startDateInput.value = '';
            if (endDateInput) endDateInput.value = '';
            syncBorrowDateSelectionUI();
        }
        catalogPage = 1;
        renderCatalog();
        updateFlowStateUI();
        if (closeSheet) {
            closeDrawer(filterDrawer, filterDrawerOverlay);
        }
        return true;
    }

    if (!ensureValidDateRange(nextStartDate, nextEndDate)) {
        return false;
    }

    if (datesChanged) {
        if (startDateInput) startDateInput.value = nextStartDate;
        if (endDateInput) endDateInput.value = nextEndDate;
        const applied = await checkAvailabilityAndApply(nextStartDate, nextEndDate);
        if (!applied) {
            return false;
        }
        if (closeSheet) {
            closeDrawer(filterDrawer, filterDrawerOverlay);
        }
        return true;
    }

    catalogPage = 1;
    renderCatalog();
    if (currentBorrowStep === 1) {
        setBorrowStep(2, { scroll: true, force: true });
    }
    updateFlowStateUI();
    if (closeSheet) {
        closeDrawer(filterDrawer, filterDrawerOverlay);
    }
    return true;
}

function openCartDrawer() {
    if (cart.length === 0) {
        showFeedback('ยังไม่มีรายการในตะกร้า', 'error');
        return;
    }

    const displayStart = selectedStartDate ? new Date(selectedStartDate).toLocaleDateString('th-TH') : '-';
    const displayEnd = selectedEndDate ? new Date(selectedEndDate).toLocaleDateString('th-TH') : '-';
    document.getElementById('checkout-dates-display').textContent = `${displayStart} - ${displayEnd}`;
    document.getElementById('checkout-buffer-display').textContent = '* ข้อมูลความพร้อมอ้างอิงจากสถานะล่าสุดของทีมอุปกรณ์';
    openDrawer(document.getElementById('cart-drawer'), document.getElementById('cart-drawer-overlay'));
}

function updateFlowStateUI() {
    const hasDates = Boolean(selectedStartDate && selectedEndDate);
    const cartTotal = cart.reduce((sum, item) => sum + item.qty, 0);
    if (!hasDates && currentBorrowStep !== 1) currentBorrowStep = 1;
    if (currentBorrowStep > 2 && cartTotal === 0) currentBorrowStep = hasDates ? 2 : 1;
    const availableStep = getCurrentFlowStep();

    if (stateChipDate) {
        stateChipDate.textContent = hasDates
            ? `เลือกวันแล้ว: ${formatBorrowDateRange(selectedStartDate, selectedEndDate)}`
            : 'ยังไม่เลือกวัน';
        toggleStateChipClass(stateChipDate, hasDates);
    }

    if (stateChipAuth) {
        stateChipAuth.textContent = currentUser ? 'เข้าสู่ระบบแล้ว' : 'ยังไม่เข้าสู่ระบบ';
        toggleStateChipClass(stateChipAuth, Boolean(currentUser));
    }

    if (stateChipCart) {
        stateChipCart.textContent = `ตะกร้า ${cartTotal} รายการ`;
        toggleStateChipClass(stateChipCart, cartTotal > 0);
    }

    if (flowStepsRoot) {
        flowStepsRoot.querySelectorAll('.borrow-flow-step').forEach((stepEl) => {
            const stepNo = Number(stepEl.dataset.step || '1');
            const isComplete = (stepNo === 1 && hasDates) || (stepNo === 2 && cartTotal > 0);
            const isAvailable = stepNo <= availableStep || (stepNo === 3 && cartTotal > 0);
            stepEl.classList.toggle('is-active', stepNo === currentBorrowStep);
            stepEl.classList.toggle('is-complete', isComplete);
            stepEl.classList.toggle('is-disabled', !isAvailable);
            stepEl.setAttribute('aria-current', stepNo === currentBorrowStep ? 'step' : 'false');
            stepEl.setAttribute('aria-disabled', String(!isAvailable));
        });
    }

    stepPanels.forEach((panel) => {
        const stepNo = Number(panel.dataset.stepPanel || '1');
        const isActive = stepNo === currentBorrowStep;
        panel.classList.toggle('is-active', isActive);
        panel.hidden = !isActive;
    });

    if (step3SummaryText) {
        if (cartTotal === 0) {
            step3SummaryText.textContent = 'ยังไม่มีรายการในตะกร้า';
        } else {
            step3SummaryText.textContent = `มีรายการในตะกร้า ${cartTotal} ชิ้น พร้อมตรวจสอบและยืนยัน`;
        }
    }

    if (step3LoginHint) {
        step3LoginHint.textContent = currentUser
            ? 'เข้าสู่ระบบแล้ว สามารถยืนยันคำขอได้'
            : 'กรุณาเข้าสู่ระบบก่อนยืนยันคำขอ';
    }

    if (btnOpenCart) {
        btnOpenCart.disabled = !(hasDates && cartTotal > 0);
        btnOpenCart.textContent = cartTotal > 0
            ? `ตรวจสอบและยืนยันคำขอ (${cartTotal})`
            : 'ตรวจสอบและยืนยันคำขอ';
    }

    if (flowPrimaryCta) {
        if (!hasDates) {
            flowPrimaryCta.textContent = 'เริ่ม Step 1: เลือกวันยืม';
        } else if (cartTotal === 0) {
            flowPrimaryCta.textContent = 'ไป Step 2: เลือกอุปกรณ์';
        } else if (!currentUser) {
            flowPrimaryCta.textContent = 'เข้าสู่ระบบเพื่อยืนยันคำขอ';
        } else {
            flowPrimaryCta.textContent = 'ไป Step 3: ตรวจสอบตะกร้า';
        }
    }
}

function syncBorrowDateSelectionUI() {
    const hasDates = Boolean(selectedStartDate && selectedEndDate);
    const rangeText = formatBorrowDateRange(selectedStartDate, selectedEndDate);

    const summaryMode = document.getElementById('date-summary-mode');
    const btnClearDates = document.getElementById('btn-clear-dates');

    if (summaryMode) {
        summaryMode.classList.toggle('has-value', hasDates);
        summaryMode.classList.remove('is-invalid');
    }

    if (btnClearDates) {
        btnClearDates.style.display = hasDates ? 'inline-block' : 'none';
    }

    const activeLabel = document.getElementById('booking-dates-active');
    if (activeLabel) {
        activeLabel.textContent = hasDates ? rangeText : 'เลือกช่วงวันที่';
    }

    if (catalogDateRange) {
        catalogDateRange.style.display = hasDates ? 'inline-flex' : 'none';
        catalogDateRange.classList.toggle('is-active', hasDates);
        catalogDateRange.textContent = hasDates
            ? `ช่วงวันที่ที่เลือก: ${rangeText}`
            : '';
    }

    updateFlowStateUI();
    renderActiveFilters();
}

syncBorrowDateSelectionUI();

function getFocusableElements(container) {
    if (!container) return [];
    return [...container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
        .filter((el) => !el.disabled && el.offsetParent !== null);
}

function trapTabKey(event, container) {
    if (event.key !== 'Tab') return;
    const focusable = getFocusableElements(container);
    if (focusable.length === 0) return;
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

function openOverlay(overlay, panel) {
    if (!overlay || !panel) return;
    lastFocusedElement = document.activeElement;
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    activeDialog = { overlay, panel };
    document.body.style.overflow = 'hidden';
    setTimeout(() => {
        const focusable = getFocusableElements(panel);
        (focusable[0] || panel).focus();
    }, 0);
}

function closeOverlay(overlay) {
    if (!overlay) return;
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    if (activeDialog?.overlay === overlay) activeDialog = null;
    document.body.style.overflow = '';
    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
        lastFocusedElement.focus();
    }
}

function openDrawer(drawer, overlay) {
    if (!drawer || !overlay) return;
    lastFocusedElement = document.activeElement;
    drawer.classList.add('open');
    overlay.classList.add('visible');
    overlay.setAttribute('aria-hidden', 'false');
    activeDialog = { overlay, panel: drawer };
    document.body.style.overflow = 'hidden';
    setTimeout(() => {
        const focusable = getFocusableElements(drawer);
        (focusable[0] || drawer).focus();
    }, 0);
}

function closeDrawer(drawer, overlay) {
    if (!drawer || !overlay) return;
    drawer.classList.remove('open');
    overlay.classList.remove('visible');
    overlay.setAttribute('aria-hidden', 'true');
    if (activeDialog?.panel === drawer) activeDialog = null;
    document.body.style.overflow = '';
    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
        lastFocusedElement.focus();
    }
}

function showConfirm(message) {
    if (!borrowConfirmModal || !borrowConfirmPanel || !borrowConfirmMessage) {
        showFeedback(message, 'error');
        return Promise.resolve(false);
    }
    borrowConfirmMessage.textContent = message;
    openOverlay(borrowConfirmModal, borrowConfirmPanel);
    return new Promise((resolve) => {
        confirmResolve = resolve;
    });
}

function detectAge(name) {
    const n = (name || '').toLowerCase();
    if (n.includes('ทารก') || n.includes('infant') || n.includes('baby') || n.includes('neonatal')) return 'infant';
    if (n.includes('เด็ก') || n.includes('child') || n.includes('paediatric') || n.includes('pediatric') || n.includes('junior') || n.includes('kid')) return 'child';
    if (n.includes('ผู้ใหญ่') || n.includes('adult') || n.includes('anne')) return 'adult';
    return 'all';
}

function toOrderLabel(teamCode, teamOrder) {
    return `${teamCode} ${String(teamOrder).padStart(2, '0')}`;
}

function computeTeamSummary(members) {
    const total = members.length;
    const readyMembers = members.filter((m) => m.status === 'ready');
    const readyQty = readyMembers.length;
    const nextReady = readyMembers.length > 0 ? readyMembers[0] : null;

    const blockedOrders = members
        .filter((m) => m.status !== 'ready')
        .map((m) => toOrderLabel(m.team_code, m.team_order));

    return {
        total,
        readyQty,
        nextReady,
        blockedOrders
    };
}

async function checkUser() {
    if (TEST_MODE) {
        if (window.localStorage.getItem(TEST_BORROW_LOGIN_KEY) !== '1') {
            window.localStorage.setItem(TEST_BORROW_LOGIN_KEY, '1');
        }
        const loggedIn = window.localStorage.getItem(TEST_BORROW_LOGIN_KEY) === '1';
        currentUser = loggedIn
            ? {
                id: 'test-borrower-001',
                email: 'example@gmail.com',
                user_metadata: { full_name: 'Test Borrower' }
            }
            : null;
    } else {
        const { data: { session } } = await supabase.auth.getSession();
        currentUser = session?.user || null;
    }
    upgradeBorrowNav();

    const btnSubmit = document.getElementById('btn-submit-request');
    const btnCartLogin = document.getElementById('btn-cart-login');

    if (currentUser) {
        document.getElementById('btn-login').style.display = 'none';
        document.getElementById('user-profile').style.display = 'flex';
        if (btnSubmit) btnSubmit.style.display = 'block';
        if (btnCartLogin) btnCartLogin.style.display = 'none';

        const displayName = getBorrowDisplayName(currentUser);
        document.getElementById('user-name').textContent = displayName;
        const userNameWrap = document.getElementById('user-name-wrap');
        const userAvatar = document.getElementById('user-avatar');
        const dropdownName = document.getElementById('user-dropdown-name');
        const dropdownEmail = document.getElementById('user-dropdown-email');
        if (userNameWrap) userNameWrap.textContent = displayName;
        if (userAvatar) userAvatar.textContent = displayName.charAt(0).toUpperCase();
        if (dropdownName) dropdownName.textContent = displayName;
        if (dropdownEmail) dropdownEmail.textContent = currentUser.email || '';
        prefillBorrowerForm(currentUser);
    } else {
        document.getElementById('btn-login').style.display = 'block';
        document.getElementById('user-profile').style.display = 'none';
        if (btnSubmit) btnSubmit.style.display = 'none';
        if (btnCartLogin) btnCartLogin.style.display = 'block';
        closeBorrowUserMenu();
        prefillBorrowerForm(null);
    }

    updateFlowStateUI();
}

function renderDetailDrawer(eq) {
    if (!eq) return;
    const avail = availabilityMap[eq.id] || 0;
    const ageType = detectAge(eq.name_th);
    const ageLabelMap = { infant: 'ทารก', child: 'เด็ก', adult: 'ผู้ใหญ่', all: 'ทั่วไป' };
    if (detailName) detailName.textContent = eq.name_th || 'ไม่ระบุชื่ออุปกรณ์';
    if (detailCode) detailCode.textContent = `Team ${eq.team_code} · ${ageLabelMap[ageType] || ageLabelMap.all}`;
    if (detailAgeIcon) detailAgeIcon.textContent = ageType === 'infant' ? '👶' : ageType === 'child' ? '🧒' : ageType === 'adult' ? '🧑' : '🩺';
    if (detailStockInfo) {
        detailStockInfo.textContent = `ยอดรวมระบบ: ${Math.max(0, Number(eq.total_quantity) || 0)} | ว่างให้ยืม: ${Math.max(0, Number(avail) || 0)}`;
    }
}

function openEquipmentDetail(eqId) {
    const eq = equipments.find((item) => item.id === eqId);
    if (!eq || !detailDrawer || !detailOverlay) return;
    renderDetailDrawer(eq);
    detailOverlay.style.pointerEvents = 'none';
    openDrawer(detailDrawer, detailOverlay);
}

function closeEquipmentDetail() {
    if (!detailDrawer || !detailOverlay) return;
    detailOverlay.style.pointerEvents = '';
    closeDrawer(detailDrawer, detailOverlay);
}

async function doLogin() {
    if (TEST_MODE) {
        window.localStorage.setItem(TEST_BORROW_LOGIN_KEY, '1');
        await checkUser();
        showFeedback('เข้าสู่ระบบทดสอบเรียบร้อยแล้ว', 'success');
        return;
    }
    const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.href }
    });
    if (error) showFeedback(`เข้าสู่ระบบไม่สำเร็จ: ${error.message}`, 'error');
}

document.getElementById('btn-login').addEventListener('click', doLogin);
document.getElementById('btn-cart-login')?.addEventListener('click', doLogin);
document.addEventListener('click', (event) => {
    if (event.target.id === 'btn-edit-borrower-profile') {
        toggleBorrowerProfileEditMode();
    }
});

async function handleLogout() {
    if (logoutInFlight) return;
    logoutInFlight = true;
    const signedOutUser = currentUser;
    if (TEST_MODE) {
        window.localStorage.removeItem(TEST_BORROW_LOGIN_KEY);
    } else {
        const { error } = await supabase.auth.signOut();
        if (error) {
            logoutInFlight = false;
            showFeedback(`Logout failed: ${error.message}`, 'error');
            return;
        }
    }

    removeBorrowerProfileDraft(signedOutUser);
    clearBorrowerProfileFields();
    currentUser = null;
    await checkUser();
    logoutInFlight = false;
    showFeedback('ออกจากระบบเรียบร้อยแล้ว', 'success');
}

document.addEventListener('click', (event) => {
    const logoutButton = event.target.closest('#btn-logout');
    if (!logoutButton) return;
    event.preventDefault();
    handleLogout();
});

if (!TEST_MODE) {
    supabase.auth.onAuthStateChange(() => {
        checkUser();
    });
}

async function loadEquipments() {
    const [
        { data: manikins, error: manikinError },
        { data: equipmentRows, error: equipmentError },
        { data: teamRows },
        { data: teamCapabilityRows, error: teamCapabilityError },
        capabilityRows,
        manikinCapabilityRows
    ] = await Promise.all([
        supabase
            .from('manikins')
            .select('sap_id, asset_name, status, team_code, team_order, is_active, needs_review, deleted_at')
            .eq('is_active', true)
            .eq('needs_review', false)
            .is('deleted_at', null)
            .not('team_code', 'is', null)
            .order('team_code', { ascending: true })
            .order('team_order', { ascending: true }),
        supabase
            .from('equipments')
            .select('id, name_th, source_team_code')
            .eq('borrow_enabled', true),
        supabase
            .from('teams')
            .select('team_code, display_name, cover_image_url'),
        supabase
            .from('team_capabilities')
            .select('team_code, capability_id'),
        loadJson('capabilities.json').catch((error) => {
            console.error('Error loading capabilities.json:', error);
            return [];
        }),
        loadJson('manikin_capabilities.json').catch((error) => {
            console.error('Error loading manikin_capabilities.json:', error);
            return [];
        })
    ]);

    if (manikinError) {
        console.error('Error fetching team manikins:', manikinError);
        return;
    }

    if (equipmentError) {
        console.error('Error fetching equipment mapping:', equipmentError);
    }

    if (teamCapabilityError) {
        console.warn('Error fetching team_capabilities, fallback to manikin_capabilities only:', teamCapabilityError);
    }

    // Direct team_code → equipment_id map (no string matching)
    const equipmentTeamMap = new Map();
    (equipmentRows || []).forEach((row) => {
        if (row.source_team_code) {
            equipmentTeamMap.set(row.source_team_code, row.id);
        }
    });

    teamCoverMap = {};
    teamCapabilityMap = {};
    const teamMetaMap = new Map();
    (teamRows || []).forEach((t) => {
        teamCoverMap[t.team_code] = t.cover_image_url || null;
        teamMetaMap.set(t.team_code, t);
    });

    const capabilityLabelMap = {};
    (capabilityRows || []).forEach((cap) => {
        capabilityLabelMap[cap.id] = cap.label_th;
    });

    const teamCapabilityLabelMap = {};
    (teamCapabilityRows || []).forEach((row) => {
        if (!row.team_code) return;
        const label = capabilityLabelMap[row.capability_id];
        if (!label) return;
        if (!teamCapabilityLabelMap[row.team_code]) teamCapabilityLabelMap[row.team_code] = [];
        if (!teamCapabilityLabelMap[row.team_code].includes(label)) {
            teamCapabilityLabelMap[row.team_code].push(label);
        }
    });

    const manikinCapabilityMap = {};
    (manikinCapabilityRows || []).forEach((row) => {
        if (!manikinCapabilityMap[row.sap_id]) manikinCapabilityMap[row.sap_id] = [];
        const label = capabilityLabelMap[row.capability_id];
        if (label) manikinCapabilityMap[row.sap_id].push(label);
    });

    const grouped = new Map();
    (manikins || []).forEach((m) => {
        const key = m.team_code;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(m);
    });

    const rows = [];
    grouped.forEach((members, key) => {
        const teamCode = key;
        const teamMeta = teamMetaMap.get(teamCode);
        const summary = computeTeamSummary(members);
        const displayName = resolveTeamDisplayName(teamMeta, members);
        // Resolve via FK relation — no string matching
        const submitEquipmentId = equipmentTeamMap.get(teamCode) ?? null;

        rows.push({
            id: key,
            team_code: teamCode,
            name_th: displayName,
            total_quantity: summary.total,
            ready_quantity: summary.readyQty,
            maintenance_quantity: summary.total - summary.readyQty,
            next_ready_label: summary.nextReady
                ? `${toOrderLabel(summary.nextReady.team_code, summary.nextReady.team_order)} (${summary.nextReady.sap_id})`
                : null,
            blocked_orders: summary.blockedOrders,
            submit_equipment_id: submitEquipmentId
        });

        const memberLabels = summarizeTeamCapabilities(members, manikinCapabilityMap);
        const defaultTeamLabels = teamCapabilityLabelMap[teamCode] || [];
        teamCapabilityMap[teamCode] = [...new Set([...defaultTeamLabels, ...memberLabels])].sort((a, b) => {
            const priorityDiff = getCapabilityPriority(a) - getCapabilityPriority(b);
            if (priorityDiff !== 0) return priorityDiff;
            return a.localeCompare(b, 'th');
        });
    });

    rows.sort((a, b) => {
        if (a.team_code !== b.team_code) return a.team_code.localeCompare(b.team_code);
        return a.name_th.localeCompare(b.name_th, 'th');
    });

    equipments = rows;
    resetAvailabilityFromTeam();
}

function resetAvailabilityFromTeam() {
    availabilityErrorMessage = '';
    availabilityMap = {};
    equipments.forEach((eq) => {
        availabilityMap[eq.id] = eq.submit_equipment_id ? eq.ready_quantity : 0;
    });
}

async function loadAvailabilityFromDb(start, end) {
    const mappedEquipmentIds = [...new Set(
        equipments
            .map((eq) => eq.submit_equipment_id)
            .filter(Boolean)
    )];

    if (mappedEquipmentIds.length === 0) {
        resetAvailabilityFromTeam();
        return true;
    }

    const { data, error } = await supabase.rpc('get_borrow_availability', {
        p_start_date: start,
        p_end_date: end,
        p_equipment_ids: mappedEquipmentIds
    });

    if (error) {
        console.error('Error loading availability:', error);
        availabilityErrorMessage = error.message || 'Unknown error';
        availabilityMap = {};
        equipments.forEach((eq) => {
            availabilityMap[eq.id] = 0;
        });
        renderCatalog();
        showFeedback(`ไม่สามารถตรวจสอบจำนวนคงเหลือได้: ${error.message}`, 'error');
        return false;
    }

    availabilityErrorMessage = '';
    const dbAvailabilityMap = {};
    (data || []).forEach((row) => {
        dbAvailabilityMap[row.equipment_id] = Math.max(0, Number(row.available_qty) || 0);
    });

    availabilityMap = {};
    equipments.forEach((eq) => {
        if (!eq.submit_equipment_id) {
            availabilityMap[eq.id] = 0;
            return;
        }

        const dbAvail = dbAvailabilityMap[eq.submit_equipment_id] ?? 0;
        const teamReady = Math.max(0, Number(eq.ready_quantity) || 0);
        availabilityMap[eq.id] = Math.min(dbAvail, teamReady);
    });

    return true;
}

async function init() {
    if (TEST_MODE) ensureTestRequestsSeeded();
    upgradeBorrowNav();
    renderBorrowSkeleton();
    setCatalogView(currentCatalogView);
    syncMobileFilterSheet();
    await checkUser();
    await loadEquipments();
    renderCatalog();
    updateCartUI();
}

btnApplyDates.addEventListener('click', async () => {
    if (!startDateInput.value || !endDateInput.value) {
        showFeedback('กรุณาเลือกทั้งวันที่รับและวันที่คืน', 'error');
        return;
    }
    if (!ensureValidDateRange(startDateInput.value, endDateInput.value)) {
        return;
    }
    btnApplyDates.disabled = true;
    btnApplyDates.textContent = 'กำลังตรวจสอบ...';
    const applied = await checkAvailabilityAndApply(startDateInput.value, endDateInput.value);
    btnApplyDates.disabled = false;
    btnApplyDates.textContent = 'Confirm';
    if (applied) {
        closeDateRangePicker({ restoreFocus: true });
        return;
    }
    btnApplyDates.textContent = 'เช็คคิวและล็อกวัน';
    btnApplyDates.textContent = 'Confirm';
});

btnClearDates.addEventListener('click', async () => {
    if (cart.length > 0) {
        const ok = await showConfirm('การยกเลิกล็อกวัน จะทำให้ตะกร้าถูกล้าง ยืนยันหรือไม่?');
        if (!ok) return;
        cart = [];
        updateCartUI();
    }

    selectedStartDate = null;
    selectedEndDate = null;
    invalidDateAttemptCount = 0;
    startDateInput.value = '';
    endDateInput.value = '';
    if (mobileStartDateInput) mobileStartDateInput.value = '';
    if (mobileEndDateInput) mobileEndDateInput.value = '';
    syncBorrowDateSelectionUI();
    resetAvailabilityFromTeam();
    catalogPage = 1;
    renderCatalog();
    showFeedback('ยกเลิกการจองวันเรียบร้อยแล้ว', 'success');
});

viewModeButtons.forEach((button) => {
    button.addEventListener('click', () => {
        setCatalogView(button.dataset.viewMode);
        renderCatalog();
    });
});

btnOpenFilterSheet?.addEventListener('click', () => {
    syncMobileFilterSheet();
    openDrawer(filterDrawer, filterDrawerOverlay);
});

filterDrawerClose?.addEventListener('click', () => closeDrawer(filterDrawer, filterDrawerOverlay));
filterDrawerOverlay?.addEventListener('click', () => closeDrawer(filterDrawer, filterDrawerOverlay));

mobileAgeFilters.forEach((button) => {
    button.addEventListener('click', () => {
        mobileAgeFilters.forEach((item) => item.classList.remove('active'));
        button.classList.add('active');
    });
});

btnMobileClearFilters?.addEventListener('click', () => {
    if (mobileSearchInput) mobileSearchInput.value = '';
    mobileAgeFilters.forEach((item) => item.classList.toggle('active', item.dataset.mobileAge === 'all'));
});

btnMobileApplyFilters?.addEventListener('click', async () => {
    const selectedMobileAge = [...mobileAgeFilters].find((button) => button.classList.contains('active'))?.dataset.mobileAge || 'all';
    await applyCatalogFilters({
        startDate: mobileStartDateInput?.value || undefined,
        endDate: mobileEndDateInput?.value || undefined,
        searchTerm: mobileSearchInput?.value || '',
        ageFilter: selectedMobileAge,
        closeSheet: true
    });
});

document.getElementById('date-summary-mode')?.addEventListener('click', () => {
    openDateRangePicker();
});

btnCloseDateRange?.addEventListener('click', () => closeDateRangePicker({ restoreFocus: true }));
btnDateCancel?.addEventListener('click', () => closeDateRangePicker({ restoreFocus: true }));
dateRangeOverlay?.addEventListener('click', () => closeDateRangePicker({ restoreFocus: true }));

async function checkAvailabilityAndApply(start, end) {
    if (!ensureValidDateRange(start, end)) {
        return false;
    }

    const shouldResetCart = cart.length > 0 && (start !== selectedStartDate || end !== selectedEndDate);

    if (shouldResetCart) {
        const ok = await showConfirm('การเปลี่ยนวันที่จะล้างตะกร้าปัจจุบัน ยืนยันหรือไม่?');
        if (!ok) {
            return false;
        }
    }

    const loaded = await loadAvailabilityFromDb(start, end);
    if (!loaded) return false;

    if (shouldResetCart) {
        cart = [];
        updateCartUI();
    }

    invalidDateAttemptCount = 0;
    selectedStartDate = start;
    selectedEndDate = end;
    catalogPage = 1;

    const rangeText = formatBorrowDateRange(start, end);
    syncBorrowDateSelectionUI();
    if (currentBorrowStep === 1) {
        setBorrowStep(2, { scroll: true, force: true });
    }

    renderCatalog();
    showFeedback(`เลือกช่วงยืมเรียบร้อย: ${rangeText}`, 'success');
    return true;
}

ageFilters.forEach((pill) => {
    pill.addEventListener('click', (e) => {
        ageFilters.forEach((p) => p.classList.remove('active'));
        e.target.classList.add('active');
        currentAgeFilter = e.target.getAttribute('data-val');
        catalogPage = 1;
        renderCatalog();
    });
});

searchInput.addEventListener('input', (e) => {
    currentSearchTerm = e.target.value.toLowerCase().trim();
    catalogPage = 1;
    renderCatalog();
});

activeFiltersRoot?.addEventListener('click', (event) => {
    const clearButton = event.target.closest('[data-filter-clear]');
    if (!clearButton) return;
    const key = clearButton.getAttribute('data-filter-clear');
    if (key === 'dates') {
        btnClearDates?.click();
        return;
    }
        if (key === 'age') {
            currentAgeFilter = 'all';
            ageFilters.forEach((pill) => {
                pill.classList.toggle('active', pill.getAttribute('data-val') === 'all');
            });
    }
    if (key === 'search') {
        currentSearchTerm = '';
        if (searchInput) searchInput.value = '';
    }
    catalogPage = 1;
    renderCatalog();
});

flowPrimaryCta?.addEventListener('click', () => {
    const hasDates = Boolean(selectedStartDate && selectedEndDate);
    const cartTotal = cart.reduce((sum, item) => sum + item.qty, 0);
    if (!hasDates) {
        setBorrowStep(1, { scroll: true, force: true });
        scrollToDatePicker();
        return;
    }
    if (cartTotal === 0) {
        setBorrowStep(2, { scroll: true });
        return;
    }
    setBorrowStep(3, { scroll: true });
});

flowStepsRoot?.addEventListener('click', (event) => {
    const stepEl = event.target.closest('.borrow-flow-step');
    if (!stepEl) return;
    setBorrowStep(Number(stepEl.dataset.step), { scroll: true });
});

flowStepsRoot?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const stepEl = event.target.closest('.borrow-flow-step');
    if (!stepEl) return;
    event.preventDefault();
    setBorrowStep(Number(stepEl.dataset.step), { scroll: true });
});

btnOpenCart?.addEventListener('click', () => {
    if (!currentUser) {
        showFeedback('กรุณาเข้าสู่ระบบก่อนยืนยันคำขอ', 'error');
        return;
    }
    openCartDrawer();
});

function filterByAge(eq) {
    if (currentAgeFilter === 'all') return true;
    return detectAge(eq.name_th) === currentAgeFilter;
}

function renderCatalog() {
    const grid = document.getElementById('equipments-grid');
    grid.innerHTML = '';
    setCatalogView(currentCatalogView);
    syncMobileFilterSheet();
    renderActiveFilters();
    const hasDates = Boolean(selectedStartDate && selectedEndDate);

    if (!hasDates) {
        if (catalogResultCount) {
            catalogResultCount.textContent = 'รอเลือกช่วงวันก่อนแสดงรายการ';
        }
        if (catalogPagination) catalogPagination.innerHTML = '';
        grid.innerHTML = `
            <div class="empty-state borrow-empty-state" style="grid-column:1/-1;">
                <p class="borrow-empty-state-title">เริ่มที่ STEP 1 ก่อน</p>
                <p class="borrow-empty-state-copy">เลือกวันรับของและวันคืนของก่อน แล้วระบบจะแสดงเฉพาะอุปกรณ์ที่พร้อมให้ยืมในช่วงเวลานั้น</p>
                <div class="borrow-empty-state-actions">
                    <button type="button" class="borrow-empty-action is-primary" data-empty-action="pick-dates">เลือกวันยืมตอนนี้</button>
                </div>
            </div>
        `;
        return;
    }

    const filtered = getFilteredCatalogItems();
    const totalPages = Math.max(1, Math.ceil(filtered.length / CATALOG_PAGE_SIZE));
    if (catalogPage > totalPages) catalogPage = totalPages;
    if (catalogPage < 1) catalogPage = 1;
    const pageStart = (catalogPage - 1) * CATALOG_PAGE_SIZE;
    const pageItems = filtered.slice(pageStart, pageStart + CATALOG_PAGE_SIZE);

    if (catalogResultCount) {
        const total = filtered.length;
        catalogResultCount.textContent = total > 0
            ? `แสดง ${pageStart + 1}-${Math.min(pageStart + CATALOG_PAGE_SIZE, total)} จาก ${total} รายการ`
            : 'ไม่พบรายการที่ตรงเงื่อนไข';
    }

    if (filtered.length === 0) {
        const hasFilters = Boolean(currentSearchTerm || currentAgeFilter !== 'all');
        const title = hasDates
            ? 'ไม่พบอุปกรณ์ตามเงื่อนไขที่เลือก'
            : 'ยังไม่ได้เลือกช่วงวันยืม';
        const copy = hasDates
            ? 'ลองล้างตัวกรองบางรายการหรือเปลี่ยนช่วงวัน เพื่อดูอุปกรณ์ที่พร้อมใช้งานมากขึ้น'
            : 'เริ่มจาก STEP 1 ก่อน แล้วระบบจะแสดงเฉพาะรายการที่พร้อมยืมตามช่วงเวลาจริง';
        const viewLabel = currentCatalogView === 'list' ? 'มุมมองรายการ' : 'มุมมองการ์ด';
        const actionMarkup = hasDates
            ? `
                <div class="borrow-empty-state-actions">
                    ${hasFilters ? '<button type="button" class="borrow-empty-action" data-empty-action="clear-filters">ล้างตัวกรอง</button>' : ''}
                    <button type="button" class="borrow-empty-action is-primary" data-empty-action="change-dates">เปลี่ยนช่วงวัน</button>
                </div>
            `
            : `
                <div class="borrow-empty-state-actions">
                    <button type="button" class="borrow-empty-action is-primary" data-empty-action="pick-dates">เลือกวันยืมตอนนี้</button>
                </div>
            `;
        const listHeaderMarkup = currentCatalogView === 'list'
            ? `
                <div class="borrow-list-header" role="row" aria-label="หัวตารางรายการอุปกรณ์">
                    <div class="borrow-list-header-name">ชื่อ</div>
                    <div class="borrow-list-header-availability">Availability</div>
                    <div class="borrow-list-header-action">Action</div>
                </div>
            `
            : '';
        grid.innerHTML = `
            ${listHeaderMarkup}
            <div class="empty-state borrow-empty-state" style="grid-column:1/-1;">
                <p class="borrow-empty-state-title">${title}</p>
                <p class="borrow-empty-state-copy">${copy}</p>
                <p class="borrow-empty-state-view">${viewLabel}</p>
                ${actionMarkup}
            </div>
        `;
        if (catalogPagination) catalogPagination.innerHTML = '';
        return;
    }

    if (currentCatalogView === 'list') {
        grid.insertAdjacentHTML('beforeend', `
            <div class="borrow-list-header" role="row" aria-label="หัวตารางรายการอุปกรณ์">
                <div class="borrow-list-header-name">ชื่อ</div>
                <div class="borrow-list-header-availability">Availability</div>
                <div class="borrow-list-header-action">Action</div>
            </div>
        `);
    }

    pageItems.forEach((eq, index) => {
        const avail = availabilityMap[eq.id] || 0;
        const inCart = cart.find((c) => c.equipment_id === eq.id)?.qty || 0;
        const remaining = avail - inCart;
        const state = getBorrowState(eq, avail);
        const isMapped = Boolean(eq.submit_equipment_id);

        const ageType = detectAge(eq.name_th);
        const ageLabels = { infant: 'ทารก', child: 'เด็ก', adult: 'ผู้ใหญ่', all: 'ทั่วไป / ทุกวัย' };
        const ageLabel = ageLabels[ageType] || 'ทั่วไป / ทุกวัย';
        const categoryInfo = `<div class="product-code age-category">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
            กลุ่มช่วงวัย: ${ageLabel}
        </div>`;

        const teamBadge = `<div class="product-age-badge ${ageType}">${eq.team_code}</div>`;
        const statusMarkup = `<div class="avail-badge ${state.badgeClass}">${state.badgeText}</div>`;
        const stateNote = state.note
            ? `<div class="product-code card-state-note">${state.note}</div>`
            : '';
        const mappingNote = isMapped
            ? ''
            : '<div class="product-code" style="margin-top:6px;color:#f59e0b;">* อยู่ระหว่างปรับปรุงการเชื่อมต่อระบบยืม</div>';

        const capabilityLabels = teamCapabilityMap[eq.team_code] || [];
        const capabilityMarkup = renderInlineCapabilityMarkup(capabilityLabels);
        const useCaseText = capabilityLabels.length > 0
            ? capabilityLabels.slice(0, 2).join(' • ')
            : 'ใช้ฝึกทักษะทางการแพทย์ตามหลักสูตร';
        const availabilityOnSelectedDate = selectedStartDate && selectedEndDate
            ? `พร้อมตามช่วงวันที่เลือก: ${Math.max(remaining, 0)} ชุด`
            : 'เลือกช่วงวันก่อนเพื่อดูความพร้อมตามจริง';
        const decisionInfo = `
            <div class="decision-info">
                <div class="decision-line"><strong>เหมาะกับ:</strong> ${useCaseText}</div>
                <div class="decision-line"><strong>Availability:</strong> ${availabilityOnSelectedDate}</div>
            </div>
        `;
        const detailNote = `${decisionInfo}${categoryInfo}${capabilityMarkup}${mappingNote}${stateNote}`;

        let cartControls = '';
        if (inCart > 0) {
            cartControls = `
                <div class="qty-control btn-stepper" style="width:100%; justify-content: space-between;">
                    <button class="qty-btn" data-action="minus" data-eq="${eq.id}">-</button>
                    <div class="qty-display">${inCart} ชิ้น</div>
                    <button class="qty-btn" data-action="plus" data-eq="${eq.id}" ${(remaining <= 0 || state.ctaDisabled) ? 'disabled' : ''}>+</button>
                </div>
            `;
        } else {
            cartControls = `
                <button class="btn-add-cart" data-action="add" data-eq="${eq.id}" ${state.ctaDisabled ? 'disabled' : ''}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
                    เพิ่มลงตะกร้า
                </button>
            `;
        }

        const card = document.createElement('div');
        card.className = `product-card age-accent-${ageType} stagger-reveal-enter ${currentCatalogView === 'list' ? 'product-card-list' : ''} ${selectedCatalogRowId === eq.id ? 'is-selected' : ''}`;
        card.dataset.eq = eq.id;
        card.setAttribute('data-testid', `equipment-card-${eq.id}`);
        card.style.animationDelay = `${index * 40}ms`;
        const coverUrl = teamCoverMap[eq.team_code] || null;
        const coverHtml = coverUrl
            ? `<div class="card-cover-img"><img src="${coverUrl}" alt="${eq.name_th}" loading="lazy" data-role="detail-trigger" data-testid="equipment-image-${eq.id}" onerror="this.parentElement.style.display='none'" /></div>`
            : '<div class="card-cover-img card-cover-placeholder" data-role="detail-trigger"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"></path><circle cx="12" cy="13" r="3"></circle></svg></div>';
        if (currentCatalogView === 'list') {
            const isExpanded = expandedCatalogRows.has(eq.id);
            const compactCapabilityMarkup = capabilityLabels.length
                ? `
                    <div class="borrow-list-tags">
                        ${capabilityLabels.slice(0, 2).map((label) => `<span class="borrow-list-tag">${label}</span>`).join('')}
                        ${capabilityLabels.length > 2 ? `<span class="borrow-list-tag borrow-list-tag-more">+${capabilityLabels.length - 2}</span>` : ''}
                    </div>
                `
                : '';
            const compactActionMeta = `
                <button type="button" class="borrow-list-expand-toggle" data-action="toggle-row-expand" data-eq="${eq.id}" aria-expanded="${isExpanded}">
                    ${isExpanded ? 'ซ่อนรายละเอียด' : 'ดูรายละเอียด'}
                </button>
            `;
            const listCoverHtml = coverUrl
                ? `<div class="borrow-list-media" data-role="detail-trigger"><img src="${coverUrl}" alt="${eq.name_th}" loading="lazy" data-role="detail-trigger" data-testid="equipment-image-${eq.id}" onerror="this.parentElement.style.display='none'" /></div>`
                : '<div class="borrow-list-media borrow-list-media-placeholder" data-role="detail-trigger"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"></path><circle cx="12" cy="13" r="3"></circle></svg></div>';
            const compactActionMetaUi = `
                <button type="button" class="borrow-list-expand-toggle" data-action="toggle-row-expand" data-eq="${eq.id}" aria-expanded="${isExpanded}">
                    <span>${isExpanded ? 'ซ่อน' : 'รายละเอียด'}</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                        <path d="m6 9 6 6 6-6"></path>
                    </svg>
                </button>
            `;
            const expandedDetailsMarkup = `
                <div class="borrow-list-expanded${isExpanded ? ' is-open' : ''}" ${isExpanded ? '' : 'hidden'}>
                    <div class="borrow-list-expanded-grid">
                        <div class="borrow-list-expanded-section">
                            <div class="borrow-list-expanded-label">เหมาะกับการใช้งาน</div>
                            <div class="borrow-list-expanded-value">${useCaseText}</div>
                        </div>
                        <div class="borrow-list-expanded-section">
                            <div class="borrow-list-expanded-label">Availability</div>
                            <div class="borrow-list-expanded-value">${availabilityOnSelectedDate}</div>
                        </div>
                        <div class="borrow-list-expanded-section">
                            <div class="borrow-list-expanded-label">ช่วงวัย</div>
                            <div class="borrow-list-expanded-value">${ageLabel}</div>
                        </div>
                        ${capabilityLabels.length ? `
                            <div class="borrow-list-expanded-section borrow-list-expanded-section-wide">
                                <div class="borrow-list-expanded-label">ฟังก์ชันที่ทำได้</div>
                                <div class="borrow-list-expanded-tags">
                                    ${capabilityLabels.map((label) => `<span class="borrow-list-expanded-tag">${label}</span>`).join('')}
                                </div>
                            </div>
                        ` : ''}
                        ${state.note ? `
                            <div class="borrow-list-expanded-section borrow-list-expanded-section-wide">
                                <div class="borrow-list-expanded-label">สถานะเพิ่มเติม</div>
                                <div class="borrow-list-expanded-value">${state.note}</div>
                            </div>
                        ` : ''}
                        ${isMapped ? '' : `
                            <div class="borrow-list-expanded-section borrow-list-expanded-section-wide is-warning">
                                <div class="borrow-list-expanded-label">ข้อสังเกต</div>
                                <div class="borrow-list-expanded-value">อยู่ระหว่างปรับปรุงการเชื่อมต่อระบบยืม</div>
                            </div>
                        `}
                    </div>
                </div>
            `;

            card.innerHTML = `
                <div class="borrow-list-layout">
                    <div class="borrow-list-media-col">
                        ${listCoverHtml}
                    </div>
                    <div class="borrow-list-main">
                        <div class="borrow-list-head">
                            <div class="borrow-list-meta">
                                <span class="borrow-list-code">${eq.team_code}</span>
                                <span class="borrow-list-meta-item">${ageLabel}</span>
                            </div>
                            <h3 class="product-name borrow-list-title" data-role="detail-trigger" data-testid="equipment-title-${eq.id}">${eq.name_th}</h3>
                            <div class="borrow-list-usecase">${useCaseText}</div>
                        </div>
                        <div class="borrow-list-foot">
                            ${compactCapabilityMarkup}
                        </div>
                    </div>
                    <div class="borrow-list-availability-col">
                        ${statusMarkup}
                        <div class="borrow-list-availability">${availabilityOnSelectedDate}</div>
                    </div>
                    <div class="borrow-list-action-col">
                        <div class="product-card-controls borrow-list-actions">${cartControls}</div>
                        <div class="borrow-list-action-meta">
                            ${compactActionMetaUi}
                        </div>
                    </div>
                </div>
                ${expandedDetailsMarkup}
            `;
        } else {
            card.innerHTML = `
                ${coverHtml}
                <div class="product-card-top">
                    ${teamBadge}
                    ${statusMarkup}
                </div>
                <div class="product-body">
                    <h3 class="product-name" data-role="detail-trigger" data-testid="equipment-title-${eq.id}">${eq.name_th}</h3>
                    ${detailNote}
                </div>
                <div class="product-card-controls">${cartControls}</div>
            `;
        }

        grid.appendChild(card);
    });
    renderCatalogPagination(filtered.length);
}

window.handleAddClick = function handleAddClick(eqId, qty = 1) {
    if (!selectedStartDate || !selectedEndDate) {
        showFeedback('กรุณาเลือกวันยืม-คืนก่อนเพิ่มลงตะกร้า', 'error');
        scrollToDatePicker();
        return;
    }
    updateItemCart(eqId, qty);
};



window.updateItemCart = function updateItemCart(eqId, delta) {
    if (!selectedStartDate || !selectedEndDate) {
        showFeedback('กรุณาเลือกวันยืม-คืนก่อนเพิ่มลงตะกร้า', 'error');
        return;
    }

    const eq = equipments.find((x) => x.id === eqId);
    if (!eq) return;
    const previousTotal = cart.reduce((sum, item) => sum + item.qty, 0);

    const avail = availabilityMap[eqId] || 0;
    const state = getBorrowState(eq, avail);
    if (delta > 0 && state.ctaDisabled) {
        showFeedback(state.feedback, 'error');
        return;
    }

    let item = cart.find((c) => c.equipment_id === eqId);
    if (!item) {
        if (delta < 0) return;
        item = {
            equipment_id: eq.id,
            submit_equipment_id: eq.submit_equipment_id,
            name: eq.name_th,
            qty: 0
        };
        cart.push(item);
    }

    const newQty = item.qty + delta;
    if (newQty < 0) return;
    if (newQty > avail) {
        showFeedback('จำนวนที่เลือกเกินจำนวนที่พร้อมยืมตาม Team', 'error');
        return;
    }

    const totalCartQty = cart.reduce((sum, c) => sum + (c.equipment_id === eqId ? newQty : c.qty), 0);
    if (totalCartQty > 5) {
        showFeedback('จำกัดสูงสุด 5 ชิ้นต่อ 1 คำขอ', 'error');
        return;
    }

    item.qty = newQty;
    if (item.qty === 0) {
        cart = cart.filter((c) => c.equipment_id !== eqId);
    }

    updateCartUI();
    renderCatalog();
    const currentTotal = cart.reduce((sum, i) => sum + i.qty, 0);
    if (delta > 0) {
        if (item.qty === 1) {
            showFeedback(`เพิ่ม ${eq.name_th} ลงตะกร้าแล้ว`, 'success');
        } else {
            showFeedback(`เพิ่ม ${eq.name_th} เป็นจำนวน ${item.qty} ชิ้น`, 'success');
        }
    }
};

function updateCartUI() {
    const badge = document.getElementById('cart-badge');
    const total = cart.reduce((sum, item) => sum + item.qty, 0);
    badge.textContent = total;
    badge.style.display = total > 0 ? 'flex' : 'none';

    if (total > 0) {
        badge.classList.remove('bump');
        void badge.offsetWidth;
        badge.classList.add('bump');
    }

    const list = document.getElementById('cart-items');
    list.innerHTML = '';

    if (cart.length === 0) {
        list.innerHTML = '<div style="text-align:center; color:var(--text-3); padding:20px;">ยังไม่มีรายการในตะกร้า</div>';
        updateFlowStateUI();
        return;
    }

    cart.forEach((item) => {
        list.innerHTML += `
            <div class="cart-item" style="display:flex; justify-content:space-between; align-items:center; border:1px solid var(--border); border-radius:var(--r); padding:16px;">
                <div class="cart-item-info" style="flex:1; padding-right:12px;">
                    <h4 style="margin:0 0 6px 0; font-size:0.95rem; font-weight:600; color:var(--text); line-height:1.4;">${item.name}</h4>
                    <p style="margin:0; font-size:0.85rem; color:var(--text-3);">จำนวน: <strong style="color:var(--text);">${item.qty}</strong> ชิ้น</p>
                </div>
                <button class="cart-item-remove" style="background:transparent; border:none; cursor:pointer; color:var(--text-4); padding:8px; border-radius:var(--r);" data-action="remove" data-eq="${item.equipment_id}" data-qty="${item.qty}">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6"/></svg>
                </button>
            </div>
        `;
    });

    updateFlowStateUI();
}

// Delegated listeners for catalog and cart// Delegated listeners for catalog and cart (CSP-safe — no inline onclick)
document.getElementById('equipments-grid').addEventListener('click', (e) => {
    const emptyAction = e.target.closest('[data-empty-action]');
    if (emptyAction) {
        const action = emptyAction.dataset.emptyAction;
        if (action === 'pick-dates' || action === 'change-dates') {
            scrollToDatePicker();
        } else if (action === 'clear-filters') {
            currentAgeFilter = 'all';
            currentSearchTerm = '';
            ageFilters.forEach((btn) => btn.classList.toggle('active', btn.dataset.val === 'all'));
            if (searchInput) searchInput.value = '';
            renderCatalog();
        }
        return;
    }

    const clickedCard = e.target.closest('.product-card');
    if (clickedCard) {
        const targetIsDetailTrigger = Boolean(e.target.closest('[data-role="detail-trigger"]'));
        const targetIsControl = Boolean(
            e.target.closest('.product-card-controls') ||
            e.target.closest('[data-action]') ||
            e.target.closest('.qty-btn')
        );
        if (currentCatalogView === 'list' && !targetIsControl) {
            selectedCatalogRowId = clickedCard.dataset.eq;
            document.querySelectorAll('#equipments-grid .product-card').forEach((card) => {
                card.classList.toggle('is-selected', card.dataset.eq === selectedCatalogRowId);
            });
            if (!targetIsDetailTrigger) return;
        }
        if (!targetIsControl) {
            openEquipmentDetail(clickedCard.dataset.eq);
            return;
        }
    }

    const btn = e.target.closest('[data-action]');
    if (!btn || btn.disabled) return;
    const action = btn.dataset.action;
    const eqId = btn.dataset.eq;
    if (action === 'toggle-row-expand') {
        const card = btn.closest('.product-card');
        if (!card) return;
        const detail = card.querySelector('.borrow-list-expanded');
        if (!detail) return;
        const willOpen = detail.hidden;
        detail.hidden = !willOpen;
        detail.classList.toggle('is-open', willOpen);
        btn.setAttribute('aria-expanded', String(willOpen));
        if (willOpen) expandedCatalogRows.add(eqId);
        else expandedCatalogRows.delete(eqId);
        return;
    }
    if (action === 'toggle-capabilities') {
        const card = btn.closest('.product-card');
        if (!card) return;
        card.querySelectorAll('.cap-extra-list').forEach((extraList) => {
            if (extraList !== btn.nextElementSibling) extraList.hidden = true;
        });
        card.querySelectorAll('[data-action="toggle-capabilities"]').forEach((toggleBtn) => {
            if (toggleBtn !== btn) {
                toggleBtn.setAttribute('aria-expanded', 'false');
                toggleBtn.hidden = false;
            }
        });
        const extraList = btn.nextElementSibling;
        if (!extraList?.classList.contains('cap-extra-list')) return;
        const willOpen = extraList.hidden;
        extraList.hidden = !willOpen;
        btn.setAttribute('aria-expanded', String(willOpen));
        btn.hidden = willOpen;
    } else if (action === 'add') handleAddClick(eqId);
    else if (action === 'plus') updateItemCart(eqId, 1);
    else if (action === 'minus') updateItemCart(eqId, -1);
});

document.addEventListener('click', (event) => {
    if (event.target.closest('.card-capability-block')) return;
    document.querySelectorAll('.cap-extra-list').forEach((extraList) => {
        extraList.hidden = true;
    });
    document.querySelectorAll('[data-action="toggle-capabilities"]').forEach((btn) => {
        btn.setAttribute('aria-expanded', 'false');
        btn.hidden = false;
    });
});

document.getElementById('cart-items').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="remove"]');
    if (!btn) return;
    updateItemCart(btn.dataset.eq, -Number(btn.dataset.qty));
});

activeFiltersRoot?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-filter-clear]');
    if (!button) return;
    const key = button.dataset.filterClear;
    if (key === 'dates') {
        selectedStartDate = null;
        selectedEndDate = null;
        if (startDateInput) startDateInput.value = '';
        if (endDateInput) endDateInput.value = '';
        availabilityMap = {};
        syncBorrowDateSelectionUI();
    } else if (key === 'age') {
        currentAgeFilter = 'all';
        ageFilters.forEach((btn) => btn.classList.toggle('active', btn.dataset.val === 'all'));
    } else if (key === 'search') {
        currentSearchTerm = '';
        if (searchInput) searchInput.value = '';
    } else if (key === 'all') {
        selectedStartDate = null;
        selectedEndDate = null;
        currentAgeFilter = 'all';
        currentSearchTerm = '';
        availabilityMap = {};
        if (startDateInput) startDateInput.value = '';
        if (endDateInput) endDateInput.value = '';
        if (searchInput) searchInput.value = '';
        ageFilters.forEach((btn) => btn.classList.toggle('active', btn.dataset.val === 'all'));
        syncBorrowDateSelectionUI();
    }
    syncMobileFilterSheet();
    catalogPage = 1;
    renderCatalog();
    updateFlowStateUI();
});

document.getElementById('cart-icon-btn').addEventListener('click', openCartDrawer);

document.getElementById('cart-close').addEventListener('click', closeCart);
document.getElementById('cart-drawer-overlay').addEventListener('click', closeCart);

function closeCart() {
    closeDrawer(document.getElementById('cart-drawer'), document.getElementById('cart-drawer-overlay'));
}

detailCloseButton?.addEventListener('click', closeEquipmentDetail);
detailOverlay?.addEventListener('click', closeEquipmentDetail);

document.getElementById('btn-submit-request').addEventListener('click', async () => {
    if (!currentUser) {
        showFeedback('กรุณาเข้าสู่ระบบก่อนยืนยันคำขอ', 'error');
        return;
    }

    if (!selectedStartDate || !selectedEndDate || !ensureValidDateRange(selectedStartDate, selectedEndDate)) {
        return;
    }

    const formData = validateCheckoutFormV2();
    if (!formData) return;
    saveBorrowerProfile({
        borrowerName: formData.borrowerName,
        position: formData.position,
        department: formData.department,
        phone: formData.phone
    });
    setBorrowerProfileLocked(true);

    const unmapped = cart.filter((c) => !c.submit_equipment_id);
    if (unmapped.length > 0) {
        const names = unmapped.map((c) => c.name).join(', ');
        showFeedback(`รายการต่อไปนี้ยังไม่ผูกกับระบบยืมจริง: ${names}`, 'error');
        return;
    }

    const btn = document.getElementById('btn-submit-request');
    const errDiv = document.getElementById('checkout-error');
    btn.disabled = true;
    btn.textContent = 'กำลังส่งคำขอ...';
    errDiv.style.display = 'none';

    const payload = {
        p_borrower_id: currentUser.id,
        p_borrower_name: formData.borrowerName,
        p_borrower_email: currentUser.email,
        p_purpose: buildBorrowPurposeSummary(formData),
        p_start_date: selectedStartDate,
        p_end_date: selectedEndDate,
        p_items: cart.map((c) => ({ equipment_id: c.submit_equipment_id, qty: c.qty }))
    };

    if (TEST_MODE) {
        const existingRows = readTestRequests();
        const trackingId = createTestTrackingId(existingRows);
        const createdAt = new Date().toISOString();
        const testRow = {
            id: `ts-req-${trackingId.toLowerCase()}`,
            tracking_id: trackingId,
            created_at: createdAt,
            purpose: payload.p_purpose,
            status: 'pending',
            borrower_id: payload.p_borrower_id,
            borrower_email: payload.p_borrower_email,
            borrower_name: formData.borrowerName,
            borrow_request_items: cart.map((c) => ({
                id: `ts-item-${c.equipment_id}`,
                equipment_id: c.equipment_id,
                equipment_name: c.name,
                qty_borrowed: c.qty,
                start_date: selectedStartDate,
                end_date: selectedEndDate
            }))
        };
        writeTestRequests([testRow, ...existingRows].slice(0, 50));
        showFeedback(`ส่งคำขอสำเร็จ Tracking ID: ${trackingId}`, 'success');
        cart = [];
        updateCartUI();
        closeCart();
        window.location.href = `success.html?tid=${encodeURIComponent(trackingId)}`;
        return;
    }

    const { data: trackingId, error } = await supabase.rpc('submit_borrow_request', payload);

    if (error) {
        errDiv.textContent = `ส่งคำขอไม่สำเร็จ: ${error.message}`;
        errDiv.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'ยืนยันการจอง';
        return;
    }

    showFeedback(`ส่งคำขอสำเร็จ Tracking ID: ${trackingId}`, 'success');
    cart = [];
    updateCartUI();
    closeCart();
    window.location.href = `success.html?tid=${encodeURIComponent(trackingId)}`;
});

document.getElementById('cart-icon-btn').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        document.getElementById('cart-icon-btn').click();
    }
});

document.getElementById('borrow-confirm-close')?.addEventListener('click', () => {
    closeOverlay(borrowConfirmModal);
    if (confirmResolve) { confirmResolve(false); confirmResolve = null; }
});
borrowConfirmCancelBtn?.addEventListener('click', () => {
    closeOverlay(borrowConfirmModal);
    if (confirmResolve) { confirmResolve(false); confirmResolve = null; }
});
borrowConfirmOkBtn?.addEventListener('click', () => {
    closeOverlay(borrowConfirmModal);
    if (confirmResolve) { confirmResolve(true); confirmResolve = null; }
});
borrowConfirmModal?.addEventListener('click', (event) => {
    if (event.target === borrowConfirmModal) {
        closeOverlay(borrowConfirmModal);
        if (confirmResolve) { confirmResolve(false); confirmResolve = null; }
    }
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && dateRangePopover && !dateRangePopover.hidden) {
        closeDateRangePicker({ restoreFocus: true });
        return;
    }
    if (!activeDialog) return;
    if (event.key === 'Escape') {
        if (activeDialog.overlay === borrowConfirmModal && confirmResolve) {
            confirmResolve(false);
            confirmResolve = null;
        }
        if (activeDialog.panel?.id === 'cart-drawer') {
            closeCart();
        } else if (activeDialog.panel?.id === 'quick-detail-drawer') {
            closeEquipmentDetail();
        } else {
            closeOverlay(activeDialog.overlay);
        }
        return;
    }
    trapTabKey(event, activeDialog.panel);
});

init();
