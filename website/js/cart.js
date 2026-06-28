(function () {
  const app = window.SimsetBorrow = window.SimsetBorrow || {};
  const CART_KEY = 'simset.borrow.cart.v2';
  const $ = (selector) => document.querySelector(selector);
  const esc = (value) => (app.esc ? app.esc(value) : String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char])));

  function readCart() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CART_KEY) || '{"items":[]}');
      return { items: Array.isArray(parsed.items) ? parsed.items : [] };
    } catch {
      return { items: [] };
    }
  }

  function writeCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify({ items: cart.items }));
  }

  function getItems() {
    return readCart().items
      .map((item) => ({
        equipment_id: String(item.equipment_id || item.equipmentId || ''),
        qty: Math.max(1, Number(item.qty || 1))
      }))
      .filter((item) => item.equipment_id);
  }

  function addItem(equipmentId, qty = 1) {
    const cart = { items: getItems() };
    const existing = cart.items.find((item) => item.equipment_id === equipmentId);
    if (existing) existing.qty += Math.max(1, Number(qty || 1));
    else cart.items.push({ equipment_id: equipmentId, qty: Math.max(1, Number(qty || 1)) });
    writeCart(cart);
    updateCartBadge();
  }

  function updateQty(equipmentId, qty) {
    const nextQty = Math.max(1, Number(qty || 1));
    const cart = { items: getItems().map((item) => (
      item.equipment_id === equipmentId ? { ...item, qty: nextQty } : item
    )) };
    writeCart(cart);
    updateCartBadge();
  }

  function removeItem(equipmentId) {
    writeCart({ items: getItems().filter((item) => item.equipment_id !== equipmentId) });
    updateCartBadge();
  }

  function clear() {
    writeCart({ items: [] });
    updateCartBadge();
  }

  function count() {
    return getItems().reduce((sum, item) => sum + item.qty, 0);
  }

  function updateCartBadge() {
    document.querySelectorAll('[data-cart-count]').forEach((node) => {
      node.textContent = count();
    });
  }

  async function fetchEquipmentMap(items) {
    const ids = items.map((item) => item.equipment_id);
    if (!ids.length) return new Map();
    const { data, error } = await app.supabase
      .from('equipments')
      .select('id,name_th,total_quantity,maintenance_quantity')
      .in('id', ids);
    if (error) throw error;
    return new Map((data || []).map((row) => [row.id, row]));
  }

  async function renderCartPage() {
    const tbody = $('#cart-items');
    const summary = $('#cart-summary');
    if (!tbody) {
      updateCartBadge();
      return;
    }

    const items = getItems();
    if (!items.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center py-5">No borrow items yet.</td></tr>';
      if (summary) summary.textContent = '0 items';
      updateCartBadge();
      return;
    }

    try {
      const equipmentMap = await fetchEquipmentMap(items);
      tbody.innerHTML = items.map((cartItem) => {
        const equipment = equipmentMap.get(cartItem.equipment_id);
        const available = equipment
          ? Math.max(0, Number(equipment.total_quantity || 0) - Number(equipment.maintenance_quantity || 0))
          : 0;
        return `
          <tr>
            <td>
              <div class="fw-semibold">${esc(equipment?.name_th || 'Unknown equipment')}</div>
              <div class="small text-muted">${esc(cartItem.equipment_id)}</div>
            </td>
            <td>Equipment</td>
            <td style="max-width: 120px">
              <input class="form-control form-control-sm" type="number" min="1" max="${available || 99}" value="${cartItem.qty}" data-cart-qty="${esc(cartItem.equipment_id)}">
            </td>
            <td class="text-end">
              <button class="btn btn-sm btn-outline-danger" type="button" data-remove-cart="${esc(cartItem.equipment_id)}">Remove</button>
            </td>
          </tr>`;
      }).join('');
      if (summary) summary.textContent = `${count()} items`;
    } catch (error) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-center py-5 text-danger">Could not load cart: ${esc(error.message)}</td></tr>`;
      if (summary) summary.textContent = 'Supabase error';
    }

    updateCartBadge();
  }

  document.addEventListener('click', (event) => {
    const addButton = event.target.closest('[data-add-to-cart]');
    if (addButton) {
      addItem(addButton.getAttribute('data-add-to-cart'), 1);
      addButton.textContent = 'Added';
      setTimeout(() => { addButton.textContent = 'Add to borrow cart'; }, 1200);
    }

    const removeButton = event.target.closest('[data-remove-cart]');
    if (removeButton) {
      if (!confirm('ลบรายการนี้ออกจากตะกร้า?')) return;
      removeItem(removeButton.getAttribute('data-remove-cart'));
      renderCartPage();
    }
  });

  document.addEventListener('change', (event) => {
    const input = event.target.closest('[data-cart-qty]');
    if (!input) return;
    updateQty(input.getAttribute('data-cart-qty'), input.value);
    renderCartPage();
  });

  app.cart = { getItems, addItem, updateQty, removeItem, clear, count };
  app.updateCartBadge = updateCartBadge;
  app.renderCartPage = renderCartPage;

  document.addEventListener('DOMContentLoaded', renderCartPage);
}());
