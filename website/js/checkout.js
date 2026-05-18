(function () {
  const app = window.SimsetBorrow = window.SimsetBorrow || {};
  const $ = (selector) => document.querySelector(selector);
  const esc = (value) => (app.esc ? app.esc(value) : String(value ?? ''));
  let selectedItems = [];

  async function fetchEquipment(id) {
    const { data, error } = await app.supabase
      .from('equipments')
      .select('id,name_th,total_quantity,maintenance_quantity')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  }

  function friendlyError(error) {
    const message = String(error?.message || '');
    console.error(error);
    if (message.includes('At least one borrow item')) return 'กรุณาเลือกรายการอุปกรณ์ก่อนส่งคำขอ';
    if (message.includes('Invalid borrow date range')) return 'ช่วงวันที่ยืมไม่ถูกต้อง';
    if (message.includes('Equipment does not have enough stock')) return 'อุปกรณ์มีจำนวนไม่พอในช่วงวันที่เลือก';
    if (message.includes('Turnstile')) return 'กรุณายืนยันตัวตนก่อนส่งคำขอ';
    return 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง';
  }

  async function renderCheckoutItems() {
    const list = $('#checkout-items');
    if (!list) return;
    const cartItems = app.getCartItems ? app.getCartItems() : [];
    if (!cartItems.length) {
      selectedItems = [];
      list.innerHTML = '<li class="list-group-item text-danger">ยังไม่มีรายการยืม กรุณาเลือกอุปกรณ์จากหน้าอุปกรณ์</li>';
      return;
    }

    try {
      selectedItems = await Promise.all(cartItems.map(async (selection) => {
        const equipment = await fetchEquipment(selection.equipmentId);
        return {
          equipment,
          qty: Math.max(1, Number(selection.qty || 1))
        };
      }));

      list.innerHTML = selectedItems.map(({ equipment, qty }) => `
        <li class="list-group-item d-flex justify-content-between lh-sm">
          <div>
            <h6 class="my-0">${esc(equipment.name_th)}</h6>
            <small class="text-muted">${esc(equipment.id)}</small>
          </div>
          <span class="text-muted">x${qty}</span>
        </li>`).join('');
      const badge = $('#checkout-count');
      if (badge) badge.textContent = selectedItems.reduce((sum, item) => sum + item.qty, 0);
    } catch (error) {
      console.error(error);
      list.innerHTML = '<li class="list-group-item text-danger">โหลดข้อมูลไม่สำเร็จ</li>';
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
    const borrowerEmail = document.getElementById('borrower_email')?.value.trim() || '';
    const phone = String(document.getElementById('phone')?.value.trim() || '');
    const turnstileToken = document.querySelector('[name="cf-turnstile-response"]')?.value || '';

    if (!name) {
      alert('กรุณากรอกชื่อ');
      return;
    }

    if (!department) {
      alert('กรุณากรอกหน่วยงาน');
      return;
    }

    if (!borrowerEmail) {
      alert('กรุณากรอกอีเมล');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(borrowerEmail)) {
      alert('กรุณากรอกอีเมลให้ถูกต้อง');
      return;
    }

    if (phone && !/^[0-9+\-() ]{6,20}$/.test(phone)) {
      alert('กรุณากรอกเบอร์โทรเป็นตัวเลขหรือเครื่องหมาย + - ( ) เท่านั้น');
      return;
    }

    if (!selectedItems.length) {
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

    if (!turnstileToken) {
      alert('กรุณายืนยันตัวตนก่อนส่งคำขอ');
      return;
    }

    const formData = new FormData(form);
    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = 'กำลังส่งเข้า Supabase...';

    try {
      const payload = {
        p_borrower_name: name,
        p_borrower_email: borrowerEmail,
        p_purpose: `${purpose} | หน่วยงาน: ${department} | โทร: ${phone || '-'}`,
        p_start_date: startDate,
        p_end_date: endDate,
        p_items: selectedItems.map(({ equipment, qty }) => ({ equipment_id: equipment.id, qty })),
        p_turnstile_token: turnstileToken
      };
      const { data: trackingId, error } = await app.supabase.rpc('submit_public_borrow_request', payload);
      if (error) throw error;
      if (app.clearCart) app.clearCart();
      location.href = `track.html?id=${encodeURIComponent(trackingId)}`;
    } catch (error) {
      message.className = 'alert alert-danger';
      message.textContent = friendlyError(error);
      window.turnstile?.reset();
      submitButton.disabled = false;
      submitButton.textContent = 'ส่งคำขอยืม';
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    renderCheckoutItems();
    $('#checkout-form')?.addEventListener('submit', submitRequest);
  });
}());
