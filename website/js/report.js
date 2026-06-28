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
    const message = document.getElementById('report-message');
    if (!message) return;
    message.className = `alert alert-${type}`;
    message.textContent = text;
  }

  function setState(text, tone = 'muted') {
    const node = document.getElementById('report-auth-state');
    if (!node) return;
    node.textContent = text;
    node.classList.toggle('text-danger', tone === 'danger');
    node.classList.toggle('text-success', tone === 'success');
  }

  async function requireReportRole() {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) {
      setState('ต้องเข้าสู่ระบบ', 'danger');
      return false;
    }
    const role = data.session.user?.app_metadata?.role;
    if (!['admin', 'approver_l1'].includes(role)) {
      setState('บัญชีนี้ไม่มีสิทธิ์ดู Report', 'danger');
      return false;
    }
    setState(`Signed in: ${data.session.user.email}`, 'success');
    return true;
  }

  function setText(id, text) {
    const node = document.getElementById(id);
    if (node) node.textContent = text;
  }

  function renderMonthlyChart(rows) {
    const root = document.getElementById('monthly-chart');
    if (!root) return;
    const safeRows = Array.isArray(rows) ? rows : [];
    const max = Math.max(...safeRows.map((row) => Number(row.order_count || 0)), 1);
    root.innerHTML = safeRows.length
      ? safeRows.map((row) => {
        const value = Number(row.order_count || 0);
        const height = Math.max(8, Math.round((value / max) * 160));
        return `
          <div class="month-bar">
            <div class="month-bar-value" style="height:${height}px">${value}</div>
            <span>${esc(row.month)}</span>
          </div>`;
      }).join('')
      : '<div class="empty-state">ยังไม่มีข้อมูลรายเดือน</div>';
  }

  function renderTopDepartments(rows) {
    const root = document.getElementById('top-departments');
    if (!root) return;
    const safeRows = Array.isArray(rows) ? rows : [];
    root.innerHTML = safeRows.length
      ? safeRows.map((row) => `
        <li>
          <span>${esc(row.department || '-')}</span>
          <strong>${Number(row.order_count || 0)}</strong>
        </li>`).join('')
      : '<li class="text-muted">ยังไม่มีข้อมูล</li>';
  }

  async function loadReport() {
    const { data, error } = await supabase.rpc('get_kpi_report');
    if (error) throw error;
    setText('kpi-pending', Number(data?.pending_approval_count || 0));
    setText('kpi-overdue', Number(data?.overdue_count || 0));
    setText('kpi-ontime', `${Number(data?.on_time_return_rate || 0)}%`);
    setText('kpi-ready', Number(data?.ready_manikin_count || 0));
    renderMonthlyChart(data?.orders_by_month);
    renderTopDepartments(data?.top_departments);
  }

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      if (!(await requireReportRole())) return;
      await loadReport();
    } catch (error) {
      showMessage('danger', error.message);
    }
  });
}());
