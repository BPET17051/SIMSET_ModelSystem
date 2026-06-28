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
    if (text.includes('infant') || text.includes('baby') || text.includes('neonatal')) return 'Infant';
    if (text.includes('child') || text.includes('junior') || text.includes('pediatric')) return 'Pediatric';
    if (text.includes('adult') || text.includes('anne')) return 'Adult';
    return 'General';
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

  function typeLabel(type) {
    const normalized = String(type || '').toLowerCase();
    const labels = {
      adult: 'ผู้ใหญ่',
      pediatric: 'เด็ก',
      child: 'เด็ก',
      infant: 'ทารก',
      baby: 'ทารก',
      general: 'ทั่วไป'
    };
    return labels[normalized] || type || 'ทั่วไป';
  }

  function normalize(item) {
    const type = detectType(item);
    return {
      id: item.id,
      name: item.name_th || item.name_en || 'Unnamed equipment',
      type,
      totalQuantity: Number(item.total_quantity || 0),
      maintenanceQuantity: Number(item.maintenance_quantity || 0),
      allocationType: item.allocation_type || 'rotating',
      image: imageUrl(typeLabel(type))
    };
  }

  function allocationHelp(allocationType) {
    const help = {
      rotating: 'ยืมได้ตามปกติ',
      room_dedicated: 'เจ้าหน้าที่ต้องพิจารณาเป็นพิเศษ',
      advance_course_dedicated: 'ตรวจตารางคอร์สก่อนยืม'
    };
    return help[allocationType] || 'ยืมได้ตามเงื่อนไขของศูนย์';
  }

  function allocationNotice(allocationType) {
    if (!allocationType || allocationType === 'rotating') return '';
    return allocationHelp(allocationType);
  }

  function availabilityText(item, available) {
    if (available <= 0) return 'ยังไม่พร้อมให้ยืม';
    return `พร้อมยืม ${available}`;
  }

  async function fetchEquipment() {
    if (!app.supabase) throw new Error('Supabase is not available.');
    const { data, error } = await app.supabase
      .from('equipments')
      .select('id,name_th,name_en,type,total_quantity,maintenance_quantity,allocation_type')
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
      .filter((item) => type === 'all' || item.type === type || typeLabel(item.type) === type)
      .filter((item) => !query || `${item.name} ${item.id} ${item.type} ${typeLabel(item.type)}`.toLowerCase().includes(query))
      .slice(0, 24);

    const count = $('#catalog-count');
    if (count) count.textContent = `${filtered.length} รายการ`;

    grid.innerHTML = filtered.map((item) => {
      const available = Math.max(0, item.totalQuantity - item.maintenanceQuantity);
      const disabled = available <= 0;
      const readableType = typeLabel(item.type);
      const availableLabel = availabilityText(item, available);
      const notice = allocationNotice(item.allocationType);
      return `
        <div class="col mb-5">
          <div class="card h-100 equipment-card">
            <span class="badge bg-dark text-white position-absolute" style="top: 0.5rem; right: 0.5rem">${esc(readableType)}</span>
            <img class="card-img-top" src="${item.image}" alt="${esc(item.name)}" loading="lazy">
            <div class="card-body p-4">
              <div class="text-center">
                <h5 class="fw-bolder">${esc(item.name)}</h5>
                <div class="equipment-choice-summary mt-3">
                  <div><strong>${esc(availableLabel)}</strong></div>
                  ${notice ? `<div class="equipment-choice-note">${esc(notice)}</div>` : ''}
                </div>
              </div>
            </div>
            <div class="card-footer p-4 pt-0 border-top-0 bg-transparent">
              <div class="d-grid gap-2">
                <a class="btn btn-outline-dark" href="product-details.html?id=${encodeURIComponent(item.id)}">ดูรายละเอียด</a>
                <button class="btn btn-dark" type="button" data-add-to-cart="${esc(item.id)}" ${disabled ? 'disabled' : ''}>เพิ่มรายการยืม</button>
              </div>
            </div>
          </div>
        </div>`;
    }).join('') || '<div class="col-12"><div class="empty-state">No equipment matched the filters.</div></div>';
  }

  function renderDetails() {
    const root = $('#equipment-detail');
    if (!root) return;
    const id = new URLSearchParams(location.search).get('id');
    const item = equipment.find((entry) => entry.id === id) || equipment[0];
    if (!item) {
      root.innerHTML = '<div class="empty-state">No equipment was found.</div>';
      return;
    }
    const available = Math.max(0, item.totalQuantity - item.maintenanceQuantity);
    const readableType = typeLabel(item.type);
    const availableLabel = availabilityText(item, available);
    const notice = allocationNotice(item.allocationType);
    root.innerHTML = `
      <div class="row gx-4 gx-lg-5 align-items-start">
        <div class="col-md-6"><img class="card-img-top mb-5 mb-md-0 rounded" src="${item.image}" alt="${esc(item.name)}"></div>
        <div class="col-md-6">
          <div class="small mb-1 text-muted">รหัสรายการ: ${esc(item.id)}</div>
          <h1 class="display-6 fw-bolder">${esc(item.name)}</h1>
          <div class="equipment-choice-summary my-4">
            <div><strong>${esc(availableLabel)}</strong></div>
            <div>ประเภท: ${esc(readableType)}</div>
            ${notice ? `<div class="equipment-choice-note">${esc(notice)}</div>` : ''}
          </div>
          <p class="lead">ตรวจชื่ออุปกรณ์และเงื่อนไขก่อนเพิ่มลงรายการยืม</p>
          <div class="d-flex gap-2">
            <button class="btn btn-dark flex-shrink-0" type="button" data-add-to-cart="${esc(item.id)}" ${available <= 0 ? 'disabled' : ''}>
              <i class="bi-cart-fill me-1"></i> เพิ่มรายการยืม
            </button>
            <a class="btn btn-outline-dark" href="index.html">กลับหน้าอุปกรณ์</a>
          </div>
        </div>
      </div>`;
  }

  async function initCatalog() {
    const grid = $('#equipment-grid');
    if (grid) grid.innerHTML = '<div class="col-12 text-center py-5 text-muted">กำลังโหลดอุปกรณ์...</div>';
    const count = $('#catalog-count');
    if (count) count.textContent = '';
    try {
      equipment = await fetchEquipment();
      app.equipment = equipment;
      renderCatalog();
      renderDetails();
      app.updateCartBadge?.();
    } catch (error) {
      const target = $('#equipment-grid') || $('#equipment-detail');
      if (target) target.innerHTML = `<div class="empty-state text-danger">Could not load equipment from Supabase: ${esc(error.message)}</div>`;
    }
  }

  document.addEventListener('input', (event) => {
    if (event.target.matches('#catalog-search, #catalog-type')) renderCatalog();
  });

  app.esc = esc;
  document.addEventListener('DOMContentLoaded', initCatalog);
}());
