(function () {
  const app = window.SimsetBorrow = window.SimsetBorrow || {};
  const supabase = app.supabase;
  const params = new URLSearchParams(window.location.search);
  const allowedNextUrls = new Set(['admin.html', '/admin', '/admin.html', 'approver.html', '/approver', '/approver.html', 'staff.html', '/staff', '/staff.html']);
  const nextUrl = params.get('next') || 'admin.html';

  function getSafeNext() {
    return allowedNextUrls.has(nextUrl) ? nextUrl : 'admin.html';
  }

  function getAllowedRoles() {
    const safeNext = getSafeNext();
    if (safeNext.includes('approver')) return ['admin', 'approver_l1'];
    if (safeNext.includes('staff')) return ['admin', 'staff', 'approver_l1'];
    return ['admin'];
  }

  function showError(message) {
    const errorBox = document.querySelector('#admin-login-error');
    if (!errorBox) return;
    errorBox.textContent = message;
    errorBox.hidden = false;
  }

  function setLoading(isLoading) {
    const submit = document.querySelector('#admin-login-submit');
    if (!submit) return;
    submit.disabled = isLoading;
    submit.textContent = isLoading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ';
  }

  async function redirectIfAlreadyAdmin() {
    const { data } = await supabase.auth.getSession();
    const role = data.session?.user?.app_metadata?.role;
    if (getAllowedRoles().includes(role)) window.location.href = getSafeNext();
  }

  async function handleLogin(event) {
    event.preventDefault();
    const email = document.querySelector('#admin-email')?.value.trim();
    const password = document.querySelector('#admin-password')?.value;

    if (!email) {
      showError('กรุณากรอกอีเมล');
      return;
    }

    if (!password) {
      showError('กรุณากรอกรหัสผ่าน');
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setLoading(false);
      showError('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
      return;
    }

    if (!getAllowedRoles().includes(data.user?.app_metadata?.role)) {
      await supabase.auth.signOut();
      setLoading(false);
      showError('บัญชีนี้ไม่มีสิทธิ์เข้าใช้งานหน้า admin');
      return;
    }

    window.location.href = getSafeNext();
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (params.get('error') === 'unauthorized') {
      showError('บัญชีนี้ไม่มีสิทธิ์เข้าใช้งานหน้า admin');
    }

    document.querySelector('#admin-login-form')?.addEventListener('submit', handleLogin);
    redirectIfAlreadyAdmin();
  });
}());
