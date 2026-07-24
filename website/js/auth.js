(function () {
  const app = window.SimsetBorrow = window.SimsetBorrow || {};
  const ALLOWED_DOMAIN = '@mahidol.ac.th';

  function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
  }

  function isAllowedBorrowerEmail(email) {
    return normalizeEmail(email).endsWith(ALLOWED_DOMAIN);
  }

  async function getSession() {
    const { data, error } = await app.supabase.auth.getSession();
    if (error) throw error;
    return data.session || null;
  }

  async function getUserEmail() {
    const session = await getSession();
    return session?.user?.email || '';
  }

  async function requireRole(allowedRoles) {
    const session = await getSession();
    if (!session) {
      const error = new Error('Authentication required.');
      error.code = 'UNAUTHENTICATED';
      throw error;
    }
    const role = session.user?.app_metadata?.role;
    if (!allowedRoles.includes(role)) {
      const error = new Error('Insufficient role.');
      error.code = 'FORBIDDEN';
      throw error;
    }
    return { session, role };
  }

  async function sendMagicLink(email, redirectTo) {
    const normalized = normalizeEmail(email);
    if (!isAllowedBorrowerEmail(normalized)) {
      throw new Error('Use a Mahidol organization email ending with @mahidol.ac.th.');
    }

    const { error } = await app.supabase.auth.signInWithOtp({
      email: normalized,
      options: { emailRedirectTo: redirectTo }
    });
    if (error) throw error;
  }

  async function signOut() {
    const { error } = await app.supabase.auth.signOut();
    if (error) throw error;
  }

  app.auth = {
    allowedDomain: ALLOWED_DOMAIN,
    normalizeEmail,
    isAllowedBorrowerEmail,
    getSession,
    getUserEmail,
    requireRole,
    sendMagicLink,
    signOut
  };
}());
