(function () {
  const app = window.SimsetBorrow = window.SimsetBorrow || {};
  let equipment = [];

  const $ = (selector) => document.querySelector(selector);
  const esc = app.esc;

  function detectType(item) {
    const text = `${item.name_th || ''} ${item.name_en || ''} ${item.type || ''}`.toLowerCase();
    if (text.includes('infant') || text.includes('baby') || text.includes('neonatal')) return 'Infant';
    if (text.includes('child') || text.includes('junior') || text.includes('pediatric')) return 'Pediatric';
    if (text.includes('adult') || text.includes('anne')) return 'Adult';
    return 'General';
  }

  function visualKind(item) {
    const text = `${item.name_th || ''} ${item.name_en || ''} ${item.type || ''}`.toLowerCase();
    if (text.includes('airway')) return 'airway';
    if (text.includes('flip') || text.includes('chart') || text.includes('board') || text.includes('กระดาน')) return 'board';
    if (text.includes('manikin') || text.includes('bls') || text.includes('cpr') || text.includes('หุ่น')) return 'manikin';
    if (text.includes('kit') || text.includes('box') || text.includes('กล่อง')) return 'kit';
    return 'equipment';
  }

  function visualIcon(kind) {
    const icons = {
      airway: `
        <rect x="128" y="104" width="194" height="128" rx="22" fill="#ffffff" stroke="#0f766e" stroke-width="10"/>
        <path d="M176 104v-18c0-13 10-23 23-23h52c13 0 23 10 23 23v18" fill="none" stroke="#0f766e" stroke-width="10" stroke-linecap="round"/>
        <path d="M194 168h62m-31-31v62" stroke="#14b8a6" stroke-width="14" stroke-linecap="round"/>
        <path d="M275 166c28-11 45 8 31 31-10 16-31 19-47 9" fill="none" stroke="#99f6e4" stroke-width="10" stroke-linecap="round"/>`,
      board: `
        <rect x="138" y="64" width="174" height="128" rx="14" fill="#ffffff" stroke="#0f766e" stroke-width="10"/>
        <path d="M166 103h118M166 134h92M166 165h70" stroke="#99f6e4" stroke-width="10" stroke-linecap="round"/>
        <path d="M225 192v40M177 244l48-52 48 52" stroke="#0f766e" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>`,
      manikin: `
        <circle cx="225" cy="86" r="35" fill="#ffffff" stroke="#0f766e" stroke-width="10"/>
        <path d="M159 231c5-57 31-87 66-87s61 30 66 87" fill="#ffffff" stroke="#0f766e" stroke-width="10" stroke-linecap="round"/>
        <path d="M184 193h29l14-27 21 52 14-25h28" fill="none" stroke="#14b8a6" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>`,
      kit: `
        <rect x="119" y="103" width="212" height="122" rx="24" fill="#ffffff" stroke="#0f766e" stroke-width="10"/>
        <path d="M180 103V84c0-13 10-23 23-23h44c13 0 23 10 23 23v19" fill="none" stroke="#0f766e" stroke-width="10" stroke-linecap="round"/>
        <path d="M196 164h58m-29-29v58" stroke="#14b8a6" stroke-width="14" stroke-linecap="round"/>`,
      equipment: `
        <rect x="145" y="67" width="160" height="180" rx="22" fill="#ffffff" stroke="#0f766e" stroke-width="10"/>
        <path d="M181 116h88M181 151h88M181 186h62" stroke="#99f6e4" stroke-width="10" stroke-linecap="round"/>
        <circle cx="270" cy="211" r="17" fill="#14b8a6"/>`
    };
    return icons[kind] || icons.equipment;
  }

  function imageUrl(item, type) {
    const kind = visualKind(item);
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="450" height="300" viewBox="0 0 450 300" role="img" aria-label="${type}">
        <rect width="450" height="300" fill="#ecfdf5"/>
        <circle cx="68" cy="52" r="82" fill="#ccfbf1" opacity="0.75"/>
        <circle cx="396" cy="262" r="112" fill="#d1fae5" opacity="0.72"/>
        <rect x="36" y="36" width="378" height="228" rx="28" fill="none" stroke="#99f6e4" stroke-width="2"/>
        ${visualIcon(kind)}
      </svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  function safeImageUrl(value) {
    if (!value) return '';
    try {
      const url = new URL(String(value), location.origin);
      return url.protocol === 'https:' ? url.href : '';
    } catch {
      return '';
    }
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
      fallbackImage: imageUrl(item, typeLabel(type)),
      image: safeImageUrl(item.image_url) || imageUrl(item, typeLabel(type))
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

  function borrowerAvailabilityText(available) {
    if (available <= 0) return 'ยังไม่พร้อมให้ยืม';
    return `พร้อมยืม ${available}`;
  }

  function borrowerRestrictionText(allocationType) {
    if (!allocationType || allocationType === 'rotating') return '';
    return allocationHelp(allocationType);
  }

  async function fetchEquipment() {
    if (!app.supabase) throw new Error('Supabase is not available.');
    const columns = app.features?.equipmentImageUrl
      ? 'id,name_th,name_en,type,total_quantity,maintenance_quantity,allocation_type,image_url'
      : 'id,name_th,name_en,type,total_quantity,maintenance_quantity,allocation_type';
    const { data, error } = await app.supabase
      .from('equipments')
      .select(columns)
      .order('name_th', { ascending: true })
      .limit(100);
    if (error) throw error;
    return data.map(normalize);
  }

  function activeType() {
    return document.querySelector('#catalog-filter .sb-pill.active')?.dataset.type || 'all';
  }

  function renderCatalog() {
    const grid = $('#equipment-grid');
    if (!grid) return;
    const query = ($('#catalog-search')?.value || '').trim().toLowerCase();
    const type = activeType();
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
      const availableLabel = borrowerAvailabilityText(available);
      const notice = borrowerRestrictionText(item.allocationType);
      return `
        <div class="col mb-5">
          <div class="card h-100 equipment-card">
            <span class="badge bg-dark text-white position-absolute" style="top: 0.5rem; right: 0.5rem">${esc(readableType)}</span>
            <img class="card-img-top" src="${item.image}" alt="${esc(item.name)}" loading="lazy" data-fallback-src="${item.fallbackImage}">
            <div class="card-body p-4">
              <div class="text-center">
                <h5 class="fw-bolder equipment-card-title">${esc(item.name)}</h5>
                <div class="equipment-choice-summary mt-3">
                  <strong>${esc(availableLabel)}</strong>
                  ${notice ? `<div class="equipment-choice-note mt-2">${esc(notice)}</div>` : ''}
                </div>
              </div>
            </div>
            <div class="card-footer p-4 pt-0 border-top-0 bg-transparent">
              <div class="d-grid gap-2">
                <a class="btn btn-outline-dark" href="product-details.html?id=${encodeURIComponent(item.id)}">ดูรายละเอียด</a>
                <button class="btn btn-brand" type="button" data-add-to-cart="${esc(item.id)}" ${disabled ? 'disabled' : ''}>เพิ่มรายการยืม</button>
              </div>
            </div>
          </div>
        </div>`;
    }).join('') || '<div class="col-12"><div class="empty-state">ไม่พบอุปกรณ์ตามเงื่อนไขที่ค้นหา</div></div>';
  }

  function renderDetails() {
    const root = $('#equipment-detail');
    if (!root) return;
    const id = new URLSearchParams(location.search).get('id');
    const item = equipment.find((entry) => entry.id === id) || equipment[0];
    if (!item) {
      root.innerHTML = '<div class="empty-state">ไม่พบข้อมูลอุปกรณ์</div>';
      return;
    }
    const available = Math.max(0, item.totalQuantity - item.maintenanceQuantity);
    const readableType = typeLabel(item.type);
    const availableLabel = availabilityText(item, available);
    const notice = allocationNotice(item.allocationType);
    root.innerHTML = `
      <div class="row gx-4 gx-lg-5 align-items-start">
        <div class="col-md-6"><img class="card-img-top mb-5 mb-md-0 rounded" src="${item.image}" alt="${esc(item.name)}" data-fallback-src="${item.fallbackImage}"></div>
        <div class="col-md-6">
          <div class="small mb-2 text-muted">รายละเอียดอุปกรณ์</div>
          <h1 class="display-6 fw-bolder">${esc(item.name)}</h1>
          <div class="equipment-choice-summary my-4">
            <div><strong>${esc(availableLabel)}</strong></div>
            <div>ประเภท: ${esc(readableType)}</div>
            ${notice ? `<div class="equipment-choice-note">${esc(notice)}</div>` : ''}
          </div>
          <p class="lead">ตรวจชื่ออุปกรณ์และเงื่อนไขก่อนเพิ่มลงรายการยืม</p>
          <div class="d-flex gap-2">
            <button class="btn btn-brand flex-shrink-0" type="button" data-add-to-cart="${esc(item.id)}" ${available <= 0 ? 'disabled' : ''}>
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
      if (target) target.innerHTML = `<div class="empty-state text-danger">โหลดข้อมูลอุปกรณ์ไม่สำเร็จ: ${esc(error.message)}</div>`;
    }
  }

  document.addEventListener('input', (event) => {
    if (event.target.matches('#catalog-search')) renderCatalog();
  });

  document.addEventListener('click', (event) => {
    const pill = event.target.closest('#catalog-filter .sb-pill');
    if (!pill) return;
    document.querySelectorAll('#catalog-filter .sb-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    renderCatalog();
  });

  document.addEventListener('error', (event) => {
    const image = event.target.closest?.('img[data-fallback-src]');
    if (!image || image.dataset.fallbackApplied) return;
    image.dataset.fallbackApplied = 'true';
    image.src = image.dataset.fallbackSrc;
  }, true);

  document.addEventListener('DOMContentLoaded', initCatalog);
}());
