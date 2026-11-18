(function () {
  const app = window.SimsetBorrow = window.SimsetBorrow || {};
  const CART_KEY = 'simset.borrow.cart.v2';
  const $ = (selector) => document.querySelector(selector);
  const esc = app.esc;

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
    const n = count();
    document.querySelectorAll('[data-cart-count]').forEach((node) => {
      const changed = node.textContent !== String(n);
      node.textContent = n;
      // ponytail: Anime.js is optional polish; skip when absent or reduced motion is requested.
      if (changed && window.anime && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        anime.animate(node, { scale: [1.5, 1], duration: 400, ease: 'outBack' });
      }
    });
  }

  function announce(message) {
    let node = document.querySelector('[data-cart-feedback]');
    if (!node) {
      node = document.createElement('div');
      node.dataset.cartFeedback = 'true';
      node.className = 'visually-hidden';
      node.setAttribute('aria-live', 'polite');
      document.body.appendChild(node);
    }
    node.textContent = message;
  }

  function flyToCart(source) {
    const target = document.querySelector('.sb-cart-btn, [data-cart-count]')?.closest('a,button') || document.querySelector('[data-cart-count]');
    if (!source || !target || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const image = source.closest('.equipment-card, .quick-view-panel, .product-gallery')?.querySelector('img');
    if (!image) return;
    const from = image.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    const clone = image.cloneNode(true);
    clone.className = 'cart-fly-image';
    Object.assign(clone.style, { left: `${from.left}px`, top: `${from.top}px`, width: `${Math.min(from.width, 120)}px`, height: `${Math.min(from.height, 90)}px` });
    document.body.appendChild(clone);
    requestAnimationFrame(() => { clone.style.transform = `translate(${to.left - from.left + to.width / 2 - from.width / 4}px, ${to.top - from.top + to.height / 2 - from.height / 4}px) scale(.18)`; clone.style.opacity = '0.2'; });
    clone.addEventListener('transitionend', () => clone.remove(), { once: true });
    setTimeout(() => clone.remove(), 700);
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
      tbody.innerHTML = '<tr><td colspan="4" class="text-center py-5">ยังไม่มีรายการยืม</td></tr>';
      if (summary) summary.textContent = '0 รายการ';
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
              <div class="fw-semibold">${esc(equipment?.name_th || 'ไม่พบชื่ออุปกรณ์')}</div>
            </td>
            <td>อุปกรณ์</td>
            <td style="max-width: 120px">
              <input class="form-control form-control-sm" type="number" min="1" max="${available || 99}" value="${cartItem.qty}" data-cart-qty="${esc(cartItem.equipment_id)}">
            </td>
            <td class="text-end">
              <button class="btn btn-sm btn-outline-danger" type="button" data-remove-cart="${esc(cartItem.equipment_id)}">ลบ</button>
            </td>
          </tr>`;
      }).join('');
      if (summary) summary.textContent = `${count()} รายการ`;
    } catch (error) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-center py-5 text-danger">โหลดรายการยืมไม่สำเร็จ: ${esc(error.message)}</td></tr>`;
      if (summary) summary.textContent = 'โหลดข้อมูลไม่สำเร็จ';
    }

    updateCartBadge();
  }

  document.addEventListener('click', (event) => {
    const addButton = event.target.closest('[data-add-to-cart]');
    if (addButton) {
      flyToCart(addButton);
      addItem(addButton.getAttribute('data-add-to-cart'), 1);
      const original = addButton.innerHTML;
      addButton.innerHTML = '<i class="bi-check2 me-1"></i>เพิ่มแล้ว';
      addButton.disabled = true;
      announce('เพิ่มอุปกรณ์ลงรายการยืมแล้ว');
      setTimeout(() => { addButton.innerHTML = original; addButton.disabled = false; }, 1200);
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
