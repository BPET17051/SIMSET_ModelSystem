const SUPABASE_URL = 'https://ifogcvymwhcfbfjzhwsl.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_DZyIDHVZ-kfD1o3baz0qmw_tTyRCJG8';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// If already logged in, redirect to dashboard
sb.auth.getSession().then(({ data }) => {
    if (data.session) window.location.href = 'dashboard.html';
});

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
