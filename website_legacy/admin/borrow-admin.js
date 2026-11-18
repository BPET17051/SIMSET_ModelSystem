/* ===== SIMSET Admin Panel - borrow-admin.js ===== */

let borrowRequests = [];
let currentReturnRequest = null;
let borrowPage = 1;
let currentRejectTargets = [];
let currentRejectMode = 'single';
const selectedBorrowRequestIds = new Set();
const BORROW_PAGE_SIZE = 10;
const BORROW_FILTER_PRESETS_KEY = 'simset_borrow_filter_presets_v1';
const BORROW_FILTER_PRESET_DEFAULT = '';
const BORROW_FILTER_DEFAULT_KEY_PREFIX = 'simset_borrow_filter_default_v1';
const BORROW_COLUMNS_KEY = 'simset_borrow_columns_v1';
const borrowColumnLabels = {
    tracking: 'Tracking ID',
    borrower: 'ผู้ยืม',
    purpose: 'โครงการ',
    pickup: 'วันที่เบิก',
    status: 'สถานะ',
    actions: 'จัดการ'
};
const BORROW_STATUS_ORDER = {
    pending: 0,
    approved: 1,
    returned_pending_inspection: 2,
    returned: 3,
    rejected: 4,
    cancelled: 5
};
const borrowQueryState = {
    search: '',
    status: '',
    sort: 'newest',
    selectedPreset: BORROW_FILTER_PRESET_DEFAULT
};
const defaultBorrowColumns = {
    tracking: true,
    borrower: true,
    purpose: true,
    pickup: true,
    status: true,
    actions: true
};
const defaultBorrowColumnOrder = ['tracking', 'borrower', 'purpose', 'pickup', 'status', 'actions'];
const defaultBorrowFrozenColumns = ['tracking'];
let borrowColumnVisibility = { ...defaultBorrowColumns };
let borrowColumnOrder = [...defaultBorrowColumnOrder];
let borrowFrozenColumns = [...defaultBorrowFrozenColumns];
const BORROW_ADMIN_TEST_MODE = (typeof TEST_MODE !== 'undefined')
    ? TEST_MODE
    : (new URLSearchParams(window.location.search).get('test_mode') === '1' || window.localStorage.getItem('simset_test_mode') === '1' || navigator.webdriver);
const TEST_REQUESTS_KEY = 'simset_test_requests';
const TEST_BORROWER_EMAIL = 'example@gmail.com';
let borrowSelectionWarningMessage = '';

const REJECT_REASON_PRESETS = {
    'อุปกรณ์ที่คุณต้องการไม่มีคิวว่างในช่วงเวลาดังกล่าว': 'คำขอนี้ยังไม่สามารถอนุมัติได้ เนื่องจากอุปกรณ์ที่ต้องการไม่มีคิวว่างในช่วงวันที่ระบุ',
    'ข้อมูลโครงการ / วัตถุประสงค์การยืมไม่ชัดเจน': 'คำขอนี้ยังไม่สามารถอนุมัติได้ เนื่องจากข้อมูลโครงการหรือวัตถุประสงค์การใช้งานยังไม่ชัดเจน',
    'อุปกรณ์ชำรุด หรืออยู่ระหว่างการซ่อมบำรุง': 'คำขอนี้ยังไม่สามารถอนุมัติได้ เนื่องจากอุปกรณ์อยู่ระหว่างซ่อมบำรุงหรือไม่พร้อมใช้งาน',
    'ผู้ยืมมีประวัติค้างส่งคืนอุปกรณ์ หรือชำรุด': 'คำขอนี้ยังไม่สามารถอนุมัติได้ เนื่องจากมีประวัติคำขอเดิมที่ต้องตรวจสอบเพิ่มเติม',
    other: 'เจ้าหน้าที่จะระบุข้อความสำหรับผู้ยืมเพิ่มเติมเอง'
};

function readBorrowColumnVisibility() {
    try {
        const stored = JSON.parse(window.localStorage.getItem(BORROW_COLUMNS_KEY) || '{}');
        const visibility = stored?.visibility && typeof stored.visibility === 'object'
            ? stored.visibility
            : (stored && typeof stored === 'object' ? stored : {});
        return { ...defaultBorrowColumns, ...visibility };
    } catch {
        return { ...defaultBorrowColumns };
    }
}

function readBorrowColumnOrder() {
    try {
        const stored = JSON.parse(window.localStorage.getItem(BORROW_COLUMNS_KEY) || '{}');
        const order = Array.isArray(stored?.order) ? stored.order : defaultBorrowColumnOrder;
        const next = order.filter((key) => defaultBorrowColumnOrder.includes(key));
        defaultBorrowColumnOrder.forEach((key) => {
            if (!next.includes(key)) next.push(key);
        });
        return next;
    } catch {
        return [...defaultBorrowColumnOrder];
    }
}

function readBorrowFrozenColumns() {
    try {
        const stored = JSON.parse(window.localStorage.getItem(BORROW_COLUMNS_KEY) || '{}');
        const frozen = Array.isArray(stored?.frozen) ? stored.frozen : defaultBorrowFrozenColumns;
        return frozen.filter((key) => defaultBorrowColumnOrder.includes(key));
    } catch {
        return [...defaultBorrowFrozenColumns];
    }
}

function writeBorrowColumnLayout() {
    window.localStorage.setItem(BORROW_COLUMNS_KEY, JSON.stringify({
        visibility: borrowColumnVisibility,
        order: borrowColumnOrder,
        frozen: borrowFrozenColumns
    }));
}

function readBorrowFilterPresets() {
    try {
        const stored = JSON.parse(window.localStorage.getItem(BORROW_FILTER_PRESETS_KEY) || '[]');
        return Array.isArray(stored) ? stored : [];
    } catch {
        return [];
    }
}

function writeBorrowFilterPresets(presets) {
    window.localStorage.setItem(BORROW_FILTER_PRESETS_KEY, JSON.stringify(presets));
}

function getBorrowPreferenceKey(prefix) {
    const email = String(currentUser?.email || TEST_BORROWER_EMAIL || 'anonymous').trim().toLowerCase();
    return `${prefix}:${email}`;
}

function readBorrowDefaultPreset() {
    return window.localStorage.getItem(getBorrowPreferenceKey(BORROW_FILTER_DEFAULT_KEY_PREFIX)) || BORROW_FILTER_PRESET_DEFAULT;
}

function writeBorrowDefaultPreset(name) {
    const key = getBorrowPreferenceKey(BORROW_FILTER_DEFAULT_KEY_PREFIX);
    if (!name) {
        window.localStorage.removeItem(key);
        return;
    }
    window.localStorage.setItem(key, name);
}

function refreshBorrowPresetOptions() {
    const select = document.getElementById('borrow-saved-filters');
    if (!select) return;

    const presets = readBorrowFilterPresets();
    select.innerHTML = `
        <option value="${BORROW_FILTER_PRESET_DEFAULT}">มุมมองปัจจุบัน</option>
        ${presets.map((preset) => `<option value="${esc(preset.name)}">${esc(preset.name)}</option>`).join('')}
    `;
    select.value = presets.some((preset) => preset.name === borrowQueryState.selectedPreset)
        ? borrowQueryState.selectedPreset
        : BORROW_FILTER_PRESET_DEFAULT;
}

function getVisibleBorrowColumns() {
    return borrowColumnOrder.filter((key) => borrowColumnVisibility[key] !== false);
}

