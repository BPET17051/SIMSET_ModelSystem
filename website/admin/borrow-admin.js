/* ===== SIMSET Admin Panel — borrow-admin.js ===== */

let borrowRequests = [];
let currentReturnRequest = null;
let currentReturnItems = [];

window.loadBorrowRequests = async function () {
    document.getElementById('borrow-tbody').innerHTML = '<tr><td colspan="6" class="tbl-loading"><span class="spinner-sm"></span>โหลดข้อมูล...</td></tr>';

    // Fetch Requests with Items
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
        document.getElementById('borrow-tbody').innerHTML = `<tr><td colspan="6" style="text-align:center;color:red">Error: ${esc(error.message)}</td></tr>`;
        return;
    }

    borrowRequests = data || [];
    renderBorrowStats();
    renderBorrowTable();
};

function renderBorrowStats() {
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    // Pending Today
    const pendingCount = borrowRequests.filter(r => r.status === 'pending').length;

    // Receiving (Returned pending inspection)
    const receivingCount = borrowRequests.filter(r => r.status === 'returned_pending_inspection').length;

    // Preparing Tomorrow (Approved requests where any item starts tomorrow)
    let prepCount = 0;
    borrowRequests.forEach(r => {
        if (r.status === 'approved') {
            const hasTomorrowItem = r.borrow_request_items.some(i => i.start_date.split('T')[0] === tomorrow);
            if (hasTomorrowItem) prepCount++;
        }
    });

    // Also update notification badge in sidebar
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
    setSync();
}

function renderBorrowTable() {
    const tbody = document.getElementById('borrow-tbody');
    const search = document.getElementById('borrow-search').value.toLowerCase();
    const statusFilter = document.getElementById('borrow-status-filter').value;

    let filtered = borrowRequests.filter(r => {
        const textMatch =
            (r.tracking_id || '').toLowerCase().includes(search) ||
            (r.borrower_name || '').toLowerCase().includes(search) ||
            (r.purpose || '').toLowerCase().includes(search);

        const statusMatch = statusFilter ? r.status === statusFilter : true;
        return textMatch && statusMatch;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text-3)">ไม่พบข้อมูลคำร้อง</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(r => {
        const dDate = new Date(r.created_at).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' });

        // Find earliest start date to show
        let earliestDateStr = '-';
        if (r.borrow_request_items && r.borrow_request_items.length > 0) {
            const d = new Date(r.borrow_request_items[0].start_date);
            earliestDateStr = d.toLocaleDateString('th-TH', { day: '2-digit', month: 'short' });
        }

        let actionBtns = '';
        if (r.status === 'pending') {
            actionBtns = `
                <button class="btn btn-success btn-sm" onclick="approveRequest('${r.id}')">อนุมัติ</button>
                <button class="btn btn-danger btn-sm" onclick="rejectRequest('${r.id}')">ปฏิเสธ</button>
            `;
        } else if (r.status === 'approved') {
            actionBtns = `
                <button class="btn btn-primary btn-sm" onclick="receiveReturn('${r.id}')">รับของคืน</button>
            `;
        } else if (r.status === 'returned_pending_inspection') {
            actionBtns = `
                <button class="btn btn-outline btn-sm" style="border-color:#3b82f6;color:#3b82f6" onclick="receiveReturn('${r.id}')">เช็คสภาพ/จบงาน</button>
            `;
        } else {
            actionBtns = `<span style="color:var(--text-3);font-size:0.8rem">สิ้นสุดการทำงาน</span>`;
        }

        return `
            <tr>
                <td style="font-family:monospace;font-size:0.85rem;color:var(--text-2);user-select:all;">${r.tracking_id}</td>
                <td style="font-weight:500;">${esc(r.borrower_name)}</td>
                <td style="color:var(--text-2);max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${esc(r.purpose)}">${esc(r.purpose)}</td>
                <td>${earliestDateStr}</td>
                <td>${statusBadge(r.status)}</td>
                <td style="display:flex;gap:4px;">${actionBtns}</td>
            </tr>
        `;
    }).join('');
}

document.getElementById('borrow-search').addEventListener('input', renderBorrowTable);
document.getElementById('borrow-status-filter').addEventListener('change', renderBorrowTable);

/* =========================================================
   ACTIONS: APPROVE & REJECT
   ========================================================= */

