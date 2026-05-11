(function () {
  const app = window.SimsetBorrow = window.SimsetBorrow || {};
  const supabase = app.supabase;
  const TAB_STATUSES = ['approved', 'ready', 'borrowed'];
  const statusMap = {
    pending: 'รออนุมัติ',
    approved: 'อนุมัติแล้ว',
    ready: 'พร้อมจ่าย',
    borrowed: 'กำลังใช้งาน',
    returned: 'คืนแล้ว',
    rejected: 'ไม่อนุมัติ'
  };
  const flow = {
    pending: 'approved',
    approved: 'ready',
    ready: 'borrowed',
    borrowed: 'returned'
  };
  const actionMap = {
    approved: { next: 'ready', label: 'พร้อมจ่าย', className: 'admin-action-ready' },
    ready: { next: 'borrowed', label: 'จ่ายของ', className: 'admin-action-borrowed' },
    borrowed: { next: 'returned', label: 'คืนของ', className: 'admin-action-returned' }
  };
  let currentTab = 'approved';
  let currentUser = null;

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));

  function canGo(current, next) {
    return flow[current] === next;
  }

  function setAuthState(message, tone = 'muted') {
    const authState = document.querySelector('#admin-auth-state');
    if (!authState) return;
    authState.textContent = message;
    authState.classList.toggle('text-danger', tone === 'danger');
    authState.classList.toggle('text-success', tone === 'success');
  }

  function buildLoginUrl(error) {
    const params = new URLSearchParams({ next: 'admin.html' });
    if (error) params.set('error', error);
    return `admin-login.html?${params.toString()}`;
  }

  async function requireAdmin() {
    setAuthState('กำลังตรวจสอบสิทธิ์ผู้ดูแลระบบ...');
    const { data, error } = await supabase.auth.getSession();

    if (error || !data.session) {
      window.location.href = buildLoginUrl();
      return false;
    }

    currentUser = data.session.user;
    if (currentUser.app_metadata?.role !== 'admin') {
      await supabase.auth.signOut();
      window.location.href = buildLoginUrl('unauthorized');
      return false;
    }

    const emailEl = document.querySelector('#admin-user-email');
    if (emailEl) emailEl.textContent = currentUser.email || 'Admin';

    const logoutButton = document.querySelector('#admin-logout');
    if (logoutButton) logoutButton.hidden = false;

    setAuthState('ยืนยันสิทธิ์ admin แล้ว', 'success');
    return true;
  }

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = 'admin-login.html';
  }

  function parseDepartment(row) {
    const purpose = String(row.purpose || '');
    const match = purpose.match(/หน่วยงาน:\s*([^|]+)/);
    return match ? match[1].trim() : '-';
  }

  function formatItems(row) {
    const items = row.borrow_request_items || [];
    if (!items.length) return '-';
    return items.map((item) => {
      const name = item.equipments?.name_th || 'อุปกรณ์';
      return `${name} x${Number(item.qty_borrowed || 0)}`;
    }).join('<br>');
  }

  async function loadData(status = currentTab) {
    currentTab = status;
    const tbody = document.querySelector('#admin-requests');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-5">กำลังโหลดจาก Supabase...</td></tr>';
    document.querySelectorAll('[data-admin-tab]').forEach((button) => {
      button.classList.toggle('is-active', button.getAttribute('data-admin-tab') === status);
    });

    const { data, error } = await supabase
      .from('borrow_requests')
      .select('id,tracking_id,borrower_name,purpose,status,created_at,borrow_request_items(qty_borrowed,equipments(name_th))')
      .eq('status', status)
      .order('created_at', { ascending: false });

    if (error) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center py-5 text-danger">โหลดข้อมูลไม่สำเร็จ: ${esc(error.message)}</td></tr>`;
      return;
    }

    tbody.innerHTML = (data || []).map((item) => renderRow(item)).join('')
      || `<tr><td colspan="5" class="text-center py-5">ไม่มีรายการในแท็บ "${esc(tabLabel(status))}"</td></tr>`;
  }

  function tabLabel(status) {
    if (status === 'approved') return 'ต้องเตรียม';
    if (status === 'ready') return 'พร้อมจ่าย';
    if (status === 'borrowed') return 'กำลังใช้งาน';
    return statusMap[status] || status;
  }

  function renderRow(item) {
    const action = actionMap[item.status];
    const actionButton = action
      ? `<button class="btn admin-action-btn ${action.className}" type="button" data-update-status="${esc(item.id)}:${esc(item.status)}:${esc(action.next)}">${esc(action.label)}</button>`
      : '<span class="text-muted small">ไม่มีงานต่อ</span>';

    return `
      <tr>
        <td><a href="track.html?id=${encodeURIComponent(item.tracking_id)}">${esc(item.tracking_id)}</a><div class="small text-muted">${esc(statusMap[item.status] || item.status)}</div></td>
        <td>${esc(item.borrower_name || '-')}</td>
        <td>${esc(parseDepartment(item))}</td>
        <td>${formatItems(item)}</td>
        <td class="text-end">${actionButton}</td>
      </tr>`;
  }

  async function updateStatus(id, currentStatus, nextStatus) {
    if (!canGo(currentStatus, nextStatus)) {
      alert('ลำดับสถานะไม่ถูกต้อง');
      return;
    }

    if (!confirm('ยืนยันการดำเนินการ?')) return;

    const { data, error } = await supabase.rpc('admin_update_borrow_request_status', {
      p_request_id: id,
      p_current_status: currentStatus,
      p_next_status: nextStatus
    });

    if (error) {
      alert('อัปเดตไม่สำเร็จ');
      console.error(error);
      return;
    }

    if (!data) {
      alert('สถานะถูกเปลี่ยนไปแล้ว กรุณาโหลดข้อมูลใหม่');
      await loadData(currentTab);
      return;
    }

    alert('อัปเดตสำเร็จ');
    await loadData(currentTab);
  }

  document.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-admin-tab]');
    if (tab) {
      const status = tab.getAttribute('data-admin-tab');
      if (TAB_STATUSES.includes(status)) loadData(status);
      return;
    }

    const action = event.target.closest('[data-update-status]');
    if (!action) return;
    const [id, currentStatus, nextStatus] = action.getAttribute('data-update-status').split(':');
    updateStatus(id, currentStatus, nextStatus);
  });

  window.updateStatus = updateStatus;
  window.loadData = loadData;
  document.addEventListener('DOMContentLoaded', async () => {
    document.querySelector('#admin-logout')?.addEventListener('click', logout);
    if (await requireAdmin()) await loadData('approved');
  });
}());