function renderBorrowColumnsList() {
    const root = document.getElementById('borrow-columns-list');
    if (!root) return;

    root.innerHTML = borrowColumnOrder.map((key, index) => `
        <div class="borrow-column-row" data-borrow-column-row="${key}" draggable="true">
            <div class="borrow-column-row-main">
                <span class="borrow-column-grip" aria-hidden="true">::</span>
                <label class="caps-checkbox-item compact">
                    <input type="checkbox" data-borrow-column-option="${key}" ${borrowColumnVisibility[key] !== false ? 'checked' : ''} />
                    <span>${esc(borrowColumnLabels[key])}</span>
                </label>
            </div>
            <div class="borrow-column-row-actions">
                <label class="mini-check">
                    <input type="checkbox" data-borrow-column-freeze="${key}" ${borrowFrozenColumns.includes(key) ? 'checked' : ''} />
                    <span>ตรึงซ้าย</span>
                </label>
                <button type="button" class="btn btn-ghost btn-xs" data-borrow-column-move="up" data-borrow-column-key="${key}" ${index === 0 ? 'disabled' : ''}>ขึ้น</button>
                <button type="button" class="btn btn-ghost btn-xs" data-borrow-column-move="down" data-borrow-column-key="${key}" ${index === borrowColumnOrder.length - 1 ? 'disabled' : ''}>ลง</button>
            </div>
        </div>
    `).join('');
}

function openBorrowColumnsModal() {
    renderBorrowColumnsList();
    openModal('borrow-columns-modal');
}

function moveBorrowColumn(columnKey, direction) {
    syncBorrowColumnLayoutFromModal();
    const currentIndex = borrowColumnOrder.indexOf(columnKey);
    if (currentIndex === -1) return;
    const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (nextIndex < 0 || nextIndex >= borrowColumnOrder.length) return;
    const nextOrder = [...borrowColumnOrder];
    nextOrder.splice(currentIndex, 1);
    nextOrder.splice(nextIndex, 0, columnKey);
    borrowColumnOrder = nextOrder;
    renderBorrowColumnsList();
}

function syncBorrowColumnLayoutFromModal() {
    borrowColumnOrder = [...document.querySelectorAll('[data-borrow-column-row]')].map((row) => row.dataset.borrowColumnRow);
    borrowColumnVisibility = borrowColumnOrder.reduce((next, key) => {
        const input = document.querySelector(`[data-borrow-column-option="${key}"]`);
        next[key] = input ? input.checked : true;
        return next;
    }, {});
    borrowFrozenColumns = borrowColumnOrder.filter((key) => {
        const input = document.querySelector(`[data-borrow-column-freeze="${key}"]`);
        return input?.checked;
    });
}

function renderBorrowTableHead() {
    const thead = document.getElementById('borrow-thead');
    if (!thead) return;
    const visibleColumns = getVisibleBorrowColumns();
    thead.innerHTML = `
        <tr>
            <th class="checkbox-col is-frozen-col borrow-checkbox-sticky"><input type="checkbox" id="borrow-select-all" aria-label="เลือกคำขอทั้งหมดในหน้านี้" /></th>
            ${visibleColumns.map((key) => `
                <th data-borrow-col="${key}" class="${borrowFrozenColumns.includes(key) ? 'is-frozen-col' : ''}">
                    ${esc(borrowColumnLabels[key])}
                </th>
            `).join('')}
        </tr>
    `;
}

function applyBorrowColumnLayoutStyles() {
    const headerCheckbox = document.querySelector('#borrow-thead .checkbox-col');
    const checkboxCells = [...document.querySelectorAll('.checkbox-col')];
    if (headerCheckbox) {
        const stickyLeft = 0;
        checkboxCells.forEach((cell) => {
            cell.classList.add('is-frozen-col', 'borrow-checkbox-sticky');
            cell.style.left = `${stickyLeft}px`;
        });
    }

    let offset = headerCheckbox ? headerCheckbox.getBoundingClientRect().width : 0;
    getVisibleBorrowColumns().forEach((key) => {
        const headerCell = document.querySelector(`#borrow-thead [data-borrow-col="${key}"]`);
        const cells = [...document.querySelectorAll(`[data-borrow-col="${key}"]`)];
        if (!headerCell) return;

        if (borrowFrozenColumns.includes(key)) {
            [headerCell, ...cells].forEach((cell) => {
                cell.classList.add('is-frozen-col');
                cell.style.left = `${offset}px`;
            });
            offset += headerCell.getBoundingClientRect().width;
            return;
        }

        [headerCell, ...cells].forEach((cell) => {
            cell.classList.remove('is-frozen-col');
            cell.style.left = '';
        });
    });
}

function setRejectModalMode(mode, targets) {
    currentRejectMode = mode;
    currentRejectTargets = [...targets];

    const title = document.querySelector('#reject-modal .modal-title');
    const desc = document.querySelector('#reject-modal .modal-desc');
    const saveBtn = document.getElementById('reject-save');
    const previewTitle = document.querySelector('#reject-preview-panel .helper-title');

    if (title) {
        title.textContent = mode === 'bulk'
            ? `ระบุเหตุผลการไม่อนุมัติแบบกลุ่ม (${targets.length} รายการ)`
            : 'ระบุเหตุผลการไม่อนุมัติ';
    }
    if (desc) {
        desc.textContent = mode === 'bulk'
            ? 'เหตุผลนี้จะถูกใช้กับคำขอที่เลือกทั้งหมด'
            : 'ข้อมูลนี้จะถูกส่งแจ้งเตือนไปยังผู้ยืม';
    }
    if (saveBtn) {
        saveBtn.textContent = mode === 'bulk'
            ? `ปฏิเสธ ${targets.length} รายการ`
            : 'ยืนยันการปฏิเสธ';
    }
    if (previewTitle) {
        previewTitle.textContent = mode === 'bulk'
            ? 'ตัวอย่างข้อความที่จะส่งให้ผู้ยืมทุกคำขอ'
            : 'ตัวอย่างข้อความที่จะส่งให้ผู้ยืม';
    }
}

function openRejectModalForTargets(mode, targets) {
    if (!targets.length) return;
    setRejectModalMode(mode, targets);
    document.getElementById('reject-req-id').value = targets[0] || '';
    document.getElementById('reject-reason-select').value = 'อุปกรณ์ที่คุณต้องการไม่มีคิวว่างในช่วงเวลาดังกล่าว';
    document.getElementById('reject-reason-text-group').style.display = 'none';
    document.getElementById('reject-reason-text').value = '';
    updateRejectPreview();
    openModal('reject-modal');
}

function resetBorrowSelection() {
    selectedBorrowRequestIds.clear();
    borrowSelectionWarningMessage = '';
    syncBorrowSelectAll();
    updateBorrowBulkBar();
}

function renderBorrowPagination(total) {
    buildPagination('borrow-pagination', total, borrowPage, (page) => {
        borrowPage = page;
        renderBorrowTable();
    }, BORROW_PAGE_SIZE);
}

function saveCurrentBorrowPreset() {
    const rawName = window.prompt('ตั้งชื่อ preset สำหรับ Borrow Requests');
    const name = (rawName || '').trim();
    if (!name) return;

    const presets = readBorrowFilterPresets().filter((preset) => preset.name !== name);
    presets.push({
        name,
        query: {
            search: borrowQueryState.search,
            status: borrowQueryState.status,
            sort: borrowQueryState.sort
        },
        columns: {
            visibility: { ...borrowColumnVisibility },
            order: [...borrowColumnOrder],
            frozen: [...borrowFrozenColumns]
        }
    });
    presets.sort((a, b) => a.name.localeCompare(b.name, 'th'));
    writeBorrowFilterPresets(presets);
    borrowQueryState.selectedPreset = name;
    refreshBorrowPresetOptions();
    showToast(`บันทึก preset "${name}" แล้ว`, 'success');
}

function deleteCurrentBorrowPreset() {
    const name = borrowQueryState.selectedPreset;
    if (!name) {
        showToast('ยังไม่ได้เลือก preset ที่จะลบ', 'error');
        return;
    }

    const nextPresets = readBorrowFilterPresets().filter((preset) => preset.name !== name);
    writeBorrowFilterPresets(nextPresets);
    if (readBorrowDefaultPreset() === name) {
        writeBorrowDefaultPreset('');
    }
    borrowQueryState.selectedPreset = BORROW_FILTER_PRESET_DEFAULT;
    refreshBorrowPresetOptions();
    showToast(`ลบ preset "${name}" แล้ว`, 'success');
}