window.approveRequest = async function (id) {
    if (!await showConfirm({
        title: 'ยืนยันการอนุมัติ',
        messageNode: createConfirmMsg('คุณต้องการอนุมัติคำร้องยืมนี้ใช่หรือไม่?', '', ''),
        okText: 'อนุมัติ',
        okClass: 'btn-success'
    })) return;

    // Update Status to approved
    const { error } = await sb
        .from('borrow_requests')
        .update({ status: 'approved' })
        .eq('id', id);

    if (error) {
        showToast('เกิดข้อผิดพลาด: ' + error.message, 'error');
        return;
    }

    // In a real flow, you might insert into document_artifacts here or call a webhook for email
    showToast('อนุมัติแล้ว ระบบจะส่งอีเมลหาผู้ยืมต่อไป (ตามแผน Phase 1)', 'success');
    loadBorrowRequests();
};

window.rejectRequest = async function (id) {
    document.getElementById('reject-req-id').value = id;
    document.getElementById('reject-reason-select').value = 'อุปกรณ์ที่คุณต้องการไม่มีคิวว่างในช่วงเวลาดังกล่าว';
    document.getElementById('reject-reason-text-group').style.display = 'none';
    document.getElementById('reject-reason-text').value = '';

    openModal('reject-modal');
};

document.getElementById('reject-reason-select').addEventListener('change', (e) => {
    if (e.target.value === 'other') {
        document.getElementById('reject-reason-text-group').style.display = 'block';
    } else {
        document.getElementById('reject-reason-text-group').style.display = 'none';
    }
});

document.getElementById('reject-save').addEventListener('click', async () => {
    const id = document.getElementById('reject-req-id').value;
    const selectOption = document.getElementById('reject-reason-select').value;
    const textval = document.getElementById('reject-reason-text').value.trim();

    let finalReason = selectOption;
    if (selectOption === 'other') {
        if (!textval) {
            alert('กรุณาระบุเหตุผลเพิ่มเติม');
            return;
        }
        finalReason = textval;
    }

    const btn = document.getElementById('reject-save');
    btn.disabled = true;
    btn.textContent = 'กำลังบันทึก...';

    const { error } = await sb
        .from('borrow_requests')
        .update({ status: 'rejected', cancel_reason: finalReason })
        .eq('id', id);

    btn.disabled = false;
    btn.textContent = 'ยืนยันการปฏิเสธ';

    if (error) {
        showToast('เกิดข้อผิดพลาด: ' + error.message, 'error');
        return;
    }

    showToast('ปฏิเสธคำร้องแล้ว', 'success');
    closeModal('reject-modal');
    loadBorrowRequests();
});

document.getElementById('reject-cancel').addEventListener('click', () => closeModal('reject-modal'));
document.getElementById('btn-close-reject').addEventListener('click', () => closeModal('reject-modal'));


/* =========================================================
   ACTIONS: RETURN AND PARTIAL RETURN / DAMAGE TRACKING
   ========================================================= */

window.receiveReturn = async function (id) {
    const r = borrowRequests.find(req => req.id === id);
    if (!r) return;

    currentReturnRequest = r;
    currentReturnItems = r.borrow_request_items;

    // If it's just 'approved', changing to 'returned_pending_inspection' is required before final checkout
    if (r.status === 'approved') {
        const { error } = await sb.from('borrow_requests').update({ status: 'returned_pending_inspection' }).eq('id', id);
        if (error) { showToast(error.message, 'error'); return; }
        r.status = 'returned_pending_inspection'; // soft update local
        showToast('รับของคืนแล้ว กรุณาตรวจสอบสภาพ', 'success');
    }

    // Open Modal
    document.getElementById('return-tid-display').textContent = 'Tracking ID: ' + r.tracking_id;
    document.getElementById('return-req-id').value = id;

    renderReturnItems();
    openModal('return-modal');
};

function renderReturnItems() {
    const tbody = document.getElementById('return-items-tbody');
    tbody.innerHTML = currentReturnItems.map((item, index) => {
        return `
            <tr>
                <td>${esc(item.equipments.name_th)}</td>
                <td style="text-align:center; font-weight:bold;">${item.qty_borrowed}</td>
                <td><input type="number" class="field-input ret-ok" data-idx="${index}" min="0" max="${item.qty_borrowed}" value="${item.qty_returned_ok || 0}" style="text-align:center; font-weight:bold; color:#10b981;" oninput="validateReturn(${index})" /></td>
                <td><input type="number" class="field-input ret-dmg" data-idx="${index}" min="0" max="${item.qty_borrowed}" value="${item.qty_returned_damaged || 0}" style="text-align:center; color:#ef4444;" oninput="validateReturn(${index})" /></td>
                <td><input type="number" class="field-input ret-mnt" data-idx="${index}" min="0" max="${item.qty_borrowed}" value="${item.qty_returned_maintenance || 0}" style="text-align:center; color:#f59e0b;" oninput="validateReturn(${index})" /></td>
            </tr>
        `;
    }).join('');
}

