(function () {
  const app = window.SimsetBorrow = window.SimsetBorrow || {};
  const STATUS_LABELS = {
    pending: 'รออนุมัติ',
    approved: 'อนุมัติแล้ว',
    ready: 'พร้อมรับอุปกรณ์',
    borrowed: 'กำลังยืม',
    returned: 'คืนแล้ว',
    rejected: 'ไม่อนุมัติ'
  };

  const $ = (selector) => document.querySelector(selector);
  const esc = (value) => (app.esc ? app.esc(value) : String(value ?? ''));

  function render(request) {
    const root = $('#track-result');
    if (!root) return;
    if (!request) {
      root.innerHTML = '<div class="empty-state">ยังไม่พบคำขอ กรุณากรอก Tracking ID</div>';
      return;
    }
    const items = request.items || [];
    root.innerHTML = `
      <div class="card">
        <div class="card-body">
          <div class="d-flex justify-content-between flex-wrap gap-3">
            <div>
              <div class="text-muted small">Tracking ID</div>
              <h2 class="h4">${esc(request.tracking_id)}</h2>
            </div>
            <span class="status-pill status-${esc(request.status)}">${esc(STATUS_LABELS[request.status] || request.status)}</span>
          </div>
          <hr>
          <p class="mb-1"><strong>Purpose:</strong> ${esc(request.purpose || '-')}</p>
          <p class="mb-3"><strong>Created:</strong> ${esc(request.created_at || '-')}</p>
          <div class="list-group">
            ${items.map((item) => `
              <div class="list-group-item d-flex justify-content-between">
                <span>${esc(item.equipment_name)}</span>
                <span>x${Number(item.qty_borrowed || 0)}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>`;
  }

  async function findRequest(id) {
    if (!id) return null;
    const { data, error } = await app.supabase.rpc('get_borrow_request_status', { p_tracking_id: id });
    if (error) throw error;
    return data;
  }

  async function search(id) {
    const root = $('#track-result');
    const btn = $('#track-form [type="submit"]');
    const prevText = btn?.textContent;
    if (btn) { btn.disabled = true; btn.textContent = 'กำลังค้นหา...'; }
    if (root) root.innerHTML = '<div class="empty-state text-muted">กำลังโหลดข้อมูล...</div>';
    try {
      render(await findRequest(id));
    } catch (error) {
      root.innerHTML = `<div class="empty-state text-danger">ค้นหาจาก Supabase ไม่สำเร็จ: ${esc(error.message)}</div>`;
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = prevText; }
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const id = new URLSearchParams(location.search).get('id');
    if (id && $('#track-id')) $('#track-id').value = id;
    if (id) search(id);
    $('#track-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const tracking = document.getElementById('track-id')?.value.trim() || '';
      if (!tracking) {
        const root = $('#track-result');
        if (root) root.innerHTML = '<div class="empty-state text-warning">กรุณาใส่รหัสติดตาม</div>';
        return;
      }
      search(tracking);
    });
  });
}());