function applyBorrowPreset(name) {
    const preset = readBorrowFilterPresets().find((entry) => entry.name === name);
    if (!preset) {
        borrowQueryState.selectedPreset = BORROW_FILTER_PRESET_DEFAULT;
        refreshBorrowPresetOptions();
        return;
    }

    borrowQueryState.search = preset.query?.search || '';
    borrowQueryState.status = preset.query?.status || '';
    borrowQueryState.sort = preset.query?.sort || 'newest';
    borrowQueryState.selectedPreset = preset.name;
    const presetColumns = preset.columns || {};
    borrowColumnVisibility = { ...defaultBorrowColumns, ...(presetColumns.visibility || presetColumns) };
    borrowColumnOrder = Array.isArray(presetColumns.order)
        ? [...presetColumns.order.filter((key) => defaultBorrowColumnOrder.includes(key))]
        : [...defaultBorrowColumnOrder];
    defaultBorrowColumnOrder.forEach((key) => {
        if (!borrowColumnOrder.includes(key)) borrowColumnOrder.push(key);
    });
    borrowFrozenColumns = Array.isArray(presetColumns.frozen)
        ? presetColumns.frozen.filter((key) => borrowColumnOrder.includes(key))
        : [...defaultBorrowFrozenColumns];
    writeBorrowColumnLayout();
    borrowPage = 1;
    renderBorrowTable();
    refreshBorrowPresetOptions();
}

function saveBorrowDefaultPreset() {
    const name = borrowQueryState.selectedPreset;
    if (!name) {
        showToast('เลือก preset ก่อนตั้งเป็นค่าเริ่มต้น', 'error');
        return;
    }
    writeBorrowDefaultPreset(name);
    showToast(`ตั้ง "${name}" เป็นค่าเริ่มต้นแล้ว`, 'success');
}

function clearBorrowDefaultPreset() {
    if (!readBorrowDefaultPreset()) {
        showToast('ยังไม่มี preset เริ่มต้นที่ต้องล้าง', 'error');
        return;
    }
    writeBorrowDefaultPreset('');
    showToast('ล้าง preset เริ่มต้นแล้ว', 'success');
}

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

function toAdminItems(items = [], requestId = 'test-request') {
    return items.map((item, index) => ({
        id: item.id || `${requestId}-item-${index + 1}`,
        equipment_id: item.equipment_id || `eq-${index + 1}`,
        start_date: item.start_date || null,
        end_date: item.end_date || null,
        qty_borrowed: Number(item.qty_borrowed || 0),
        qty_returned_ok: Number(item.qty_returned_ok || 0),
        qty_returned_damaged: Number(item.qty_returned_damaged || 0),
        qty_returned_maintenance: Number(item.qty_returned_maintenance || 0),
        equipments: {
            name_th: item.equipment_name || item.equipments?.name_th || 'Unknown equipment',
            name_en: item.equipment_name || item.equipments?.name_en || 'Unknown equipment'
        }
    }));
}

function toAdminRows(rows = []) {
    return rows.map((row, index) => ({
        ...row,
        id: row.id || `ts-req-${String(index + 1).padStart(4, '0')}`,
        borrow_request_items: toAdminItems(row.borrow_request_items, row.id || `ts-req-${String(index + 1).padStart(4, '0')}`)
    }));
}

function formatShortDate(dateValue) {
    if (!dateValue) return '-';
    return new Date(dateValue).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getRequestDateSummary(request) {
    const items = request.borrow_request_items || [];
    if (!items.length) {
        return { start: '-', end: '-', count: 0 };
    }

    const starts = items.map((item) => item.start_date).filter(Boolean).sort();
    const ends = items.map((item) => item.end_date).filter(Boolean).sort();

    return {
        start: starts[0] || null,
        end: ends[ends.length - 1] || null,
        count: items.reduce((sum, item) => sum + (Number(item.qty_borrowed) || 0), 0)
    };
}

function getBorrowRiskFlag(request) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const items = request.borrow_request_items || [];
    if (!items.length) return null;

    const earliestStart = items
        .map((item) => item.start_date)
        .filter(Boolean)
        .sort()[0];

    if (!earliestStart) return null;

    const startDate = new Date(`${earliestStart}T00:00:00`);
    const diffDays = Math.floor((startDate.getTime() - todayStart.getTime()) / 86400000);

    if (request.status === 'approved' && diffDays < 0) {
        return { tone: 'danger', label: 'เลยวันรับของ' };
    }

    if (request.status === 'approved' && diffDays <= 2) {
        return { tone: 'warn', label: 'ใกล้เริ่มใช้' };
    }

    return null;
}

function getBorrowPickupTimestamp(request) {
    const start = getRequestDateSummary(request).start;
    return start ? new Date(`${start}T00:00:00`).getTime() : Number.MAX_SAFE_INTEGER;
}

function getBorrowStatusLabel(status) {
    return ({
        pending: 'รออนุมัติ',
        approved: 'อนุมัติแล้ว',
        returned_pending_inspection: 'รับคืนแล้ว รอตรวจเช็ค',
        returned: 'คืนสมบูรณ์',
        rejected: 'ปฏิเสธแล้ว',
        cancelled: 'ยกเลิก'
    })[status] || status || 'ไม่ระบุสถานะ';
}

function getFilteredBorrowRequests() {
    const search = borrowQueryState.search.trim().toLowerCase();
    const statusFilter = borrowQueryState.status;
    const sortMode = borrowQueryState.sort;

    const filtered = borrowRequests.filter((request) => {
        const textMatch =
            !search ||
            (request.tracking_id || '').toLowerCase().includes(search) ||
            (request.borrower_name || '').toLowerCase().includes(search) ||
            (request.borrower_email || '').toLowerCase().includes(search) ||
            (request.purpose || '').toLowerCase().includes(search);
        const statusMatch = statusFilter ? request.status === statusFilter : true;
        return textMatch && statusMatch;
    });

    filtered.sort((a, b) => {
        if (sortMode === 'oldest') {
            return new Date(a.created_at) - new Date(b.created_at);
        }
        if (sortMode === 'pickup-soon') {
            return getBorrowPickupTimestamp(a) - getBorrowPickupTimestamp(b);
        }
        if (sortMode === 'status') {
            const statusCompare = (BORROW_STATUS_ORDER[a.status] ?? 999) - (BORROW_STATUS_ORDER[b.status] ?? 999);
            if (statusCompare !== 0) return statusCompare;
        }
        return new Date(b.created_at) - new Date(a.created_at);
    });

    return filtered;
}

function pruneBorrowSelection() {
    const allowedIds = new Set(
        getFilteredBorrowRequests()
            .filter((request) => request.status === 'pending')
            .map((request) => request.id)
    );
    const removedIds = [...selectedBorrowRequestIds].filter((id) => !allowedIds.has(id));
    if (removedIds.length === 0) return;
    removedIds.forEach((id) => selectedBorrowRequestIds.delete(id));
    borrowSelectionWarningMessage = removedIds.length === 1
        ? 'มี 1 รายการที่หลุดจากผลลัพธ์หลังเปลี่ยนตัวกรองหรือการเรียงลำดับ ระบบจึงล้าง selection ของรายการนั้นออก'
        : `มี ${removedIds.length} รายการที่หลุดจากผลลัพธ์หลังเปลี่ยนตัวกรองหรือการเรียงลำดับ ระบบจึงล้าง selection ของรายการเหล่านั้นออก`;
}

function getSelectableBorrowRequests() {
    return getFilteredBorrowRequests().filter((request) => request.status === 'pending');
}

function getCurrentPageSelectableIds() {
    return [...document.querySelectorAll('.borrow-cb:not(:disabled)')].map((input) => input.dataset.id);
}

