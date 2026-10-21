(function () {
  const app = window.SimsetBorrow = window.SimsetBorrow || {};
  let equipment = [];
  let sortKey = 'name';
  let viewMode = 'grid';
  const PAGE_SIZE = 24;
  let visibleCount = PAGE_SIZE;
  const compareIds = new Set();

  const $ = (selector) => document.querySelector(selector);
  const esc = app.esc;

  function detectType(item) {
    // T17: category/type must come from the source field; never infer it from a name.
    return String(item.model_type || item.category || item.type || '').trim();
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
    return labels[normalized] || type || '';
  }

  function normalize(item) {
    const type = detectType(item);
    return {
      id: item.id,
      sourceTeamCode: item.source_team_code || '',
      name: item.name_th || item.name_en || 'Unnamed equipment',
      type,
      modelType: String(item.model_type || '').trim(),
      category: String(item.category || '').trim(),
      modelId: String(item.model_id || '').trim(),
      hasRealImage: Boolean(safeImageUrl(item.image_url)),
      totalQuantity: Number(item.total_quantity || 0),
      maintenanceQuantity: Number(item.maintenance_quantity || 0),
      allocationType: item.allocation_type || 'rotating',
      inventoryMode: item.inventory_mode || 'quantity_only',
      fallbackImage: imageUrl(item, typeLabel(type)),
      image: safeImageUrl(item.image_url) || imageUrl(item, typeLabel(type)),
      availableQuantity: null,
      hasLinkedManikin: null
    };
  }

  function requestedDates() {
    const today = new Date().toISOString().slice(0, 10);
    const start = $('#catalog-start-date')?.value || today;
    const end = $('#catalog-end-date')?.value || start;
    const dates = { start, end };
    localStorage.setItem('simset.borrow.dates.v1', JSON.stringify(dates));
    return dates;
  }

  async function fetchAvailability(items) {
    const { start, end } = requestedDates();
    if (end < start) throw new Error('วันที่คืนต้องไม่ก่อนวันที่รับ');
    const { data, error } = await app.supabase.rpc('get_borrow_availability', {
      p_start_date: start, p_end_date: end, p_equipment_ids: items.map((item) => item.id)
    });
    if (error) throw error;
    const byId = new Map((data || []).map((row) => [String(row.equipment_id), Number(row.available_qty || 0)]));
    items.forEach((item) => { item.availableQuantity = Math.max(0, byId.get(String(item.id)) ?? 0); });
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
      ? 'id,name_th,name_en,type,source_team_code,total_quantity,maintenance_quantity,allocation_type,inventory_mode,image_url'
      : 'id,name_th,name_en,type,source_team_code,total_quantity,maintenance_quantity,allocation_type,inventory_mode';
    const { data, error } = await app.supabase
      .from('equipments')
      .select(columns)
      .order('name_th', { ascending: true })
      .limit(100);
    if (error) throw error;
    return data.map(normalize);
  }

  async function fetchPublicManikinNames(equipmentId) {
    if (!equipmentId || !app.supabase || !app.features?.publicEquipmentManikinNames) return [];
    const { data, error } = await app.supabase.rpc('get_public_equipment_manikins', {
      p_equipment_id: equipmentId
    });
    if (error || !Array.isArray(data)) return [];
    return data
      .map((entry) => ({
        name: String(entry?.display_name || '').trim(),
        count: Number(entry?.count || 0)
      }))
      .filter((entry) => entry.name);
  }

  function activeType() {
    return document.querySelector('#catalog-filter .sb-pill.active')?.dataset.type || 'all';
  }

  function renderCategoryNavigation() {
    const root = $('#catalog-filter');
    if (!root) return;
    const categories = [...new Set(equipment.map((item) => typeLabel(item.type)).filter(Boolean))];
    root.innerHTML = ['ทั้งหมด', ...categories].map((label, index) => `<button class="sb-pill ${index === 0 ? 'active' : ''}" data-type="${esc(index === 0 ? 'all' : label)}" type="button">${esc(label)}</button>`).join('');
  }

  function availableOf(item) {
    return item.availableQuantity == null
      ? Math.max(0, item.totalQuantity - item.maintenanceQuantity)
      : item.availableQuantity;
  }

  function sortItems(items) {
    // ponytail: sort and paging run in memory over the full list; fine for a few hundred rows. Move both into the RPC beyond that.
    const byName = (a, b) => a.name.localeCompare(b.name, 'th');
    if (sortKey === 'available') return items.sort((a, b) => availableOf(b) - availableOf(a) || byName(a, b));
    if (sortKey === 'type') return items.sort((a, b) => typeLabel(a.type).localeCompare(typeLabel(b.type), 'th') || byName(a, b));
    return items.sort(byName);
  }

  function setViewButtons() {
    document.querySelectorAll('[data-view]').forEach((button) => {
      const on = button.dataset.view === viewMode;
      button.classList.toggle('active', on);
      button.setAttribute('aria-pressed', String(on));
    });
  }

  function renderCatalog() {
    const grid = $('#equipment-grid');
    if (!grid) return;
    const query = ($('#catalog-search')?.value || '').trim().toLowerCase();
    const type = activeType();
    const filtered = sortItems(equipment
      .filter((item) => !(item.sourceTeamCode === 'BLS_ADULT_QCPR' && item.hasLinkedManikin === false))
      .filter((item) => type === 'all' || item.type === type || typeLabel(item.type) === type)
      .filter((item) => !query || `${item.name} ${item.id} ${item.type} ${typeLabel(item.type)}`.toLowerCase().includes(query)));
    const visible = filtered.slice(0, visibleCount);

    const count = $('#catalog-count');
    if (count) count.textContent = `${filtered.length} รายการ`;
    grid.classList.toggle('is-list', viewMode === 'list');
    setViewButtons();

    grid.innerHTML = visible.map((item) => {
      const available = availableOf(item);
      const disabled = available <= 0;
      const readableType = typeLabel(item.type);
      const availableLabel = borrowerAvailabilityText(available);
      const notice = borrowerRestrictionText(item.allocationType);
      return `
        <div class="col mb-5">
          <div class="card h-100 equipment-card${disabled ? ' is-unavailable' : ''}">
            <div class="equipment-card-media">
              <img class="card-img-top" src="${item.image}" alt="${esc(item.name)}" loading="lazy" data-fallback-src="${item.fallbackImage}">
              <span class="stock-pill ${disabled ? 'is-out' : 'is-ready'}">${esc(availableLabel)}</span>
              ${readableType ? `<span class="type-chip">${esc(readableType)}</span>` : ''}
            </div>
            <div class="card-body p-4">
              <div class="equipment-card-info">
                <h5 class="fw-bolder equipment-card-title">${esc(item.name)}</h5>
                ${item.modelId ? `<div class="small text-muted">Model ID: ${esc(item.modelId)}</div>` : ''}
                ${notice ? `<div class="equipment-choice-note">${esc(notice)}</div>` : ''}
              </div>
              <label class="small text-muted mt-auto"><input type="checkbox" class="form-check-input me-1" data-compare-id="${esc(item.id)}" ${compareIds.has(item.id) ? 'checked' : ''}> เปรียบเทียบรุ่นนี้</label>
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
    if (filtered.length > visible.length) {
      grid.insertAdjacentHTML('beforeend', `<div class="col-12 text-center mb-5"><button class="btn btn-outline-dark" type="button" id="catalog-load-more">แสดงเพิ่ม (${filtered.length - visible.length} รายการ)</button></div>`);
    }
  }

  function renderCompare() {
    const open = $('#compare-open');
    const count = $('#compare-count');
    const drawer = $('#compare-drawer');
    if (count) count.textContent = String(compareIds.size);
    if (open) open.disabled = compareIds.size < 2;
    if (!drawer || compareIds.size < 2) { if (drawer) drawer.hidden = true; return; }
    const rows = [...compareIds].map((id) => equipment.find((item) => item.id === id)).filter(Boolean).slice(0, 3);
    drawer.hidden = false;
    drawer.innerHTML = `<div class="d-flex justify-content-between align-items-center mb-2"><strong>เปรียบเทียบอุปกรณ์</strong><button type="button" class="btn-close" data-compare-close aria-label="ปิด"></button></div><div class="compare-grid">${rows.map((item) => { const available = item.availableQuantity ?? Math.max(0, item.totalQuantity - item.maintenanceQuantity); return `<div class="compare-item"><strong>${esc(item.name)}</strong><span class="small text-muted">${esc(typeLabel(item.type))}</span><div class="mt-2"><span class="status-pill ${available > 0 ? 'status-ready' : 'status-pending'}">${esc(borrowerAvailabilityText(available))}</span></div><a class="btn btn-outline-dark btn-sm mt-3" href="product-details.html?id=${encodeURIComponent(item.id)}">ดูรายละเอียด</a></div>`; }).join('')}</div>`;
  }

  async function renderDetails() {
    const root = $('#equipment-detail');
    if (!root) return;
    const id = new URLSearchParams(location.search).get('id');
    const item = equipment.find((entry) => entry.id === id) || equipment[0];
    if (!item) {
      root.innerHTML = '<div class="empty-state">ไม่พบข้อมูลอุปกรณ์</div>';
      return;
    }
    const available = item.availableQuantity == null
      ? Math.max(0, item.totalQuantity - item.maintenanceQuantity)
      : item.availableQuantity;
    const readableType = typeLabel(item.type);
    const availableLabel = availabilityText(item, available);
    const notice = allocationNotice(item.allocationType);
    const manikinNames = item.inventoryMode === 'manikin'
      ? await fetchPublicManikinNames(item.id)
      : [];
    const primaryDisplayName = manikinNames.length === 1 ? manikinNames[0].name : item.name;
    const nameList = manikinNames.length
      ? `<div class="equipment-db-names mt-3">
          <div class="small text-muted mb-2">ชื่อหุ่นในฐานข้อมูล</div>
          ${manikinNames.map((entry) => `
            <div class="equipment-db-name-row">
              <span>${esc(entry.name)}</span>
              ${entry.count > 1 ? `<span class="text-muted">มี ${entry.count} ตัว</span>` : ''}
            </div>
          `).join('')}
        </div>`
      : '';
    root.innerHTML = `
      <div class="row gx-4 gx-lg-5 align-items-start product-detail-layout">
        <div class="col-lg-7"><div class="product-gallery"><img class="card-img-top mb-4 rounded" src="${item.image}" alt="${esc(item.name)}" data-fallback-src="${item.fallbackImage}">${item.hasRealImage ? '<div class="small text-muted">ภาพจาก URL ที่ระบุในข้อมูลอุปกรณ์</div>' : ''}</div></div>
        <div class="col-lg-5"><div class="product-booking-panel">
          <div class="small mb-2 text-muted">รายละเอียดอุปกรณ์</div>
          <h1 class="display-6 fw-bolder">${esc(primaryDisplayName)}</h1>
          ${manikinNames.length === 1 && primaryDisplayName !== item.name ? `<div class="text-muted mt-2">รายการยืม: ${esc(item.name)}</div>` : ''}
          ${item.modelId ? `<div class="small text-muted mt-2">Model ID: ${esc(item.modelId)}</div>` : ''}
          <div class="equipment-choice-summary my-4">
            <div><strong>${esc(availableLabel)}</strong></div>
            ${readableType ? `<div>ประเภท: ${esc(readableType)}</div>` : ''}
            ${notice ? `<div class="equipment-choice-note">${esc(notice)}</div>` : ''}
            ${nameList}
          </div>
          <p class="lead">ตรวจชื่ออุปกรณ์และเงื่อนไขก่อนเพิ่มลงรายการยืม</p>
          <div class="d-flex gap-2">
            <button class="btn btn-brand flex-shrink-0" type="button" data-add-to-cart="${esc(item.id)}" ${available <= 0 ? 'disabled' : ''}>
              <i class="bi-cart-fill me-1"></i> เพิ่มรายการยืม
            </button>
            <a class="btn btn-outline-dark" href="index.html">กลับหน้าอุปกรณ์</a>
          </div>
        </div></div>
      </div>`;
  }

  async function initCatalog() {
    const grid = $('#equipment-grid');
    if (grid) grid.innerHTML = '<div class="col-12 text-center py-5 text-muted">กำลังโหลดอุปกรณ์...</div>';
    const count = $('#catalog-count');
    if (count) count.textContent = '';
    try {
      equipment = await fetchEquipment();
      await fetchAvailability(equipment);
      renderCategoryNavigation();
      if (app.features?.publicEquipmentManikinNames) {
        await Promise.all(equipment
          .filter((item) => item.sourceTeamCode === 'BLS_ADULT_QCPR')
          .map(async (item) => { item.hasLinkedManikin = (await fetchPublicManikinNames(item.id)).length > 0; }));
      }
      app.equipment = equipment;
      renderCatalog();
      renderCompare();
      await renderDetails();
      app.updateCartBadge?.();
    } catch (error) {
      const target = $('#equipment-grid') || $('#equipment-detail');
      if (target) target.innerHTML = `<div class="empty-state text-danger" role="alert">โหลดข้อมูลอุปกรณ์ไม่สำเร็จ: ${esc(error.message)}<button class="btn btn-sm btn-outline-dark mt-3" type="button" id="catalog-retry">ลองใหม่</button></div>`;
    }
  }

  document.addEventListener('input', (event) => {
    if (event.target.matches('#catalog-search')) { visibleCount = PAGE_SIZE; renderCatalog(); }
    if (event.target.matches('#catalog-start-date, #catalog-end-date')) refreshAvailability();
  });

  document.addEventListener('change', (event) => {
    const checkbox = event.target.closest('[data-compare-id]');
    if (!checkbox) return;
    const id = checkbox.dataset.compareId;
    if (checkbox.checked && compareIds.size >= 3) { checkbox.checked = false; return; }
    checkbox.checked ? compareIds.add(id) : compareIds.delete(id);
    renderCompare();
  });
  document.addEventListener('click', (event) => {
    if (event.target.closest('#compare-open')) renderCompare();
    if (event.target.closest('[data-compare-close]')) { const drawer = $('#compare-drawer'); if (drawer) drawer.hidden = true; }
  });

  async function refreshAvailability() {
    try {
      await fetchAvailability(equipment);
      renderCatalog();
      await renderDetails();
    } catch (error) {
      const target = $('#equipment-grid') || $('#equipment-detail');
      if (target) target.innerHTML = `<div class="empty-state text-danger" role="alert">${esc(error.message)}</div>`;
    }
  }

  document.addEventListener('click', (event) => {
    if (event.target.closest('#catalog-retry')) initCatalog();
  });

  document.addEventListener('click', (event) => {
    const pill = event.target.closest('#catalog-filter .sb-pill');
    if (!pill) return;
    document.querySelectorAll('#catalog-filter .sb-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    visibleCount = PAGE_SIZE;
    renderCatalog();
  });

  document.addEventListener('change', (event) => {
    if (!event.target.matches('#catalog-sort')) return;
    sortKey = event.target.value;
    visibleCount = PAGE_SIZE;
    renderCatalog();
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('#catalog-load-more')) return;
    visibleCount += PAGE_SIZE;
    renderCatalog();
  });

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-view]');
    if (!button) return;
    viewMode = button.dataset.view === 'list' ? 'list' : 'grid';
    try { localStorage.setItem('simset.catalog.view.v1', viewMode); } catch { /* private mode: keep the in-memory choice */ }
    renderCatalog();
  });

  document.addEventListener('error', (event) => {
    const image = event.target.closest?.('img[data-fallback-src]');
    if (!image || image.dataset.fallbackApplied) return;
    image.dataset.fallbackApplied = 'true';
    image.src = image.dataset.fallbackSrc;
  }, true);

  document.addEventListener('DOMContentLoaded', () => {
    const today = new Date().toISOString().slice(0, 10);
    const end = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    if ($('#catalog-start-date')) $('#catalog-start-date').value = today;
    if ($('#catalog-end-date')) $('#catalog-end-date').value = end;
    try { viewMode = localStorage.getItem('simset.catalog.view.v1') === 'list' ? 'list' : 'grid'; } catch { /* default grid */ }
    initCatalog();
  });
}());
