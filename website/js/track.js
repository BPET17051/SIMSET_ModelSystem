(function () {
  const app = window.SimsetBorrow = window.SimsetBorrow || {};
  const STATUS_LABELS = {
    pending: 'รออนุมัติ',
    approved: 'อนุมัติแล้ว',
    ready: 'พร้อมรับอุปกรณ์',
    borrowed: 'กำลังยืม',
    returned: 'คืนแล้ว',
    rejected: 'ไม่อนุมัติ',
    cancelled: 'ยกเลิกแล้ว'
  };

  const $ = (selector) => document.querySelector(selector);
  const esc = (value) => (app.esc ? app.esc(value) : String(value ?? ''));

  function friendlyError(error) {
    const message = String(error?.message || '');
    console.error(error);
    if (message.includes('Tracking ID not found')) return 'ไม่พบรหัสติดตามนี้';
    if (message.includes('Cannot cancel within 1 day')) return 'ไม่สามารถยกเลิกได้ กรุณาติดต่อเจ้าหน้าที่เพื่อยกเลิก';
    return 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง';
  }

  function render(request) {
    const root = $('#track-result');
    if (!root) return;
    if (!request) {
      root.innerHTML = '<div class="empty-state">ยังไม่พบคำขอ กรุณากรอก Tracking ID</div>';
      return;
    }
    const items = request.items || [];
    const cancelAction = request.status === 'pending'
      ? `<button class="btn btn-outline-danger mt-3" type="button" data-cancel-request="${esc(request.tracking_id)}">ยกเลิกคำร้อง</button>`
      : '';
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
          <p class="mb-3"><strong>Created:</strong> ${esc(request.created_at || '-')}</p>
          <div class="list-group">
            ${items.map((item) => `
              <div class="list-group-item d-flex justify-content-between">
                <span>${esc(item.equipment_name)}</span>
                <span>x${Number(item.qty_borrowed || 0)}</span>
              </div>
            `).join('')}
          </div>
          ${cancelAction}
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
    try {
      render(await findRequest(id));
    } catch (error) {
      root.innerHTML = `<div class="empty-state text-danger">${esc(friendlyError(error))}</div>`;
    }
  }

  async function cancelRequest(trackingId) {
    if (!trackingId || !confirm('ยืนยันยกเลิกคำร้องนี้?')) return;
    try {
      const { error } = await app.supabase.rpc('cancel_borrow_request_public', {
        p_tracking_id: trackingId,
        p_reason: 'Cancelled by borrower from tracking page'
      });
      if (error) throw error;
      await search(trackingId);
      alert('ยกเลิกคำร้องแล้ว');
    } catch (error) {
      alert(friendlyError(error));
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
        alert('กรุณาใส่รหัสติดตาม');
        return;
      }
      search(tracking);
    });
    document.addEventListener('click', (event) => {
      const button = event.target.closest('[data-cancel-request]');
      if (!button) return;
      cancelRequest(button.getAttribute('data-cancel-request'));
    });
  });
}());