function syncBorrowSelectAll() {
    const selectAll = document.getElementById('borrow-select-all');
    if (!selectAll) return;

    const checkboxes = [...document.querySelectorAll('.borrow-cb:not(:disabled)')];
    const checked = checkboxes.filter((input) => input.checked);
    selectAll.checked = checkboxes.length > 0 && checked.length === checkboxes.length;
    selectAll.indeterminate = checked.length > 0 && checked.length < checkboxes.length;
    selectAll.disabled = checkboxes.length === 0;
}

function hideBorrowBulkBar() {
    const bar = document.getElementById('borrow-bulk-action-bar');
    if (!bar) return;
    bar.classList.remove('visible');
    setTimeout(() => bar.classList.add('hidden'), 300);
}

function updateBorrowBulkBar() {
    const bar = document.getElementById('borrow-bulk-action-bar');
    const countEl = document.getElementById('borrow-bulk-count');
    const metaEl = document.getElementById('borrow-bulk-meta');
    const scopeBadge = document.getElementById('borrow-bulk-scope-badge');
    const approveBtn = document.getElementById('btn-borrow-bulk-approve');
    const rejectBtn = document.getElementById('btn-borrow-bulk-reject');
    const selectAllResultsBtn = document.getElementById('btn-borrow-select-all-results');
    if (!bar || !countEl || !metaEl || !scopeBadge || !approveBtn || !rejectBtn || !selectAllResultsBtn) return;

    const count = selectedBorrowRequestIds.size;
    const totalSelectable = getSelectableBorrowRequests().length;
    const currentPageSelectableIds = getCurrentPageSelectableIds();
    const currentPageSelectedCount = currentPageSelectableIds.filter((id) => selectedBorrowRequestIds.has(id)).length;
    const allCurrentPageSelected = currentPageSelectableIds.length > 0 && currentPageSelectedCount === currentPageSelectableIds.length;
    const allResultsSelected = totalSelectable > 0 && count === totalSelectable;
    countEl.textContent = String(count);
    approveBtn.disabled = count === 0;
    rejectBtn.disabled = count === 0;

    if (count === 0) {
        hideBorrowBulkBar();
        selectAllResultsBtn.hidden = true;
        metaEl.textContent = 'ยังไม่ได้เลือกผลลัพธ์ทั้งหมด';
        scopeBadge.hidden = true;
        scopeBadge.className = 'selection-scope-badge';
        return;
    }

    if (allResultsSelected) {
        scopeBadge.hidden = false;
        scopeBadge.className = 'selection-scope-badge is-results';
        scopeBadge.textContent = 'เลือกทั้งผลลัพธ์';
        metaEl.textContent = `กำลังเลือกครบทั้งผลลัพธ์ ${totalSelectable} รายการในเงื่อนไขปัจจุบัน`;
        selectAllResultsBtn.hidden = true;
    } else if (allCurrentPageSelected && totalSelectable > count) {
        scopeBadge.hidden = false;
        scopeBadge.className = 'selection-scope-badge is-page';
        scopeBadge.textContent = 'เลือกทั้งหน้า';
        metaEl.textContent = `เลือกแล้ว ${count} รายการในหน้านี้ จากผลลัพธ์ที่เลือกได้ทั้งหมด ${totalSelectable} รายการ`;
        selectAllResultsBtn.hidden = false;
        selectAllResultsBtn.textContent = `เลือกผลลัพธ์ทั้งหมด ${totalSelectable} รายการ`;
    } else {
        scopeBadge.hidden = false;
        scopeBadge.className = 'selection-scope-badge is-partial';
        scopeBadge.textContent = 'เลือกบางรายการ';
        metaEl.textContent = `กำลังเลือกบางรายการจากผลลัพธ์ที่เลือกได้ทั้งหมด ${totalSelectable} รายการ`;
        selectAllResultsBtn.hidden = true;
    }

    if (bar.classList.contains('hidden')) {
        bar.classList.remove('hidden');
        requestAnimationFrame(() => requestAnimationFrame(() => bar.classList.add('visible')));
        return;
    }
    bar.classList.add('visible');
}

function renderBorrowSelectionWarning() {
    const banner = document.getElementById('borrow-selection-warning');
    if (!banner) return;
    if (!borrowSelectionWarningMessage) {
        banner.style.display = 'none';
        banner.textContent = '';
        return;
    }
    banner.style.display = 'block';
    banner.textContent = borrowSelectionWarningMessage;
}

function renderBorrowFilterChips(filteredCount) {
    const root = document.getElementById('borrow-active-filters');
    const total = borrowRequests.length;
    if (!root) return;

    const chips = [];
    if (borrowQueryState.search) {
        chips.push(`
            <button type="button" class="filter-chip is-active" data-chip-clear="search">
                ค้นหา: ${esc(borrowQueryState.search)}
                <span aria-hidden="true">x</span>
            </button>
        `);
    }
    if (borrowQueryState.status) {
        chips.push(`
            <button type="button" class="filter-chip is-active" data-chip-clear="status">
                สถานะ: ${esc(getBorrowStatusLabel(borrowQueryState.status))}
                <span aria-hidden="true">x</span>
            </button>
        `);
    }
    if (borrowQueryState.sort && borrowQueryState.sort !== 'newest') {
        const sortLabel = ({
            oldest: 'เก่าสุดก่อน',
            'pickup-soon': 'วันเบิกใกล้สุด',
            status: 'สถานะ'
        })[borrowQueryState.sort] || 'ล่าสุดก่อน';
        chips.push(`
            <button type="button" class="filter-chip is-passive" data-chip-clear="sort">
                เรียง: ${esc(sortLabel)}
                <span aria-hidden="true">x</span>
            </button>
        `);
    }

    if (!chips.length) {
        root.innerHTML = `
            <div class="active-filter-meta">
                <strong>${filteredCount}</strong> จาก <strong>${total}</strong> รายการ
            </div>
        `;
        return;
    }

    root.innerHTML = `
        <div class="active-filter-meta">
            <strong>${filteredCount}</strong> จาก <strong>${total}</strong> รายการ
        </div>
        <div class="active-filter-chips">
            ${chips.join('')}
            <button type="button" class="filter-chip filter-chip-clear" data-chip-clear="all">ล้างตัวกรองทั้งหมด</button>
        </div>
    `;
}

function updateBorrowResultsSummary(filtered) {
    const summary = document.getElementById('borrow-results-summary');
    if (!summary) return;

    const total = borrowRequests.length;
    const pending = filtered.filter((row) => row.status === 'pending').length;
    const approved = filtered.filter((row) => row.status === 'approved').length;

    summary.textContent = filtered.length === total
        ? `แสดง ${total} รายการ พร้อมตรวจคิวรออนุมัติ ${pending} รายการ`
        : `ตรงเงื่อนไข ${filtered.length} จาก ${total} รายการ · รออนุมัติ ${pending} · อนุมัติแล้ว ${approved}`;
}

function renderBorrowEmptyState(hasAnyData) {
    if (!hasAnyData) {
        return `
            <tr>
                <td colspan="7" class="borrow-empty-cell">
                    <div class="borrow-empty-state">
                        <div class="borrow-empty-icon">ไม่มีรายการ</div>
                        <h3>ยังไม่มีคำขอยืมเข้ามาในระบบ</h3>
                        <p>ตอนมีคำขอใหม่ หน้านี้จะแสดงคิวรออนุมัติและรายการที่ต้องตรวจรับคืนทันที</p>
                    </div>
                </td>
            </tr>
        `;
    }

    return `
        <tr>
            <td colspan="7" class="borrow-empty-cell">
                <div class="borrow-empty-state">
                    <div class="borrow-empty-icon">ไม่พบผลลัพธ์</div>
                    <h3>ไม่พบคำขอที่ตรงกับตัวกรองปัจจุบัน</h3>
                    <p>ลองล้างคำค้นหา เปลี่ยนสถานะ หรือกลับไปดูรายการทั้งหมดเพื่อไม่ให้พลาดคิวงาน</p>
                    <button type="button" class="btn btn-outline btn-sm" id="borrow-empty-clear">ล้างตัวกรองทั้งหมด</button>
                </div>
            </td>
        </tr>
    `;
}

