(function () {
  const app = window.SimsetBorrow = window.SimsetBorrow || {};
  const $ = (selector) => document.querySelector(selector);
  const esc = (value) => (app.esc ? app.esc(value) : String(value ?? ''));
  const CART_KEY = 'simset.borrow.cart';

  function readCart() {
    try {
      const rows = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
      return Array.isArray(rows)
        ? rows.filter((item) => item.equipmentId && Number(item.qty) > 0)
        : [];
    } catch {
      return [];
    }
  }

  function writeCart(items) {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
  }

  function getSelectionFromUrl() {
    const params = new URLSearchParams(location.search);
    const equipmentId = params.get('equipment_id');
    const qty = Math.max(1, Number(params.get('qty') || 1));
    return equipmentId ? { equipmentId, qty } : null;
  }

  function addSelectionToCart(selection) {
    const items = readCart();
    const existing = items.find((item) => item.equipmentId === selection.equipmentId);
    if (existing) {
      existing.qty = Math.max(1, Number(existing.qty || 0) + selection.qty);
    } else {
      items.push(selection);
    }
    writeCart(items);
    return items;
  }

  function getCartItems() {
    const selected = getSelectionFromUrl();
    // Keep direct product links working while cart.html remains the multi-item path.
    if (selected && location.pathname.endsWith('/checkout.html')) return [selected];
    return readCart();
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
    const total = readCart().reduce((sum, item) => sum + Number(item.qty || 0), 0);
    document.querySelectorAll('[data-cart-count]').forEach((node) => {
      node.textContent = total;
    });
  }

  async function renderCartPage() {
    const tbody = $('#cart-items');
    const summary = $('#cart-summary');
    if (!tbody) {
      updateCartBadge();
      return;
    }

    const incoming = getSelectionFromUrl();
    const cart = incoming ? addSelectionToCart(incoming) : readCart();
    history.replaceState(null, '', 'cart.html');

    if (!cart.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center py-5">ยังไม่มีรายการยืม</td></tr>';
      if (summary) summary.textContent = '0 รายการ';
      updateCartBadge();
      return;
    }

    try {
      const rows = await Promise.all(cart.map(async (selected) => {
        const item = await fetchEquipment(selected.equipmentId);
        const available = Math.max(0, Number(item.total_quantity || 0) - Number(item.maintenance_quantity || 0));
        return { selected, item, available };
      }));

      tbody.innerHTML = rows.map(({ selected, item, available }) => `
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
          <td>พร้อมใช้งาน ${available}</td>
          <td>${Number(selected.qty || 0)}</td>
          <td class="text-end">
            <button class="btn btn-sm btn-outline-danger" type="button" data-remove-cart="${esc(item.id)}">ลบ</button>
          </td>
        </tr>`).join('');

      if (summary) {
        const qty = cart.reduce((sum, item) => sum + Number(item.qty || 0), 0);
        summary.textContent = `${qty} รายการ`;
      }
    } catch (error) {
      console.error(error);
      tbody.innerHTML = '<tr><td colspan="4" class="text-center py-5 text-danger">โหลดข้อมูลไม่สำเร็จ</td></tr>';
      if (summary) summary.textContent = 'เกิดข้อผิดพลาด';
    }
    updateCartBadge();
  }

  document.addEventListener('click', (event) => {
    const remove = event.target.closest('[data-remove-cart]');
    if (!remove) return;
    const id = remove.getAttribute('data-remove-cart');
    writeCart(readCart().filter((item) => item.equipmentId !== id));
    renderCartPage();
  });

  app.getSelectionFromUrl = getSelectionFromUrl;
  app.getCartItems = getCartItems;
  app.clearCart = () => writeCart([]);
  app.updateCartBadge = updateCartBadge;
  document.addEventListener('DOMContentLoaded', renderCartPage);
}());
