(function () {
  const app = window.SimsetBorrow = window.SimsetBorrow || {};
  const $ = (selector) => document.querySelector(selector);
  const esc = (value) => (app.esc ? app.esc(value) : String(value ?? ''));

  function getSelectionFromUrl() {
    const params = new URLSearchParams(location.search);
    const equipmentId = params.get('equipment_id');
    const qty = Math.max(1, Number(params.get('qty') || 1));
    return equipmentId ? { equipmentId, qty } : null;
  }

  async function fetchEquipment(id) {
    if (!app.supabase) throw new Error('Supabase is not available.');
    const { data, error } = await app.supabase
      .from('equipments')
      .select('id,name_th,total_quantity,maintenance_quantity')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  }

  function updateCartBadge() {
    const selected = getSelectionFromUrl();
    document.querySelectorAll('[data-cart-count]').forEach((node) => {
      node.textContent = selected ? selected.qty : 0;
    });
  }

  async function renderCartPage() {
    const tbody = $('#cart-items');
    const summary = $('#cart-summary');
    if (!tbody) {
      updateCartBadge();
      return;
    }

    const selected = getSelectionFromUrl();
    if (!selected) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center py-5">ยังไม่มีรายการยืม</td></tr>';
      if (summary) summary.textContent = '0 รายการ';
      updateCartBadge();
      return;
    }

    try {
      const item = await fetchEquipment(selected.equipmentId);
      const available = Math.max(0, Number(item.total_quantity || 0) - Number(item.maintenance_quantity || 0));
      tbody.innerHTML = `
        <tr>
          <td>
            <div class="d-flex align-items-center gap-3">
              <span class="borrow-item-thumb">อุปกรณ์</span>
              <div>
                <div class="fw-semibold">${esc(item.name_th)}</div>
                <div class="small text-muted">${esc(item.id)}</div>
              </div>
            </div>
          </td>
          <td>อุปกรณ์</td>
          <td>${selected.qty}</td>
          <td class="text-end">
            <a class="btn btn-sm btn-dark" href="checkout.html?equipment_id=${encodeURIComponent(item.id)}&qty=${encodeURIComponent(selected.qty)}">ส่งคำขอยืม</a>
          </td>
        </tr>`;
      if (summary) summary.textContent = `${selected.qty} รายการ | พร้อมใช้งาน ${available}`;
    } catch (error) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-center py-5 text-danger">โหลดข้อมูลจาก Supabase ไม่สำเร็จ: ${esc(error.message)}</td></tr>`;
      if (summary) summary.textContent = 'Supabase error';
    }
    updateCartBadge();
  }

  app.getSelectionFromUrl = getSelectionFromUrl;
  app.updateCartBadge = updateCartBadge;
  document.addEventListener('DOMContentLoaded', renderCartPage);
}());
