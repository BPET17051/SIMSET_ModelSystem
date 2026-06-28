(function () {
  const app = window.SimsetBorrow = window.SimsetBorrow || {};
  const $ = (selector) => document.querySelector(selector);
  const esc = (value) => (app.esc ? app.esc(value) : String(value ?? ''));
  let allocationRules = [];

  function showMessage(type, text) {
    const message = $('#checkout-message');
    if (!message) return;
    message.className = `alert alert-${type}`;
    message.textContent = text;
  }

  function clearMessage() {
    const message = $('#checkout-message');
    if (!message) return;
    message.className = 'alert d-none';
    message.textContent = '';
  }

  async function fetchEquipmentMap(items) {
    const ids = items.map((item) => item.equipment_id);
    if (!ids.length) return new Map();
    const { data, error } = await app.supabase
      .from('equipments')
      .select('id,name_th,total_quantity,maintenance_quantity,allocation_type')
      .in('id', ids);
    if (error) throw error;
    return new Map((data || []).map((row) => [row.id, row]));
  }

  function allocationLabel(allocationType) {
    const labels = {
      rotating: 'Rotating',
      room_dedicated: 'Room dedicated',
      advance_course_dedicated: 'Advance course'
    };
    return labels[allocationType] || allocationType || 'Rotating';
  }

  function renderRuleAlerts(rules = allocationRules) {
    const root = $('#checkout-rule-alerts');
    if (!root) return;
    const visibleRules = rules.filter((rule) => rule.warning || rule.blocked);
    root.innerHTML = visibleRules.map((rule) => {
      const conflicts = (rule.course_conflicts || []).map((conflict) => esc(conflict.course_name || conflict.course_code)).join(', ');
      return `
        <div class="alert ${rule.blocked ? 'alert-danger' : 'alert-warning'} py-2">
          <strong>${esc(rule.equipment_name || rule.equipment_id)}</strong>
          <div>${esc(rule.warning || '')}</div>
          ${conflicts ? `<div class="small mt-1">Course: ${conflicts}</div>` : ''}
        </div>`;
    }).join('');
  }

  async function refreshBorrowRules() {
    const items = app.cart?.getItems() || [];
    const startDate = $('#start_date')?.value.trim() || '';
    const endDate = $('#end_date')?.value.trim() || '';
    if (!items.length || !startDate || !endDate || endDate < startDate) {
      allocationRules = [];
      renderRuleAlerts();
      return [];
    }
    const { data, error } = await app.supabase.rpc('get_equipment_borrow_rules', {
      p_equipment_ids: items.map((item) => item.equipment_id),
      p_start_date: startDate,
      p_end_date: endDate
    });
    if (error) throw error;
    allocationRules = Array.isArray(data) ? data : [];
    renderRuleAlerts();
    return allocationRules;
  }

  async function renderCheckoutItems() {
    const list = $('#checkout-items');
    const badge = $('#checkout-count');
    const emptyState = $('#checkout-empty');
    const form = $('#checkout-form');
    if (!list) return;

    const items = app.cart?.getItems() || [];
    if (badge) badge.textContent = app.cart?.count() || 0;

    if (!items.length) {
      list.innerHTML = '';
      if (emptyState) emptyState.classList.remove('d-none');
      if (form) form.classList.add('d-none');
      return;
    }

    if (emptyState) emptyState.classList.add('d-none');
    if (form) form.classList.remove('d-none');

    const equipmentMap = await fetchEquipmentMap(items);
    list.innerHTML = items.map((item) => {
      const equipment = equipmentMap.get(item.equipment_id);
      return `
        <li class="list-group-item d-flex justify-content-between lh-sm">
          <div>
            <h6 class="my-0">${esc(equipment?.name_th || 'Unknown equipment')}</h6>
            <small class="text-muted">${esc(item.equipment_id)}</small>
            <div class="mt-1"><span class="allocation-badge allocation-${esc(equipment?.allocation_type || 'rotating')}">${esc(allocationLabel(equipment?.allocation_type))}</span></div>
          </div>
          <span class="text-muted">x${item.qty}</span>
        </li>`;
    }).join('');
  }

  function formValue(id) {
    return $(id)?.value.trim() || '';
  }

  async function submitRequest(event) {
    event.preventDefault();
    clearMessage();

    const items = app.cart?.getItems() || [];
    if (!items.length) {
      showMessage('warning', 'Your cart is empty. Add equipment before checkout.');
      return;
    }

    const submitButton = event.currentTarget.querySelector('button[type="submit"]');
    const name = formValue('#borrower_name');
    const position = formValue('#borrower_position');
    const department = formValue('#department');
    const phone = formValue('#phone');
    const borrowPurposeOwner = formValue('#borrow_purpose_owner');
    const workPurpose = formValue('#work_purpose');
    const usageLocation = formValue('#usage_location');
    const startDate = formValue('#start_date');
    const endDate = formValue('#end_date');

    if (!name || !department || !phone || !borrowPurposeOwner || !workPurpose || !usageLocation || !startDate || !endDate) {
      showMessage('warning', 'Complete all required fields before submitting.');
      return;
    }
    if (endDate < startDate) {
      showMessage('warning', 'Return date cannot be before borrow date.');
      return;
    }

    try {
      const rules = await refreshBorrowRules();
      const blocked = rules.find((rule) => rule.blocked);
      if (blocked) {
        showMessage('danger', `${blocked.equipment_name || blocked.equipment_id}: ${blocked.warning}`);
        return;
      }
    } catch (error) {
      showMessage('danger', `Could not check borrow rules: ${error.message}`);
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = 'Submitting...';

    try {
      const { data: trackingId, error } = await app.supabase.rpc('submit_public_borrow_request_v2', {
        p_borrower_name: name,
        p_borrower_position: position,
        p_department: department,
        p_phone: phone,
        p_borrow_purpose_owner: borrowPurposeOwner,
        p_work_purpose: workPurpose,
        p_usage_location: usageLocation,
        p_start_date: startDate,
        p_end_date: endDate,
        p_items: items.map((item) => ({ equipment_id: item.equipment_id, qty: item.qty }))
      });
      if (error) throw error;
      app.cart.clear();
      location.href = `success.html?id=${encodeURIComponent(trackingId)}`;
    } catch (error) {
      showMessage('danger', `Could not submit request: ${error.message}`);
      submitButton.disabled = false;
      submitButton.textContent = 'Submit borrow request';
    }
  }

  document.addEventListener('change', (event) => {
    if (!event.target.matches('#start_date, #end_date')) return;
    const start = $('#start_date')?.value;
    const end = $('#end_date')?.value;
    if (start && end && end < start) {
      showMessage('warning', 'วันคืนต้องไม่ก่อนวันยืม');
      return;
    }
    clearMessage();
    refreshBorrowRules().catch((error) => showMessage('danger', error.message));
  });

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      await renderCheckoutItems();
      await refreshBorrowRules();
      $('#checkout-form')?.addEventListener('submit', submitRequest);
    } catch (error) {
      showMessage('danger', error.message);
    }
  });
}());
