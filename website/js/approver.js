(function () {
  const app = window.SimsetBorrow = window.SimsetBorrow || {};
  const supabase = app.supabase;

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));

  function showMessage(type, text) {
    const message = document.getElementById('approver-message');
    if (!message) return;
    message.className = `alert alert-${type}`;
    message.textContent = text;
  }

  function setAuthState(text, tone = 'muted') {
    const node = document.getElementById('approver-auth-state');
    if (!node) return;
    node.textContent = text;
    node.classList.toggle('text-danger', tone === 'danger');
    node.classList.toggle('text-success', tone === 'success');
  }

  function setLoginLink() {
    const node = document.getElementById('approver-auth-state');
    if (!node) return;
    node.innerHTML = '<a class="btn btn-outline-danger" href="admin-login.html?next=approver.html">เข้าสู่ระบบ</a>';
    node.classList.remove('text-danger', 'text-success');
  }

  async function requireApprover() {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) {
      setLoginLink();
      return false;
    }
    const role = data.session.user?.app_metadata?.role;
    if (!['approver_l1', 'admin'].includes(role)) {
      setAuthState('บัญชีนี้ไม่มีสิทธิ์อนุมัติ L1', 'danger');
      return false;
    }
    setAuthState(`Signed in: ${data.session.user.email}`, 'success');
    const logoutButton = document.getElementById('approver-logout');
    if (logoutButton) logoutButton.hidden = false;
    return true;
  }

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = 'admin-login.html?next=approver.html';
  }

  function itemList(items) {
    return (items || []).map((item) => `<li>${esc(item.equipment_name)} ${item.manikin_sap_id ? `(${esc(item.manikin_sap_id)})` : ''} x${Number(item.qty_borrowed || 1)}</li>`).join('');
  }

  function renderQueue(rows) {
    const root = document.getElementById('approval-queue');
    const focusCount = document.getElementById('approval-focus-count');
    const safeRows = Array.isArray(rows) ? rows : [];
    if (focusCount) focusCount.textContent = safeRows.length;
    if (!root) return;
    root.innerHTML = safeRows.length ? safeRows.map((row) => `
      <article class="approval-card">
        <div class="d-flex justify-content-between gap-3 flex-wrap">
          <div>
            <h2>${esc(row.tracking_id)}</h2>
            <p class="text-muted mb-0">${esc(row.department || '-')} · ${esc(row.borrower_name || '-')}</p>
          </div>
          <span class="status-pill status-pending">รออนุมัติ</span>
        </div>
        <p class="mt-3 mb-2">${esc(row.purpose || '-')}</p>
        <ul>${itemList(row.items)}</ul>
        <div class="work-continuity-cue">
          <strong>ขั้นตอนถัดไป</strong>
          <span>ตรวจรายการ แล้วเลือก Approve หรือกรอกเหตุผลก่อน Reject</span>
        </div>
        <label class="form-label mt-2">เหตุผลเมื่อปฏิเสธ</label>
        <textarea class="form-control form-control-sm" rows="2" data-reject-reason="${esc(row.id)}"></textarea>
        <div class="d-flex gap-2 mt-3 flex-wrap">
          <button class="btn btn-success" type="button" data-approval-action="approve:${esc(row.id)}">Approve</button>
          <button class="btn btn-outline-danger" type="button" data-approval-action="reject:${esc(row.id)}">Reject</button>
        </div>
      </article>
    `).join('') : '<div class="empty-state bg-white">ไม่มี Order รออนุมัติ</div>';
  }

  async function loadQueue() {
    const root = document.getElementById('approval-queue');
    if (root) root.innerHTML = '<div class="empty-state">กำลังโหลดรายการ...</div>';
    const { data, error } = await supabase.rpc('get_l1_approval_queue');
    if (error) throw error;
    renderQueue(data);
  }

  async function decide(action, requestId) {
    const reason = document.querySelector(`[data-reject-reason="${CSS.escape(requestId)}"]`)?.value.trim() || '';
    if (action === 'reject' && !reason) {
      showMessage('warning', 'กรุณากรอกเหตุผลก่อน Reject');
      return;
    }
    const { error } = await supabase.rpc('approver_l1_decide_request', {
      p_request_id: requestId,
      p_decision: action,
      p_reason: reason || null
    });
    if (error) throw error;
    showMessage('success', action === 'approve' ? 'อนุมัติแล้ว' : 'ปฏิเสธแล้ว');
    await loadQueue();
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-approval-action]');
    if (!button) return;
    const [action, requestId] = button.getAttribute('data-approval-action').split(':');
    decide(action, requestId).catch((error) => showMessage('danger', error.message));
  });

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      document.getElementById('approver-logout')?.addEventListener('click', logout);
      if (!(await requireApprover())) return;
      await loadQueue();
    } catch (error) {
      showMessage('danger', error.message);
    }
  });
}());