window.validateReturn = function (index) {
    const item = currentReturnItems[index];
    const ok = parseInt(document.querySelector(`.ret-ok[data-idx="${index}"]`).value) || 0;
    const dmg = parseInt(document.querySelector(`.ret-dmg[data-idx="${index}"]`).value) || 0;
    const mnt = parseInt(document.querySelector(`.ret-mnt[data-idx="${index}"]`).value) || 0;

    const total = ok + dmg + mnt;
    if (total > item.qty_borrowed) {
        alert(`รวมแล้วเกินจำนวนที่ยืม (${item.qty_borrowed}) กรุณาระบุใหม่`);
        // Reset to original values securely
        document.querySelector(`.ret-ok[data-idx="${index}"]`).value = item.qty_returned_ok || 0;
        document.querySelector(`.ret-dmg[data-idx="${index}"]`).value = item.qty_returned_damaged || 0;
        document.querySelector(`.ret-mnt[data-idx="${index}"]`).value = item.qty_returned_maintenance || 0;
    }
};

/* Quick Actions in Modal */
document.getElementById('btn-return-all').addEventListener('click', () => {
    currentReturnItems.forEach((item, index) => {
        document.querySelector(`.ret-ok[data-idx="${index}"]`).value = item.qty_borrowed;
        document.querySelector(`.ret-dmg[data-idx="${index}"]`).value = 0;
        document.querySelector(`.ret-mnt[data-idx="${index}"]`).value = 0;
    });
});

document.getElementById('btn-maintenance-all').addEventListener('click', () => {
    currentReturnItems.forEach((item, index) => {
        document.querySelector(`.ret-ok[data-idx="${index}"]`).value = 0;
        document.querySelector(`.ret-dmg[data-idx="${index}"]`).value = 0;
        document.querySelector(`.ret-mnt[data-idx="${index}"]`).value = item.qty_borrowed;
    });
});

/* Save Return Status */
document.getElementById('return-save').addEventListener('click', async () => {
    const btn = document.getElementById('return-save');
    btn.disabled = true;
    btn.textContent = 'กำลังบันทึก...';

    // We update each item individually, then update main status if all items sum matches
    let allFinished = true;
    const returnItemsData = [];

    for (let i = 0; i < currentReturnItems.length; i++) {
        const item = currentReturnItems[i];
        const ok = parseInt(document.querySelector(`.ret-ok[data-idx="${i}"]`).value) || 0;
        const dmg = parseInt(document.querySelector(`.ret-dmg[data-idx="${i}"]`).value) || 0;
        const mnt = parseInt(document.querySelector(`.ret-mnt[data-idx="${i}"]`).value) || 0;

        if (ok + dmg + mnt < item.qty_borrowed) {
            allFinished = false; // still pending some returns
        }

        if (ok + dmg + mnt > item.qty_borrowed) {
            alert('ข้อมูลจำนวนไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง');
            btn.disabled = false; btn.textContent = 'บันทึกการรับคืน';
            return;
        }

        returnItemsData.push({
            item_id: item.id,
            qty_ok: ok,
            qty_damaged: dmg,
            qty_maintenance: mnt
        });
    }

    const { error } = await sb.rpc('process_equipment_return', {
        p_request_id: currentReturnRequest.id,
        p_items: returnItemsData
    });

    if (error) {
        showToast('เกิดข้อผิดพลาดการคืนรายการ: ' + error.message, 'error');
        btn.disabled = false; btn.textContent = 'บันทึกการรับคืน';
        return;
    }

    if (allFinished) {
        showToast('จบงานการยืมและคืนสต็อกสำเร็จ', 'success');
    } else {
        showToast('บันทึกสถานะจำนวนเรียบร้อย (ยังค้างคืนบางส่วน)', 'success');
    }

    closeModal('return-modal');
    btn.disabled = false; btn.textContent = 'บันทึกการรับคืน';
    loadBorrowRequests();
});

document.getElementById('btn-close-return').addEventListener('click', () => closeModal('return-modal'));
document.getElementById('return-cancel').addEventListener('click', () => closeModal('return-modal'));