function syncBorrowControls() {
    const searchInput = document.getElementById('borrow-search');
    const statusSelect = document.getElementById('borrow-status-filter');
    const sortSelect = document.getElementById('borrow-sort');
    const presetSelect = document.getElementById('borrow-saved-filters');

    if (searchInput && searchInput.value !== borrowQueryState.search) searchInput.value = borrowQueryState.search;
    if (statusSelect && statusSelect.value !== borrowQueryState.status) statusSelect.value = borrowQueryState.status;
    if (sortSelect && sortSelect.value !== borrowQueryState.sort) sortSelect.value = borrowQueryState.sort;
    if (presetSelect && presetSelect.value !== borrowQueryState.selectedPreset) presetSelect.value = borrowQueryState.selectedPreset;
}

function getReturnInputs() {
    return [...document.querySelectorAll('#return-items-tbody tr[data-item-id]')].map((row) => ({
        id: row.dataset.itemId,
        equipmentName: row.dataset.equipmentName,
        qtyBorrowed: Number(row.dataset.qtyBorrowed || 0),
        okInput: row.querySelector('[data-field="ok"]'),
        damagedInput: row.querySelector('[data-field="damaged"]'),
        maintenanceInput: row.querySelector('[data-field="maintenance"]')
    }));
}

function updateRejectPreview() {
    const preset = document.getElementById('reject-reason-select')?.value || '';
    const custom = document.getElementById('reject-reason-text')?.value.trim() || '';
    const preview = document.getElementById('reject-preview-text');
    if (!preview) return;

    if (preset === 'other') {
        preview.textContent = custom || REJECT_REASON_PRESETS.other;
        return;
    }

    preview.textContent = REJECT_REASON_PRESETS[preset] || preset || 'เจ้าหน้าที่จะใช้ข้อความนี้เป็นเหตุผลหลักในการไม่อนุมัติคำขอ';
}

function recalcReturnSummary() {
    const borrowedEl = document.getElementById('return-total-borrowed');
    const okEl = document.getElementById('return-total-ok');
    const damagedEl = document.getElementById('return-total-damaged');
    const maintenanceEl = document.getElementById('return-total-maintenance');
    const noteEl = document.getElementById('return-summary-note');
    const saveBtn = document.getElementById('return-save');

    if (!borrowedEl || !okEl || !damagedEl || !maintenanceEl || !noteEl || !saveBtn) return true;

    const rows = getReturnInputs();
    let borrowedTotal = 0;
    let okTotal = 0;
    let damagedTotal = 0;
    let maintenanceTotal = 0;
    let isValid = true;
    let hasException = false;

    rows.forEach((item) => {
        const ok = Number(item.okInput.value || 0);
        const damaged = Number(item.damagedInput.value || 0);
        const maintenance = Number(item.maintenanceInput.value || 0);
        const total = ok + damaged + maintenance;
        const rowValid = total === item.qtyBorrowed;

        borrowedTotal += item.qtyBorrowed;
        okTotal += ok;
        damagedTotal += damaged;
        maintenanceTotal += maintenance;
        hasException = hasException || damaged > 0 || maintenance > 0;

        [item.okInput, item.damagedInput, item.maintenanceInput].forEach((input) => {
            input.classList.toggle('invalid', !rowValid);
        });

        if (!rowValid) isValid = false;
    });

    borrowedEl.textContent = borrowedTotal;
    okEl.textContent = okTotal;
    damagedEl.textContent = damagedTotal;
    maintenanceEl.textContent = maintenanceTotal;

    if (!isValid) {
        noteEl.textContent = 'จำนวนในแต่ละแถวต้องรวมกันให้ครบตามจำนวนที่ยืมไปก่อนบันทึก';
        saveBtn.disabled = true;
        return false;
    }

    noteEl.textContent = hasException
        ? 'มีรายการชำรุดหรือส่งซ่อม ระบบจะบันทึกยอดคืนและเพิ่ม maintenance_quantity ของอุปกรณ์ที่เกี่ยวข้อง'
        : 'ทุกรายการถูกระบุเป็นรับคืนปกติทั้งหมด พร้อมบันทึกได้ทันที';
    saveBtn.disabled = false;
    return true;
}

function fillReturnRows(mode) {
    getReturnInputs().forEach((item) => {
        if (mode === 'maintenance') {
            item.okInput.value = 0;
            item.damagedInput.value = 0;
            item.maintenanceInput.value = item.qtyBorrowed;
        } else {
            item.okInput.value = item.qtyBorrowed;
            item.damagedInput.value = 0;
            item.maintenanceInput.value = 0;
        }
    });
    recalcReturnSummary();
}

function closeReturnModal() {
    currentReturnRequest = null;
    closeModal('return-modal');
}

window.loadBorrowRequests = async function () {
    document.getElementById('borrow-tbody').innerHTML = '<tr><td colspan="7" class="tbl-loading"><span class="spinner-sm"></span>โหลดข้อมูล...</td></tr>';

    if (BORROW_ADMIN_TEST_MODE) {
        borrowRequests = toAdminRows(ensureTestRequestsSeeded())
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        renderBorrowStats();
        renderBorrowTable();
        return;
    }

    const { data, error } = await sb
        .from('borrow_requests')
        .select(`
            *,
            borrow_request_items (
                id, equipment_id, start_date, end_date, qty_borrowed,
                qty_returned_ok, qty_returned_damaged, qty_returned_maintenance,
                equipments (name_th, name_en)
            )
        `)
        .order('created_at', { ascending: false });

    if (error) {
        showToast('โหลดข้อมูลคำร้องล้มเหลว', 'error');
        document.getElementById('borrow-tbody').innerHTML = `<tr><td colspan="7" style="text-align:center;color:red">Error: ${esc(error.message)}</td></tr>`;
        return;
    }

    borrowRequests = data || [];
    renderBorrowStats();
    renderBorrowTable();
};

function renderBorrowStats() {
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    const pendingCount = borrowRequests.filter((r) => r.status === 'pending').length;
    const receivingCount = borrowRequests.filter((r) => r.status === 'approved' || r.status === 'returned_pending_inspection').length;
    const prepCount = borrowRequests.filter((r) =>
        r.status === 'approved' &&
        (r.borrow_request_items || []).some((i) => String(i.start_date || '').split('T')[0] === tomorrow)
    ).length;
    const overdueCount = borrowRequests.filter((r) =>
        r.status === 'approved' &&
        (r.borrow_request_items || []).some((i) => String(i.start_date || '').split('T')[0] < today)
    ).length;

    const badge = document.getElementById('borrow-badge');
    if (pendingCount > 0) {
        badge.textContent = pendingCount;
        badge.style.display = 'inline-block';
    } else {
        badge.style.display = 'none';
    }

    document.getElementById('b-pending').textContent = pendingCount;
    document.getElementById('b-receiving').textContent = receivingCount;
    document.getElementById('b-preparing').textContent = prepCount;
    if (document.getElementById('b-overdue')) document.getElementById('b-overdue').textContent = overdueCount;
    if (document.getElementById('dash-b-pending')) document.getElementById('dash-b-pending').textContent = pendingCount;
    if (document.getElementById('dash-b-preparing')) document.getElementById('dash-b-preparing').textContent = prepCount;
    if (document.getElementById('dash-b-overdue-pickups')) document.getElementById('dash-b-overdue-pickups').textContent = overdueCount;
    setSync();
}

