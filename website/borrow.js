/* === SiMSET Borrow App === */
const SUPABASE_URL = 'https://ifogcvymwhcfbfjzhwsl.supabase.co';
const SUPABASE_ANON = 'sb_publishable_DZyIDHVZ-kfD1o3baz0qmw_tTyRCJG8';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

let currentUser = null;
let equipments = [];
let cart = []; // { equipment_id, name, qty }
let selectedStartDate = null;
let selectedEndDate = null;
let availabilityMap = {}; // equipment_id -> available_qty

let currentDetailEquipmentId = null;

/* -------- Auth UI -------- */
async function checkUser() {
    const { data: { session } } = await supabase.auth.getSession();
    currentUser = session?.user || null;

    if (currentUser) {
        document.getElementById('btn-login').style.display = 'none';
        document.getElementById('user-profile').style.display = 'flex';
        // Show name or email
        document.getElementById('user-name').textContent = currentUser.user_metadata?.full_name || currentUser.email;
    } else {
        document.getElementById('btn-login').style.display = 'block';
        document.getElementById('user-profile').style.display = 'none';
    }
}

document.getElementById('btn-login').addEventListener('click', async () => {
    // For SIMSET, we'll try to use SSO or Google. Since we don't have it configured here exactly, redirect to a standard login or trigger auth.
    // In actual implementation, we might use signInWithOAuth({ provider: 'google' })
    const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.href }
    });
    if (error) alert('Login failed: ' + error.message);
});

/* -------- Date Picker Logic -------- */
const startDateInput = document.getElementById('start-date');
const endDateInput = document.getElementById('end-date');
const btnCheckAvail = document.getElementById('btn-check-avail');
const catalogSection = document.getElementById('catalog-section');

// Set min dates to today
const todayStr = new Date().toISOString().split('T')[0];
startDateInput.setAttribute('min', todayStr);
endDateInput.setAttribute('min', todayStr);

async function autoTriggerSearch() {
    if (startDateInput.value && endDateInput.value) {
        btnCheckAvail.click();
    }
}

function updateDateConstraints() {
    if (startDateInput.value) {
        endDateInput.setAttribute('min', startDateInput.value);
        if (endDateInput.value && endDateInput.value < startDateInput.value) {
            endDateInput.value = startDateInput.value;
        }
    }
    btnCheckAvail.disabled = !(startDateInput.value && endDateInput.value);
    autoTriggerSearch();
}

startDateInput.addEventListener('change', updateDateConstraints);
endDateInput.addEventListener('change', updateDateConstraints);

// Filter auto-trigger
document.querySelectorAll('input[name="age-filter"]').forEach(radio => {
    radio.addEventListener('change', renderCatalog);
});
document.getElementById('search-input').addEventListener('input', renderCatalog);
