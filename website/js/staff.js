(function () {
  const app = window.SimsetBorrow = window.SimsetBorrow || {};
  const supabase = app.supabase;
  let currentSession = null;

  const esc = app.esc;

  const STATUS_LABELS = {
    pending: 'รออนุมัติ',
    approved: 'อนุมัติแล้ว',
    ready: 'พร้อมจ่าย',
    borrowed: 'จ่ายออกไปแล้ว',
    returned: 'คืนแล้ว',
    inspection: 'รอตรวจรับ',
    completed: 'เสร็จสิ้น',
    damaged: 'พบชำรุด',
    lost: 'สูญหาย',
    rejected: 'ปฏิเสธ',
    cancelled: 'ยกเลิกแล้ว',
    expired: 'หมดอายุ',
    overdue: 'เกินกำหนดคืน'
  };

  function showMessage(type, text) {
    app.showMessage('staff-message', type, text);
  }

  function setAuthState(text, tone = 'muted') {
    const node = document.getElementById('staff-auth-state');
    if (!node) return;
    node.textContent = text;
    node.classList.toggle('text-danger', tone === 'danger');
    node.classList.toggle('text-success', tone === 'success');
  }

  async function requireStaff() {
    let session;
    try {
      ({ session } = await app.auth.requireRole(['admin', 'staff', 'approver_l1']));
    } catch (error) {
      if (error.code === 'FORBIDDEN') {
        setAuthState('บัญชีนี้ไม่มีสิทธิ์ Staff Dashboard', 'danger');
      } else {
        setAuthState('ต้องเข้าสู่ระบบ Staff', 'danger');
      }
      return false;
    }
    currentSession = session;
    setAuthState(`Signed in: ${currentSession.user.email}`, 'success');
    const logoutButton = document.getElementById('staff-logout');
    if (logoutButton) logoutButton.hidden = false;
    return true;
  }

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = 'admin-login.html?next=staff.html';
  }

  function itemList(items) {
    return (items || []).map((item) => {
      const sap = item.manikin_sap_id ? ` <span class="text-muted">(${esc(item.manikin_sap_id)})</span>` : '';
      const unit = item.unit_code ? ` <span class="text-muted">(${esc(item.unit_code)})</span>` : '';
      const allocation = item.allocation_type ? ` <span class="allocation-badge allocation-${esc(item.allocation_type)}">${esc(item.allocation_type)}</span>` : '';
      const mode = item.inventory_mode ? ` <span class="allocation-badge">${esc(item.inventory_mode)}</span>` : '';
      const suggestionButton = item.item_id && item.equipment_id && item.manikin_sap_id
        ? `<button class="btn btn-link btn-sm p-0 ms-1" type="button" data-rotation-suggest="${esc(item.equipment_id)}:${esc(item.manikin_sap_id)}:${esc(item.item_id)}">rotation suggestion</button>`
        : '';
      const unitButton = item.item_id && ['tracked_unit', 'kit'].includes(item.inventory_mode) && !item.equipment_unit_id
        ? `<button class="btn btn-link btn-sm p-0 ms-1" type="button" data-assign-unit="${esc(item.item_id)}">assign unit</button>`
        : '';
      return `<li>${esc(item.equipment_name)}${sap}${unit} x${Number(item.qty_borrowed || 1)}${allocation}${mode}${suggestionButton}${unitButton}<div class="rotation-suggestion small mt-1" data-rotation-result="${esc(item.item_id || '')}"></div></li>`;
    }).join('');
  }

  function snapshotForm(request, mode) {
    const label = mode === 'pickup' ? 'Confirm Pickup' : 'Confirm Return';
    const rpc = mode === 'pickup' ? 'pickup' : 'return';
    return `
      <form class="snapshot-form mt-3" data-${rpc}-form="${esc(request.id)}">
        <label class="form-label">สภาพหุ่น</label>
        <select class="form-select form-select-sm" name="condition" required>
          <option value="">เลือกสภาพ</option>
          <option value="normal">ปกติ</option>
          <option value="damaged">ชำรุด</option>
          <option value="maintenance">ต้องซ่อม/บำรุงรักษา</option>
          <option value="missing">สูญหาย/ไม่ครบ</option>
        </select>
        <label class="form-label mt-2">หมายเหตุ</label>
        <textarea class="form-control form-control-sm" name="note" rows="2" required></textarea>
        <label class="form-label mt-2">ภาพถ่ายอย่างน้อย 1 ภาพ</label>
        <input class="form-control form-control-sm" name="photos" type="file" accept="image/*" multiple required>
        <button class="btn btn-dark btn-sm mt-3 w-100" type="submit">${label}</button>
      </form>`;
  }

  function nextActionCue(mode) {
    if (mode === 'pickup') {
      return '<div class="work-continuity-cue"><strong>ขั้นตอนถัดไป</strong><span>ตรวจสภาพ / ถ่ายรูป / Confirm Pickup</span></div>';
    }
    if (mode === 'return') {
      return '<div class="work-continuity-cue"><strong>ขั้นตอนถัดไป</strong><span>ตรวจรับคืน / ถ่ายรูป / Confirm Return</span></div>';
    }
    return '<div class="work-continuity-cue"><strong>สถานะงาน</strong><span>ปิดงานแล้ว ใช้ Tracking ID ตรวจย้อนหลังได้</span></div>';
  }

  function orderCard(request, mode) {
    const due = request.return_date || request.returned_at || '-';
    return `
      <article class="staff-order-card">
        <div class="d-flex justify-content-between gap-2">
          <div>
            <h3>${esc(request.tracking_id)}</h3>
            <div class="text-muted small">${esc(request.department || '-')}</div>
          </div>
          <span class="status-pill status-${esc(request.status)}">${esc(STATUS_LABELS[request.status] || request.status)}</span>
        </div>
        <p class="mb-2 mt-3"><strong>ผู้ยืม:</strong> ${esc(request.borrower_name || '-')}</p>
        <p class="mb-2"><strong>กำหนด:</strong> ${esc(due)}</p>
        <ul class="staff-item-list">${itemList(request.items)}</ul>
        ${nextActionCue(mode)}
        ${mode ? snapshotForm(request, mode) : ''}
      </article>`;
  }

  function renderColumn(id, countId, rows, mode) {
    const root = document.getElementById(id);
    const count = document.getElementById(countId);
    const focusCount = document.getElementById(countId.replace('staff-count-', 'staff-focus-'));
    const safeRows = Array.isArray(rows) ? rows : [];
    if (count) count.textContent = safeRows.length;
    if (focusCount) focusCount.textContent = safeRows.length;
    if (!root) return;
    root.innerHTML = safeRows.length
      ? safeRows.map((row) => orderCard(row, mode)).join('')
      : '<div class="empty-state bg-white">ไม่มีรายการ</div>';
  }

  function renderAlerts(alerts) {
    const root = document.getElementById('staff-alerts');
    if (!root) return;
    const safeAlerts = Array.isArray(alerts) ? alerts : [];
    root.innerHTML = safeAlerts.map((alert) => `
      <div class="alert alert-warning mb-2">
        <strong>${esc(alert.alert_type || 'alert')}</strong> ${esc(alert.message || '')}
      </div>
    `).join('');
  }

  async function loadBoard() {
    const { data, error } = await supabase.rpc('get_staff_dashboard_orders');
    if (error) throw error;
    renderAlerts(data?.alerts);
    renderColumn('staff-to-prepare', 'staff-count-prepare', data?.to_prepare, 'pickup');
    renderColumn('staff-checked-out', 'staff-count-checked-out', data?.checked_out, 'return');
    renderColumn('staff-returned-today', 'staff-count-returned', data?.returned_today, null);
  }

  async function uploadImages(requestId, files) {
    const list = Array.from(files || []);
    if (!list.length) throw new Error('กรุณาแนบภาพถ่ายอย่างน้อย 1 ภาพ');
    if (!supabase.storage?.from) throw new Error('Supabase Storage is not available.');

    const urls = [];
    for (const file of list) {
      const safeName = file.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
      const path = `${requestId}/${Date.now()}-${safeName}`;
      const { data, error } = await supabase.storage.from('condition-snapshots').upload(path, file, { upsert: false });
      if (error) throw error;
      urls.push(data.path);
    }
    return urls;
  }

  async function submitSnapshot(form, mode) {
    const requestId = form.getAttribute(mode === 'pickup' ? 'data-pickup-form' : 'data-return-form');
    const condition = form.elements.condition.value;
    const note = form.elements.note.value.trim();
    const imageUrls = await uploadImages(requestId, form.elements.photos.files);
    const rpc = mode === 'pickup' ? 'confirm_pickup_with_snapshot' : 'confirm_return_with_snapshot';
    const { error } = await supabase.rpc(rpc, {
      p_request_id: requestId,
      p_condition_status: condition,
      p_note: note,
      p_image_urls: imageUrls
    });
    if (error) throw error;
    showMessage('success', mode === 'pickup' ? 'บันทึกจ่ายหุ่นแล้ว' : 'บันทึกรับคืนแล้ว');
    await loadBoard();
  }

  async function loadRotationSuggestion(equipmentId, selectedSapId, itemId) {
    const target = document.querySelector(`[data-rotation-result="${CSS.escape(itemId)}"]`);
    const { data, error } = await supabase.rpc('get_rotation_suggestions', {
      p_equipment_id: equipmentId,
      p_selected_manikin_sap_id: selectedSapId
    });
    if (error) throw error;
    const suggestion = Array.isArray(data) ? data[0] : null;
    if (!target) return;
    target.innerHTML = suggestion
      ? `<span class="text-warning">${esc(suggestion.message)}</span> <button class="btn btn-outline-dark btn-sm py-0" type="button" data-assign-manikin="${esc(itemId)}:${esc(suggestion.manikin_sap_id)}">ใช้ตัวนี้</button>`
      : '<span class="text-muted">ไม่มีหุ่นตัวอื่นที่ถูกยืมน้อยกว่า</span>';
  }

  async function assignSuggestedManikin(itemId, sapId) {
    const { error } = await supabase.rpc('staff_assign_manikin_to_item', {
      p_item_id: itemId,
      p_manikin_sap_id: sapId
    });
    if (error) throw error;
    showMessage('success', `Assigned ${sapId}`);
    await loadBoard();
  }

  async function assignInventoryUnit(itemId) {
    const unitId = window.prompt('Equipment unit UUID');
    if (!unitId) return;
    const { error } = await supabase.rpc('staff_assign_inventory_unit_to_item', {
      p_item_id: itemId,
      p_equipment_unit_id: unitId.trim()
    });
    if (error) throw error;
    showMessage('success', 'Assigned inventory unit');
    await loadBoard();
  }

  function subscribeRealtime() {
    if (!supabase.channel) return;
    supabase
      .channel('staff-borrow-requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'borrow_requests' }, () => {
        loadBoard().catch((error) => showMessage('danger', error.message));
      })
      .subscribe();
  }

  document.addEventListener('submit', (event) => {
    const pickup = event.target.closest('[data-pickup-form]');
    const returned = event.target.closest('[data-return-form]');
    if (!pickup && !returned) return;
    event.preventDefault();
    submitSnapshot(event.target, pickup ? 'pickup' : 'return').catch((error) => showMessage('danger', error.message));
  });

  document.addEventListener('click', (event) => {
    const suggest = event.target.closest('[data-rotation-suggest]');
    if (suggest) {
      const [equipmentId, sapId, itemId] = suggest.getAttribute('data-rotation-suggest').split(':');
      loadRotationSuggestion(equipmentId, sapId, itemId).catch((error) => showMessage('danger', error.message));
      return;
    }

    const assign = event.target.closest('[data-assign-manikin]');
    if (assign) {
      const [itemId, sapId] = assign.getAttribute('data-assign-manikin').split(':');
      assignSuggestedManikin(itemId, sapId).catch((error) => showMessage('danger', error.message));
      return;
    }

    const assignUnit = event.target.closest('[data-assign-unit]');
    if (!assignUnit) return;
    assignInventoryUnit(assignUnit.getAttribute('data-assign-unit')).catch((error) => showMessage('danger', error.message));
  });

  app.boot(async () => {
    document.getElementById('staff-logout')?.addEventListener('click', logout);
    if (!(await requireStaff())) return;
    ['staff-to-prepare', 'staff-checked-out', 'staff-returned-today'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '<div class="empty-state text-muted">กำลังโหลด...</div>';
    });
    await loadBoard();
    subscribeRealtime();
  }, {
    onError(error) {
      showMessage('danger', error.message);
    }
  });
}());