function renderBorrowTable() {
    const tbody = document.getElementById('borrow-tbody');
    syncBorrowControls();
    renderBorrowTableHead();
    const filtered = getFilteredBorrowRequests();
    pruneBorrowSelection();
    const totalPages = Math.max(1, Math.ceil(filtered.length / BORROW_PAGE_SIZE));
    if (borrowPage > totalPages) borrowPage = totalPages;
    if (borrowPage < 1) borrowPage = 1;
    const pageStart = (borrowPage - 1) * BORROW_PAGE_SIZE;
    const pageRows = filtered.slice(pageStart, pageStart + BORROW_PAGE_SIZE);

    updateBorrowResultsSummary(filtered);
    renderBorrowFilterChips(filtered.length);
    renderBorrowSelectionWarning();
    updateBorrowBulkBar();

    if (filtered.length === 0) {
        tbody.innerHTML = renderBorrowEmptyState(borrowRequests.length > 0);
        syncBorrowSelectAll();
        renderBorrowPagination(filtered.length);
        applyBorrowColumnLayoutStyles();
        const emptyClear = document.getElementById('borrow-empty-clear');
        if (emptyClear) {
            emptyClear.addEventListener('click', () => {
                borrowQueryState.search = '';
                borrowQueryState.status = '';
                borrowQueryState.sort = 'newest';
                borrowQueryState.selectedPreset = BORROW_FILTER_PRESET_DEFAULT;
                borrowSelectionWarningMessage = '';
                borrowPage = 1;
                renderBorrowTable();
            });
        }
        return;
    }

    tbody.innerHTML = pageRows.map((request) => {
        const dates = getRequestDateSummary(request);
        const risk = getBorrowRiskFlag(request);
        const riskBadge = risk ? `<span class="risk-badge ${risk.tone}">${risk.label}</span>` : '';
        const itemCount = request.borrow_request_items?.length || 0;
        const isSelectable = request.status === 'pending';
        const isChecked = selectedBorrowRequestIds.has(request.id);
        const borrowerMeta = request.borrower_email
            ? `<div class="request-meta-sub">${esc(request.borrower_email)}</div>`
            : `<div class="request-meta-sub">ไม่มีอีเมลในคำขอ</div>`;
        const requestMeta = `
            <div class="request-meta">
                <div title="${esc(request.purpose || '-')}">${esc(request.purpose || '-')}</div>
                <div class="request-meta-sub">${itemCount} รายการ · รวม ${dates.count} ชิ้น</div>
            </div>
        `;

        let actionBtns = '';
        if (request.status === 'pending') {
            actionBtns = `
                <button class="btn btn-success btn-sm" data-action="approve" data-id="${request.id}">อนุมัติ</button>
                <button class="btn btn-danger btn-sm" data-action="reject" data-id="${request.id}">ปฏิเสธ</button>
            `;
        } else if (request.status === 'approved' || request.status === 'returned_pending_inspection') {
            actionBtns = `
                <button class="btn btn-primary btn-sm" data-action="receive" data-id="${request.id}">ตรวจรับคืน</button>
            `;
        } else {
            actionBtns = `<span style="color:var(--text-3);font-size:0.8rem">สิ้นสุดการทำงาน</span>`;
        }

        const cellMarkup = {
            tracking: `<td data-borrow-col="tracking" style="font-family:monospace;font-size:0.85rem;color:var(--text-2);user-select:all;">${esc(request.tracking_id)}</td>`,
            borrower: `
                <td data-borrow-col="borrower">
                    <div class="request-meta">
                        <div style="font-weight:500;">${esc(request.borrower_name)}</div>
                        ${borrowerMeta}
                    </div>
                </td>
            `,
            purpose: `<td data-borrow-col="purpose">${requestMeta}</td>`,
            pickup: `
                <td data-borrow-col="pickup">
                    <div class="request-meta">
                        <div>${formatShortDate(dates.start)} - ${formatShortDate(dates.end)}</div>
                        <div class="request-meta-sub">${riskBadge || 'ตามกำหนดปกติ'}</div>
                    </div>
                </td>
            `,
            status: `<td data-borrow-col="status">${statusBadge(request.status)}</td>`,
            actions: `<td data-borrow-col="actions" style="display:flex;gap:4px;flex-wrap:wrap;">${actionBtns}</td>`
        };

        return `
            <tr class="request-row ${risk?.tone || ''}">
                <td class="checkbox-col">
                    <input
                        type="checkbox"
                        class="borrow-cb"
                        data-id="${request.id}"
                        aria-label="เลือกคำขอ ${esc(request.tracking_id)}"
                        ${isSelectable ? '' : 'disabled'}
                        ${isChecked ? 'checked' : ''}
                    />
                </td>
                ${getVisibleBorrowColumns().map((key) => cellMarkup[key]).join('')}
            </tr>
        `;
    }).join('');
    syncBorrowSelectAll();
    updateBorrowBulkBar();
    renderBorrowPagination(filtered.length);
    applyBorrowColumnLayoutStyles();
}

document.getElementById('borrow-search').addEventListener('input', (event) => {
    borrowQueryState.search = event.target.value || '';
    borrowQueryState.selectedPreset = BORROW_FILTER_PRESET_DEFAULT;
    borrowPage = 1;
    renderBorrowTable();
});
document.getElementById('borrow-status-filter').addEventListener('change', (event) => {
    borrowQueryState.status = event.target.value || '';
    borrowQueryState.selectedPreset = BORROW_FILTER_PRESET_DEFAULT;
    borrowPage = 1;
    renderBorrowTable();
});
document.getElementById('borrow-sort').addEventListener('change', (event) => {
    borrowQueryState.sort = event.target.value || 'newest';
    borrowQueryState.selectedPreset = BORROW_FILTER_PRESET_DEFAULT;
    borrowPage = 1;
    renderBorrowTable();
});
document.getElementById('borrow-saved-filters').addEventListener('change', (event) => {
    const name = event.target.value || BORROW_FILTER_PRESET_DEFAULT;
    if (!name) {
        borrowQueryState.selectedPreset = BORROW_FILTER_PRESET_DEFAULT;
        syncBorrowControls();
        return;
    }
    applyBorrowPreset(name);
});
document.getElementById('btn-borrow-save-filter').addEventListener('click', saveCurrentBorrowPreset);
document.getElementById('btn-borrow-delete-filter').addEventListener('click', deleteCurrentBorrowPreset);
document.getElementById('btn-borrow-set-default-filter').addEventListener('click', saveBorrowDefaultPreset);
document.getElementById('btn-borrow-clear-default-filter').addEventListener('click', clearBorrowDefaultPreset);
document.getElementById('btn-borrow-columns').addEventListener('click', openBorrowColumnsModal);
document.getElementById('btn-close-borrow-columns').addEventListener('click', () => closeModal('borrow-columns-modal'));
document.getElementById('borrow-columns-cancel').addEventListener('click', () => closeModal('borrow-columns-modal'));
document.getElementById('borrow-columns-list').addEventListener('click', (event) => {
    const button = event.target.closest('[data-borrow-column-move]');
    if (!button) return;
    moveBorrowColumn(button.dataset.borrowColumnKey, button.dataset.borrowColumnMove);
});
document.getElementById('borrow-columns-list').addEventListener('dragstart', (event) => {
    const row = event.target.closest('[data-borrow-column-row]');
    if (!row) return;
    event.dataTransfer.setData('text/plain', row.dataset.borrowColumnRow);
});
document.getElementById('borrow-columns-list').addEventListener('dragover', (event) => {
    if (event.target.closest('[data-borrow-column-row]')) {
        event.preventDefault();
    }
});
document.getElementById('borrow-columns-list').addEventListener('drop', (event) => {
    const row = event.target.closest('[data-borrow-column-row]');
    if (!row) return;
    event.preventDefault();
    const draggedKey = event.dataTransfer.getData('text/plain');
    if (!draggedKey || draggedKey === row.dataset.borrowColumnRow) return;
    syncBorrowColumnLayoutFromModal();
    const nextOrder = borrowColumnOrder.filter((key) => key !== draggedKey);
    const targetIndex = nextOrder.indexOf(row.dataset.borrowColumnRow);
    nextOrder.splice(targetIndex, 0, draggedKey);
    borrowColumnOrder = nextOrder;
    renderBorrowColumnsList();
});
document.getElementById('borrow-columns-save').addEventListener('click', () => {
    syncBorrowColumnLayoutFromModal();
    writeBorrowColumnLayout();
    closeModal('borrow-columns-modal');
    renderBorrowTable();
});
document.getElementById('borrow-active-filters').addEventListener('click', (event) => {
    const chip = event.target.closest('[data-chip-clear]');
    if (!chip) return;

    const action = chip.dataset.chipClear;
    if (action === 'search') borrowQueryState.search = '';
    if (action === 'status') borrowQueryState.status = '';
    if (action === 'sort') borrowQueryState.sort = 'newest';
    if (action === 'all') {
        borrowQueryState.search = '';
        borrowQueryState.status = '';
        borrowQueryState.sort = 'newest';
    }
    borrowQueryState.selectedPreset = BORROW_FILTER_PRESET_DEFAULT;
    borrowSelectionWarningMessage = '';
    borrowPage = 1;
    renderBorrowTable();
});
document.addEventListener('change', (event) => {
    if (event.target?.id !== 'borrow-select-all') return;
    const checked = event.target.checked;
    getCurrentPageSelectableIds().forEach((id) => {
        const input = document.querySelector(`.borrow-cb[data-id="${id}"]`);
        if (!input) return;
        input.checked = checked;
        if (checked) {
            selectedBorrowRequestIds.add(id);
        } else {
            selectedBorrowRequestIds.delete(id);
        }
    });
    syncBorrowSelectAll();
    updateBorrowBulkBar();
});

