(function () {
  const app = window.SimsetBorrow = window.SimsetBorrow || {};
  const $ = (selector) => document.querySelector(selector);
  const esc = (value) => (app.esc ? app.esc(value) : String(value ?? ''));
  let selectedEquipment = null;
  let selectedQty = 1;

  function getSelectionFromUrl() {
    const params = new URLSearchParams(location.search);
    const equipmentId = params.get('equipment_id');
    const qty = Math.max(1, Number(params.get('qty') || 1));
    return equipmentId ? { equipmentId, qty } : null;
  }

  async function fetchEquipment(id) {
    const { data, error } = await app.supabase
      .from('equipments')
      .select('id,name_th,total_quantity,maintenance_quantity')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  }

  async function renderCheckoutItems() {
    const list = $('#checkout-items');
    if (!list) return;
    const selection = getSelectionFromUrl();
    if (!selection) {
      list.innerHTML = '<li class="list-group-item text-danger">ยังไม่มีรายการยืม กรุณาเลือกอุปกรณ์จากหน้าอุปกรณ์</li>';
      return;
    }

    selectedQty = selection.qty;
    try {
      selectedEquipment = await fetchEquipment(selection.equipmentId);
      list.innerHTML = `
        <li class="list-group-item d-flex justify-content-between lh-sm">
          <div>
            <h6 class="my-0">${esc(selectedEquipment.name_th)}</h6>
            <small class="text-muted">${esc(selectedEquipment.id)}</small>
          </div>
          <span class="text-muted">x${selectedQty}</span>
        </li>`;
      const badge = $('#checkout-count');
      if (badge) badge.textContent = selectedQty;
    } catch (error) {
      list.innerHTML = `<li class="list-group-item text-danger">โหลดข้อมูลจาก Supabase ไม่สำเร็จ: ${esc(error.message)}</li>`;
    }
  }

  async function submitRequest(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const message = $('#checkout-message');
    message.className = 'alert d-none';
    message.textContent = '';

    const name = document.getElementById('borrower_name')?.value.trim() || '';
    const department = document.getElementById('department')?.value.trim() || '';
    const startDate = document.getElementById('start_date')?.value.trim() || '';
    const endDate = document.getElementById('end_date')?.value.trim() || '';
    const purpose = document.getElementById('purpose')?.value.trim() || '';

    if (!name) {
      alert('กรุณากรอกชื่อ');
      return;
    }

    if (!department) {
      alert('กรุณากรอกหน่วยงาน');
      return;
    }

    if (!selectedEquipment) {
      alert('กรุณาเลือกอุปกรณ์');
      return;
    }

    if (!startDate) {
      alert('กรุณาเลือกวันที่ยืม');
      return;
    }

    if (!endDate) {
      alert('กรุณาเลือกวันที่คืน');
      return;
    }

    if (endDate < startDate) {
      alert('วันที่คืนต้องไม่มาก่อนวันที่ยืม');
      return;
    }

    if (!purpose) {
      alert('กรุณากรอกวัตถุประสงค์');
      return;
    }

    const formData = new FormData(form);
    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = 'กำลังส่งเข้า Supabase...';

    try {
      const payload = {
        p_borrower_name: name,
        p_borrower_email: formData.get('borrower_email'),
        p_purpose: `${purpose} | หน่วยงาน: ${department} | โทร: ${formData.get('phone') || '-'}`,
        p_start_date: startDate,
        p_end_date: endDate,
        p_items: [{ equipment_id: selectedEquipment.id, qty: selectedQty }]
      };
      const { data: trackingId, error } = await app.supabase.rpc('submit_public_borrow_request', payload);
      if (error) throw error;
      location.href = `track.html?id=${encodeURIComponent(trackingId)}`;
    } catch (error) {
      message.className = 'alert alert-danger';
      message.textContent = `ส่งคำขอเข้า Supabase ไม่สำเร็จ: ${error.message}`;
      submitButton.disabled = false;
      submitButton.textContent = 'ส่งคำขอยืม';
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    renderCheckoutItems();
    $('#checkout-form')?.addEventListener('submit', submitRequest);
  });
}());
