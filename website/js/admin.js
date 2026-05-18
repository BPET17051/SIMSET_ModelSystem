(function () {
  const app = window.SimsetBorrow = window.SimsetBorrow || {};
  const supabase = app.supabase;
  const TAB_STATUSES = ['pending', 'approved', 'ready', 'borrowed'];
  const statusMap = {
    pending: 'รออนุมัติ',
    approved: 'อนุมัติแล้ว',
    ready: 'พร้อมจ่าย',
    borrowed: 'กำลังใช้งาน',
    returned: 'คืนแล้ว',
    rejected: 'ไม่อนุมัติ',
    cancelled: 'ยกเลิก',
    expired: 'หมดอายุ'
  };
  const flow = {
    approved: 'ready',
    ready: 'borrowed',
    borrowed: 'returned'
  };
  const actionMap = {
    pending: [
      { kind: 'approve', label: 'อนุมัติ', className: 'btn-success' },
      { kind: 'reject', label: 'ไม่อนุมัติ', className: 'btn-outline-danger' }
    ],
    approved: [
      { kind: 'status', next: 'ready', label: 'พร้อมจ่าย', className: 'admin-action-ready' },
      { kind: 'cancel', label: 'ยกเลิก', className: 'btn-outline-danger' }
    ],
    ready: [
      { kind: 'status', next: 'borrowed', label: 'จ่ายของ', className: 'admin-action-borrowed' },
      { kind: 'cancel', label: 'ยกเลิก', className: 'btn-outline-danger' }
    ],
    borrowed: [
      { kind: 'status', next: 'returned', label: 'คืนของ', className: 'admin-action-returned' },
      { kind: 'cancel', label: 'ยกเลิก', className: 'btn-outline-danger' }
    ]
  };
  let currentTab = 'pending';
  let currentUser = null;
  let rejectModal = null;

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));

  function friendlyError(error) {
    const message = String(error?.message || '');
    console.error(error);
    if (message.includes('Start date has already passed')) {
      return 'วันยืมเลยแล้ว กรุณา Reject และให้ผู้ยืมยื่นใหม่';
    }
    if (message.includes('Authentication required') || message.includes('unauthorized')) {
      return 'สิทธิ์ผู้ดูแลระบบไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่';
    }
    if (message.includes('state changed')) {
      return 'สถานะรายการถูกเปลี่ยนแล้ว กรุณาโหลดข้อมูลใหม่';
    }
    return 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง';
  }

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
      return `${esc(name)} x${Number(item.qty_borrowed || 0)}`;
    }).join('<br>');
  }

  function tabLabel(status) {
    if (status === 'pending') return 'รออนุมัติ';
    if (status === 'approved') return 'ต้องเตรียม';
    if (status === 'ready') return 'พร้อมจ่าย';
    if (status === 'borrowed') return 'กำลังใช้งาน';
    return statusMap[status] || status;
  }

  function setKpiValue(key, value) {
    const node = document.querySelector(`[data-kpi="${key}"]`);
    if (node) node.textContent = value;
  }

  async function loadKpis() {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const { data, error } = await supabase.rpc('get_admin_kpis', {
      p_month_start: monthStart.toISOString().slice(0, 10)
    });

    if (error) {
      console.error(error);
      ['pendingAll', 'approvedRate', 'closedNegativeRate', 'avgLeadTime', 'topEquipment'].forEach((key) => setKpiValue(key, '-'));
      return;
    }

    const kpis = data || {};
    setKpiValue('pendingAll', Number(kpis.pending_all || 0));
    setKpiValue('approvedRate', `${Number(kpis.approved_rate || 0)}%`);
    setKpiValue('closedNegativeRate', `${Number(kpis.closed_negative_rate || 0)}%`);
    setKpiValue('avgLeadTime', `${Number(kpis.avg_lead_time_days || 0)} วัน`);
    setKpiValue('topEquipment', kpis.top_equipment_name ? `${kpis.top_equipment_name} (${Number(kpis.top_equipment_qty || 0)})` : '-');
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
      .select('id,tracking_id,borrower_name,borrower_email,purpose,status,created_at,borrow_request_items(qty_borrowed,start_date,end_date,equipments(name_th))')
      .eq('status', status)
      .order('created_at', { ascending: false });

    if (error) {
      console.error(error);
      tbody.innerHTML = '<tr><td colspan="5" class="text-center py-5 text-danger">โหลดข้อมูลไม่สำเร็จ</td></tr>';
      return;
    }

    tbody.innerHTML = (data || []).map((item) => renderRow(item)).join('')
      || `<tr><td colspan="5" class="text-center py-5">ไม่มีรายการในแท็บ "${esc(tabLabel(status))}"</td></tr>`;
  }

  function renderRow(item) {
    const actions = actionMap[item.status] || [];
    const actionButton = actions.length
      ? actions.map((action) => {
        if (action.kind === 'approve') {
          return `<button class="btn btn-sm ${action.className}" type="button" data-approve-request="${esc(item.id)}">${esc(action.label)}</button>`;
        }
        if (action.kind === 'reject') {
          return `<button class="btn btn-sm ${action.className}" type="button" data-reject-request="${esc(item.id)}">${esc(action.label)}</button>`;
        }
        if (action.kind === 'cancel') {
          return `<button class="btn btn-sm ${action.className}" type="button" data-cancel-admin-request="${esc(item.id)}">${esc(action.label)}</button>`;
        }
        return `<button class="btn admin-action-btn ${action.className}" type="button" data-update-status="${esc(item.id)}:${esc(item.status)}:${esc(action.next)}">${esc(action.label)}</button>`;
      }).join(' ')
      : '<span class="text-muted small">ไม่มีงานต่อ</span>';
    const resendButton = ['approved', 'rejected'].includes(item.status)
      ? `<button class="btn btn-sm btn-outline-secondary mt-2" type="button" data-resend-notification="${esc(item.id)}:${esc(item.status)}">ส่งอีเมลอีกครั้ง</button>`
      : '';

    return `
      <tr>
        <td><a href="track.html?id=${encodeURIComponent(item.tracking_id)}">${esc(item.tracking_id)}</a><div class="small text-muted">${esc(statusMap[item.status] || item.status)}</div></td>
        <td>${esc(item.borrower_name || '-')}<div class="small text-muted">${esc(item.borrower_email || '-')}</div></td>
        <td>${esc(parseDepartment(item))}</td>
        <td>${formatItems(item)}</td>
        <td class="text-end">${actionButton}${resendButton}</td>
      </tr>`;
  }

  async function triggerNotification(requestId, type, force = false) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error('Authentication required');

    const response = await fetch(`${app.apiBaseUrl}/api/notifications/borrow-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ request_id: requestId, type, force })
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(detail || 'Notification failed');
    }

    return response.json();
  }

  async function approveRequest(id) {
    if (!confirm('ยืนยันอนุมัติคำขอนี้?')) return;

    const { data, error } = await supabase.rpc('admin_approve_request', { p_request_id: id });
    if (error) {
      alert(friendlyError(error));
      return;
    }
    if (!data) {
      alert('สถานะถูกเปลี่ยนไปแล้ว กรุณาโหลดข้อมูลใหม่');
      await loadData(currentTab);
      return;
    }

    try {
      await triggerNotification(id, 'approved');
    } catch (error) {
      console.error(error);
      alert('อนุมัติสำเร็จ แต่ส่งอีเมลไม่สำเร็จ สามารถกดส่งอีเมลอีกครั้งได้');
    }

    await Promise.all([loadData(currentTab), loadKpis()]);
  }

  function openRejectModal(id) {
    document.querySelector('#reject-request-id').value = id;
    document.querySelector('#reject-reason-detail').value = '';
    rejectModal?.show();
  }

  async function rejectRequest(event) {
    event.preventDefault();
    const id = document.querySelector('#reject-request-id')?.value || '';
    const reasonCode = document.querySelector('#reject-reason-code')?.value || '';
    const detail = document.querySelector('#reject-reason-detail')?.value.trim() || '';
    const reason = [reasonCode, detail].filter(Boolean).join(' - ');

    const { data, error } = await supabase.rpc('admin_reject_request', {
      p_request_id: id,
      p_reason: reason
    });

    if (error) {
      alert(friendlyError(error));
      return;
    }
    if (!data) {
      alert('สถานะถูกเปลี่ยนไปแล้ว กรุณาโหลดข้อมูลใหม่');
      await loadData(currentTab);
      return;
    }

    rejectModal?.hide();
    try {
      await triggerNotification(id, 'rejected');
    } catch (notificationError) {
      console.error(notificationError);
      alert('ไม่อนุมัติสำเร็จ แต่ส่งอีเมลไม่สำเร็จ สามารถกดส่งอีเมลอีกครั้งได้');
    }

    await Promise.all([loadData(currentTab), loadKpis()]);
  }

  async function cancelAdminRequest(id) {
    const reason = window.prompt('ระบุเหตุผลการยกเลิก', 'Cancelled by admin');
    if (reason === null) return;

    const { data, error } = await supabase.rpc('admin_cancel_request', {
      p_request_id: id,
      p_reason: reason
    });

    if (error) {
      alert(friendlyError(error));
      return;
    }
    if (!data) {
      alert('สถานะถูกเปลี่ยนไปแล้ว กรุณาโหลดข้อมูลใหม่');
      await loadData(currentTab);
      return;
    }

    alert('ยกเลิกคำร้องแล้ว');
    await Promise.all([loadData(currentTab), loadKpis()]);
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
      alert(friendlyError(error));
      return;
    }

    if (!data) {
      alert('สถานะถูกเปลี่ยนไปแล้ว กรุณาโหลดข้อมูลใหม่');
      await loadData(currentTab);
      return;
    }

    await Promise.all([loadData(currentTab), loadKpis()]);
  }

  async function resendNotification(value) {
    const [id, type] = value.split(':');
    try {
      await triggerNotification(id, type, true);
      alert('ส่งอีเมลอีกครั้งแล้ว');
    } catch (error) {
      alert(friendlyError(error));
    }
  }

  document.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-admin-tab]');
    if (tab) {
      const status = tab.getAttribute('data-admin-tab');
      if (TAB_STATUSES.includes(status)) loadData(status);
      return;
    }

    const approve = event.target.closest('[data-approve-request]');
    if (approve) {
      approveRequest(approve.getAttribute('data-approve-request'));
      return;
    }

    const reject = event.target.closest('[data-reject-request]');
    if (reject) {
      openRejectModal(reject.getAttribute('data-reject-request'));
      return;
    }

    const adminCancel = event.target.closest('[data-cancel-admin-request]');
    if (adminCancel) {
      cancelAdminRequest(adminCancel.getAttribute('data-cancel-admin-request'));
      return;
    }

    const resend = event.target.closest('[data-resend-notification]');
    if (resend) {
      resendNotification(resend.getAttribute('data-resend-notification'));
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
    document.querySelector('#reject-form')?.addEventListener('submit', rejectRequest);
    const modalEl = document.querySelector('#reject-modal');
    if (modalEl && window.bootstrap?.Modal) rejectModal = new window.bootstrap.Modal(modalEl);
    if (await requireAdmin()) {
      await Promise.all([loadKpis(), loadData('pending')]);
    }
  });
}());