// Delegated listener for admin queue action buttons (CSP-safe — no inline onclick)
document.getElementById('borrow-tbody').addEventListener('change', (e) => {
    const checkbox = e.target.closest('.borrow-cb');
    if (!checkbox) return;

    if (checkbox.checked) {
        selectedBorrowRequestIds.add(checkbox.dataset.id);
    } else {
        selectedBorrowRequestIds.delete(checkbox.dataset.id);
    }
    syncBorrowSelectAll();
    updateBorrowBulkBar();
});
document.getElementById('borrow-tbody').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    const action = btn.dataset.action;
    if (action === 'approve') approveRequest(id);
    else if (action === 'reject') rejectRequest(id);
    else if (action === 'receive') receiveReturn(id);
});

document.getElementById('btn-borrow-bulk-clear').addEventListener('click', () => {
    selectedBorrowRequestIds.clear();
    borrowSelectionWarningMessage = '';
    document.querySelectorAll('.borrow-cb').forEach((input) => {
        input.checked = false;
    });
    syncBorrowSelectAll();
    updateBorrowBulkBar();
});
document.getElementById('btn-borrow-select-all-results').addEventListener('click', () => {
    getSelectableBorrowRequests().forEach((request) => selectedBorrowRequestIds.add(request.id));
    borrowSelectionWarningMessage = '';
    document.querySelectorAll('.borrow-cb:not(:disabled)').forEach((input) => {
        input.checked = true;
    });
    syncBorrowSelectAll();
    updateBorrowBulkBar();
});

async function bulkApproveBorrowRequests(requestIds) {
    const validIds = requestIds.filter((id) => borrowRequests.some((request) => request.id === id && request.status === 'pending'));
    if (validIds.length === 0) {
        showToast('ไม่มีคำขอที่พร้อมอนุมัติในชุดที่เลือก', 'error');
        return;
    }

    if (!await showConfirm({
        title: 'อนุมัติคำขอแบบกลุ่ม',
        messageNode: createConfirmMsg('ยืนยันการอนุมัติ ', `${validIds.length} คำขอ`, ' ที่เลือกในผลลัพธ์นี้ใช่หรือไม่?'),
        okText: 'อนุมัติที่เลือก',
        okClass: 'btn-success'
    })) return;

    if (BORROW_ADMIN_TEST_MODE) {
        const nextRows = normalizeTestRows(readTestRequests()).map((row) => validIds.includes(row.id) ? { ...row, status: 'approved' } : row);
        writeTestRequests(nextRows);
        selectedBorrowRequestIds.clear();
        showToast(`Test mode: approved ${validIds.length} requests`, 'success');
        loadBorrowRequests();
        return;
    }

    const results = await Promise.all(validIds.map(async (id) => {
        const { error } = await sb.rpc('admin_approve_request', { p_request_id: id });
        return { id, error };
    }));

    const failed = results.filter((result) => result.error);
    const succeeded = results.filter((result) => !result.error);

    succeeded.forEach((result) => selectedBorrowRequestIds.delete(result.id));

    if (failed.length > 0) {
        console.error('[BorrowBulkApprove] failed:', failed.map((result) => ({ id: result.id, error: result.error?.message })));
        showToast(`อนุมัติสำเร็จ ${succeeded.length} รายการ และล้มเหลว ${failed.length} รายการ`, failed.length === results.length ? 'error' : 'warning');
    } else {
        showToast(`อนุมัติ ${succeeded.length} รายการสำเร็จ`, 'success');
    }

    loadBorrowRequests();
}

document.getElementById('btn-borrow-bulk-approve').addEventListener('click', async () => {
    const ids = [...selectedBorrowRequestIds];
    if (ids.length === 0) return;
    await bulkApproveBorrowRequests(ids);
});
document.getElementById('btn-borrow-bulk-reject').addEventListener('click', () => {
    const ids = [...selectedBorrowRequestIds].filter((requestId) => borrowRequests.some((request) => request.id === requestId && request.status === 'pending'));
    if (ids.length === 0) {
        showToast('ไม่มีคำขอที่พร้อมปฏิเสธในชุดที่เลือก', 'error');
        return;
    }
    openRejectModalForTargets('bulk', ids);
});

window.approveRequest = async function (id) {
    if (!await showConfirm({
        title: 'ยืนยันการอนุมัติ',
        messageNode: createConfirmMsg('คุณต้องการอนุมัติคำร้องยืมนี้ใช่หรือไม่?', '', ''),
        okText: 'อนุมัติ',
        okClass: 'btn-success'
    })) return;

    if (BORROW_ADMIN_TEST_MODE) {
        const nextRows = normalizeTestRows(readTestRequests()).map((row) => row.id === id ? { ...row, status: 'approved' } : row);
        writeTestRequests(nextRows);
        showToast('Test mode: request approved', 'success');
        loadBorrowRequests();
        return;
    }

    const { error } = await sb.rpc('admin_approve_request', { p_request_id: id });
    if (error) {
        showToast('เกิดข้อผิดพลาด: ' + error.message, 'error');
        return;
    }

    showToast('อนุมัติแล้ว ระบบจะส่งอีเมลหาผู้ยืมต่อไปตามขั้นตอน', 'success');
    loadBorrowRequests();
};

window.rejectRequest = async function (id) {
    openRejectModalForTargets('single', [id]);
};

document.getElementById('reject-reason-select').addEventListener('change', (e) => {
    const isOther = e.target.value === 'other';
    document.getElementById('reject-reason-text-group').style.display = isOther ? 'block' : 'none';
    updateRejectPreview();
});

document.getElementById('reject-reason-text').addEventListener('input', updateRejectPreview);

