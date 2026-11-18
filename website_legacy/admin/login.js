const SUPABASE_URL = 'https://ifogcvymwhcfbfjzhwsl.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_DZyIDHVZ-kfD1o3baz0qmw_tTyRCJG8';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const loginParams = new URLSearchParams(window.location.search);
const TEST_MODE = loginParams.get('test_mode') === '1' || window.localStorage.getItem('simset_test_mode') === '1' || navigator.webdriver;
if (loginParams.get('test_mode') === '1') {
    window.localStorage.setItem('simset_test_mode', '1');
}
const TEST_ADMIN_LOGIN_KEY = 'simset_test_admin_logged_in';
const TEST_ADMIN_EMAIL = 'example@gmail.com';
const TEST_ADMIN_PASSWORD = 'password123';

// If already logged in, redirect to dashboard
sb.auth.getSession().then(({ data }) => {
    if (TEST_MODE && window.localStorage.getItem(TEST_ADMIN_LOGIN_KEY) === '1') {
        window.location.href = 'dashboard.html?test_mode=1';
        return;
    }
    if (data.session) window.location.href = 'dashboard.html';
});

// Check URL for errors (e.g. from admin.js redirect)
const params = new URLSearchParams(window.location.search);
if (params.get('error') === 'unauthorized') {
    const errEl = document.getElementById('login-error');
    document.getElementById('login-error-msg').textContent = 'บัญชีนี้ไม่มีสิทธิ์การเข้าถึงระดับ Admin';
    errEl.style.display = 'flex';
    // Remove param from URL without reloading
    window.history.replaceState({}, document.title, window.location.pathname);
}

// Password toggle
document.getElementById('pw-toggle').addEventListener('click', () => {
    const pw = document.getElementById('password');
    pw.type = pw.type === 'password' ? 'text' : 'password';
});

// Login form submit
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const errEl = document.getElementById('login-error');
    const btnSpinner = document.getElementById('btn-spinner');
    const btnText = document.getElementById('login-text');

    errEl.style.display = 'none';
    btnSpinner.style.display = 'block';
    btnText.style.display = 'none';
    document.getElementById('login-btn').disabled = true;

    if (TEST_MODE) {
        if (email.toLowerCase() === TEST_ADMIN_EMAIL && password === TEST_ADMIN_PASSWORD) {
            window.localStorage.setItem(TEST_ADMIN_LOGIN_KEY, '1');
            window.localStorage.setItem('simset_test_mode', '1');
            window.location.href = 'dashboard.html?test_mode=1';
            return;
        }
        document.getElementById('login-error-msg').textContent = 'อีเมล หรือรหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง';
        errEl.style.display = 'flex';
        btnSpinner.style.display = 'none';
        btnText.style.display = 'block';
        document.getElementById('login-btn').disabled = false;
        return;
    }

    const { error } = await sb.auth.signInWithPassword({ email, password });

    if (error) {
        document.getElementById('login-error-msg').textContent = 'อีเมล หรือรหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง';
        errEl.style.display = 'flex';
        btnSpinner.style.display = 'none';
        btnText.style.display = 'block';
        document.getElementById('login-btn').disabled = false;
    } else {
        window.location.href = 'dashboard.html';
    }
});
