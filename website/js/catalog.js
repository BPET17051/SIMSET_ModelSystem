(function () {
  const app = window.SimsetBorrow = window.SimsetBorrow || {};
  let equipment = [];

  const $ = (selector) => document.querySelector(selector);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));

  function detectType(item) {
    const text = `${item.name_th || ''} ${item.name_en || ''} ${item.type || ''}`.toLowerCase();
    if (text.includes('infant') || text.includes('baby') || text.includes('neonatal') || text.includes('ทารก')) return 'ทารก';
    if (text.includes('child') || text.includes('junior') || text.includes('pediatric') || text.includes('เด็ก')) return 'เด็ก';
    if (text.includes('adult') || text.includes('anne') || text.includes('ผู้ใหญ่')) return 'ผู้ใหญ่';
    return 'ทั่วไป';
  }

  function imageUrl(type) {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="450" height="300" viewBox="0 0 450 300">
        <rect width="450" height="300" fill="#f1f3f5"/>
        <circle cx="225" cy="120" r="42" fill="#dee2e6"/>
        <rect x="145" y="182" width="160" height="18" rx="9" fill="#ced4da"/>
        <text x="225" y="232" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#495057">${type}</text>
      </svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  function normalize(item) {
    const type = detectType(item);
    return {
      id: item.id,
      name: item.name_th || item.name_en || 'อุปกรณ์ไม่ระบุชื่อ',
      type,
      totalQuantity: Number(item.total_quantity || 0),
      maintenanceQuantity: Number(item.maintenance_quantity || 0),
      image: imageUrl(type)
    };
  }

  async function fetchEquipment() {
    if (!app.supabase) throw new Error('Supabase is not available.');
    const { data, error } = await app.supabase
      .from('equipments')
      .select('id,name_th,name_en,type,total_quantity,maintenance_quantity')
      .order('name_th', { ascending: true })
      .limit(100);
    if (error) throw error;
    return data.map(normalize);
  }

  function renderCatalog() {
    const grid = $('#equipment-grid');
    if (!grid) return;
    const query = ($('#catalog-search')?.value || '').trim().toLowerCase();
    const type = $('#catalog-type')?.value || 'all';
    const filtered = equipment
      .filter((item) => type === 'all' || item.type === type)
      .filter((item) => !query || `${item.name} ${item.id} ${item.type}`.toLowerCase().includes(query))
      .slice(0, 24);

    $('#catalog-count').textContent = `${filtered.length} รายการ`;

    grid.innerHTML = filtered.map((item) => {
      const baselineStock = Math.max(0, item.totalQuantity - item.maintenanceQuantity);
      const disabled = baselineStock <= 0;
      return `
        <div class="col mb-5">
          <div class="card h-100 equipment-card">
            <span class="badge bg-dark text-white position-absolute" style="top: 0.5rem; right: 0.5rem">${esc(item.type)}</span>
            <img class="card-img-top" src="${item.image}" alt="${esc(item.name)}" loading="lazy">
            <div class="card-body p-4">
              <div class="text-center">
                <h5 class="fw-bolder">${esc(item.name)}</h5>
                <div class="small text-muted mt-2">${esc(item.id)}</div>
                <div class="mt-3"><span class="status-pill ${disabled ? 'status-rejected' : 'status-ready'}">${disabled ? 'ไม่พร้อมให้ยืม' : `มีในระบบ ${baselineStock}`}</span></div>
                <div class="small text-muted mt-2">ตรวจช่วงวันที่ตอนส่งคำขอ</div>
              </div>
            </div>
            <div class="card-footer p-4 pt-0 border-top-0 bg-transparent">
              <div class="d-grid gap-2">
                <a class="btn btn-outline-dark" href="product-details.html?id=${encodeURIComponent(item.id)}">ดูรายละเอียด</a>
                <a class="btn btn-dark ${disabled ? 'disabled' : ''}" href="cart.html?equipment_id=${encodeURIComponent(item.id)}&qty=1" aria-disabled="${disabled}">เพิ่มรายการยืม</a>
              </div>
            </div>
          </div>
        </div>`;
    }).join('') || '<div class="col-12"><div class="empty-state">ไม่พบอุปกรณ์ตามเงื่อนไข</div></div>';
  }

  function renderDetails() {
    const root = $('#equipment-detail');
    if (!root) return;
    const id = new URLSearchParams(location.search).get('id');
    const item = equipment.find((entry) => entry.id === id) || equipment[0];
    if (!item) {
      root.innerHTML = '<div class="empty-state">ไม่พบข้อมูลอุปกรณ์จาก Supabase</div>';
      return;
    }
    const baselineStock = Math.max(0, item.totalQuantity - item.maintenanceQuantity);
    root.innerHTML = `
      <div class="row gx-4 gx-lg-5 align-items-start">
        <div class="col-md-6"><img class="card-img-top mb-5 mb-md-0 rounded" src="${item.image}" alt="${esc(item.name)}"></div>
        <div class="col-md-6">
          <div class="small mb-1 text-muted">รหัสอุปกรณ์: ${esc(item.id)}</div>
          <h1 class="display-6 fw-bolder">${esc(item.name)}</h1>
          <div class="fs-5 mb-4"><span class="status-pill ${baselineStock > 0 ? 'status-ready' : 'status-rejected'}">${baselineStock > 0 ? `มีในระบบ ${baselineStock}` : 'ไม่พร้อมให้ยืม'}</span></div>
          <p class="lead">จำนวนนี้ยังไม่หักการจองทับช่วงวันที่ ระบบจะตรวจวันยืมอีกครั้งตอนส่งคำขอ</p>
          <div class="d-flex gap-2">
            <a class="btn btn-dark flex-shrink-0 ${baselineStock <= 0 ? 'disabled' : ''}" href="cart.html?equipment_id=${encodeURIComponent(item.id)}&qty=1">
              <i class="bi-cart-fill me-1"></i> เพิ่มรายการยืม
            </a>
            <a class="btn btn-outline-dark" href="index.html">กลับไปหน้าอุปกรณ์</a>
          </div>
        </div>
      </div>`;
  }

  async function initCatalog() {
    try {
      equipment = await fetchEquipment();
      app.equipment = equipment;
      renderCatalog();
      renderDetails();
    } catch (error) {
      const target = $('#equipment-grid') || $('#equipment-detail');
      if (target) target.innerHTML = `<div class="empty-state text-danger">โหลดข้อมูลจาก Supabase ไม่สำเร็จ: ${esc(error.message)}</div>`;
    }
  }

  document.addEventListener('input', (event) => {
    if (event.target.matches('#catalog-search, #catalog-type')) renderCatalog();
  });

  app.esc = esc;
  document.addEventListener('DOMContentLoaded', initCatalog);
}());