document.getElementById('reject-save').addEventListener('click', async () => {
    const id = document.getElementById('reject-req-id').value;
    const selectOption = document.getElementById('reject-reason-select').value;
    const textval = document.getElementById('reject-reason-text').value.trim();

    let finalReason = selectOption;
    if (selectOption === 'other') {
        if (!textval) {
            showToast('กรุณาระบุเหตุผลเพิ่มเติม', 'error');
            document.getElementById('reject-reason-text').focus();
            return;
        }
        finalReason = textval;
    }

    const btn = document.getElementById('reject-save');
    btn.disabled = true;
    btn.textContent = 'กำลังบันทึก...';

    if (BORROW_ADMIN_TEST_MODE) {
        const targetIds = currentRejectMode === 'bulk' ? currentRejectTargets : [id];
        const nextRows = normalizeTestRows(readTestRequests()).map((row) => targetIds.includes(row.id)
            ? { ...row, status: 'rejected', reject_reason: finalReason }
            : row);
        writeTestRequests(nextRows);
        btn.disabled = false;
        btn.textContent = currentRejectMode === 'bulk' ? `ปฏิเสธ ${currentRejectTargets.length} รายการ` : 'ยืนยันการปฏิเสธ';
        selectedBorrowRequestIds.clear();
        showToast(currentRejectMode === 'bulk' ? `Test mode: rejected ${targetIds.length} requests` : 'Test mode: request rejected', 'success');
        closeModal('reject-modal');
        loadBorrowRequests();
        return;
    }

    let error = null;
    if (currentRejectMode === 'bulk') {
        const targetIds = currentRejectTargets.filter((requestId) => borrowRequests.some((request) => request.id === requestId && request.status === 'pending'));
        const results = await Promise.all(targetIds.map(async (requestId) => {
            const response = await sb.rpc('admin_reject_request', { p_request_id: requestId, p_reason: finalReason });
            return { requestId, error: response.error };
        }));
        const failed = results.filter((result) => result.error);
        const succeeded = results.filter((result) => !result.error);
        succeeded.forEach((result) => selectedBorrowRequestIds.delete(result.requestId));
        if (failed.length > 0) {
            error = new Error(`ปฏิเสธสำเร็จ ${succeeded.length} รายการ และล้มเหลว ${failed.length} รายการ`);
            error.partialSuccess = true;
        }
    } else {
        ({ error } = await sb.rpc('admin_reject_request', { p_request_id: id, p_reason: finalReason }));
    }

    btn.disabled = false;
    btn.textContent = currentRejectMode === 'bulk' ? `ปฏิเสธ ${currentRejectTargets.length} รายการ` : 'ยืนยันการปฏิเสธ';

    if (error) {
        showToast((error.partialSuccess ? '' : 'เกิดข้อผิดพลาด: ') + error.message, error.partialSuccess ? 'warning' : 'error');
        if (!error.partialSuccess) return;
    } else {
        showToast(currentRejectMode === 'bulk'
            ? `ปฏิเสธ ${currentRejectTargets.length} รายการแล้ว`
            : 'ปฏิเสธคำร้องแล้ว', 'success');
    }

    closeModal('reject-modal');
    loadBorrowRequests();
});

document.getElementById('reject-cancel').addEventListener('click', () => {
    setRejectModalMode('single', []);
    closeModal('reject-modal');
});
document.getElementById('btn-close-reject').addEventListener('click', () => {
    setRejectModalMode('single', []);
    closeModal('reject-modal');
});

function buildReturnRows(request) {
    const tbody = document.getElementById('return-items-tbody');
    const items = request.borrow_request_items || [];

    tbody.innerHTML = items.map((item) => `
        <tr data-item-id="${esc(item.id)}" data-equipment-name="${esc(item.equipments?.name_th || '-')}" data-qty-borrowed="${Number(item.qty_borrowed || 0)}">
            <td>${esc(item.equipments?.name_th || '-')}</td>
            <td style="text-align:center;">${Number(item.qty_borrowed || 0)}</td>
            <td style="text-align:center;"><input class="return-qty-input" type="number" min="0" max="${Number(item.qty_borrowed || 0)}" value="${Number(item.qty_borrowed || 0)}" data-field="ok"></td>
            <td style="text-align:center;"><input class="return-qty-input" type="number" min="0" max="${Number(item.qty_borrowed || 0)}" value="0" data-field="damaged"></td>
            <td style="text-align:center;"><input class="return-qty-input" type="number" min="0" max="${Number(item.qty_borrowed || 0)}" value="0" data-field="maintenance"></td>
        </tr>
    `).join('');

    getReturnInputs().forEach((item) => {
        [item.okInput, item.damagedInput, item.maintenanceInput].forEach((input) => {
            input.addEventListener('input', recalcReturnSummary);
        });
    });
}

window.receiveReturn = async function (id) {
    const request = borrowRequests.find((row) => row.id === id);
    if (!request) {
        showToast('ไม่พบข้อมูลคำร้องสำหรับตรวจรับคืน', 'error');
        return;
    }

    currentReturnRequest = request;
    document.getElementById('return-req-id').value = request.id;
    document.getElementById('return-tid-display').textContent = request.tracking_id || '';
    buildReturnRows(request);
    recalcReturnSummary();
    openModal('return-modal');
};

async function saveReturnInspection() {
    if (!currentReturnRequest) return;
    if (!recalcReturnSummary()) return;

    const items = getReturnInputs().map((item) => ({
        item_id: item.id,
        qty_ok: Number(item.okInput.value || 0),
        qty_damaged: Number(item.damagedInput.value || 0),
        qty_maintenance: Number(item.maintenanceInput.value || 0)
    }));

    const hasException = items.some((item) => item.qty_damaged > 0 || item.qty_maintenance > 0);
    const saveBtn = document.getElementById('return-save');
    saveBtn.disabled = true;
    saveBtn.textContent = 'กำลังบันทึก...';

    try {
        if (BORROW_ADMIN_TEST_MODE) {
            const nextRows = normalizeTestRows(readTestRequests()).map((row) => {
                if (row.id !== currentReturnRequest.id) return row;
                return {
                    ...row,
                    status: 'returned',
                    borrow_request_items: (row.borrow_request_items || []).map((item) => {
                        const rowItemId = item.id || item.item_id;
                        const matched = items.find((entry) => entry.item_id === rowItemId);
                        if (!matched) return item;
                        return {
                            ...item,
                            qty_returned_ok: matched.qty_ok,
                            qty_returned_damaged: matched.qty_damaged,
                            qty_returned_maintenance: matched.qty_maintenance
                        };
                    })
                };
            });
            writeTestRequests(nextRows);
            showToast('Test mode: return recorded', 'success');
            closeReturnModal();
            loadBorrowRequests();
            return;
        }

        let error = null;
        if (hasException) {
            ({ error } = await sb.rpc('admin_receive_return_detailed', {
                p_request_id: currentReturnRequest.id,
                p_items: items
            }));
        } else {
            ({ error } = await sb.rpc('admin_receive_return', { p_request_id: currentReturnRequest.id }));
        }

        if (error) throw error;

        showToast(hasException ? 'บันทึกผลตรวจรับคืนพร้อมรายการส่งซ่อมแล้ว' : 'รับของคืนและอัปเดตสต็อกเรียบร้อยแล้ว', 'success');
        closeReturnModal();
        loadBorrowRequests();
    } catch (error) {
        showToast('เกิดข้อผิดพลาดในการรับคืน: ' + error.message, 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'บันทึกการรับคืน';
    }
}

document.getElementById('btn-return-all').addEventListener('click', () => fillReturnRows('ok'));
document.getElementById('btn-maintenance-all').addEventListener('click', () => fillReturnRows('maintenance'));
document.getElementById('return-save').addEventListener('click', saveReturnInspection);
document.getElementById('return-cancel').addEventListener('click', closeReturnModal);
document.getElementById('btn-close-return').addEventListener('click', closeReturnModal);

borrowColumnVisibility = readBorrowColumnVisibility();
borrowColumnOrder = readBorrowColumnOrder();
borrowFrozenColumns = readBorrowFrozenColumns();
const initialBorrowDefaultPreset = readBorrowDefaultPreset();
if (initialBorrowDefaultPreset) {
    borrowQueryState.selectedPreset = initialBorrowDefaultPreset;
}
refreshBorrowPresetOptions();
if (initialBorrowDefaultPreset) {
    applyBorrowPreset(initialBorrowDefaultPreset);
}
