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
    sendMagicLink,
    signOut
  };
}());
