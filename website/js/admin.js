(function () {
  const app = window.SimsetBorrow = window.SimsetBorrow || {};
  const supabase = app.supabase;
  let currentUser = null;

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
    let session;
    try {
      ({ session } = await app.auth.requireRole(['admin']));
    } catch (error) {
      if (error.code === 'FORBIDDEN') {
        await supabase.auth.signOut();
        window.location.href = buildLoginUrl('unauthorized');
      } else {
        window.location.href = buildLoginUrl();
      }
      return false;
    }

    currentUser = session.user;

    const emailEl = document.querySelector('#admin-user-email');
    if (emailEl) emailEl.textContent = currentUser.email || 'Admin';

    const logoutButton = document.querySelector('#admin-logout');
    if (logoutButton) logoutButton.hidden = false;

    setAuthState('ยืนยันสิทธิ์ admin แล้ว เลือกหน้าที่ต้องการใช้งานด้านล่าง', 'success');
    return true;
  }

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = 'admin-login.html';
  }

  app.boot(async () => {
    document.querySelector('#admin-logout')?.addEventListener('click', logout);
    await requireAdmin();
  }, {
    onError(error) {
      setAuthState(error.message, 'danger');
    }
  });
}());
