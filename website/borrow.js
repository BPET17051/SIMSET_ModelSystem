const SUPABASE_URL = 'https://simset-showroom-proxy.simset-admin.workers.dev';
const SUPABASE_ANON = 'sb_publishable_DZyIDHVZ-kfD1o3baz0qmw_tTyRCJG8';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

let currentUser = null;
let equipments = [];
let cart = []; // { equipment_id, name, qty }
let selectedStartDate = null;
let selectedEndDate = null;
let availabilityMap = {}; // equipment_id -> available_qty

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

function updateDateConstraints() {
    if (startDateInput.value) {
        endDateInput.setAttribute('min', startDateInput.value);
        if (endDateInput.value && endDateInput.value < startDateInput.value) {
            endDateInput.value = startDateInput.value;
        }
    }
    btnCheckAvail.disabled = !(startDateInput.value && endDateInput.value);
}

startDateInput.addEventListener('change', updateDateConstraints);
endDateInput.addEventListener('change', updateDateConstraints);

/* -------- Matrix Logic -------- */
document.getElementById('btn-view-matrix').addEventListener('click', async () => {
    // 14 day matrix starting from today or start_date
    const baseDate = startDateInput.value ? new Date(startDateInput.value) : new Date();
    await loadEquipments();
    await renderMatrix(baseDate);
    document.getElementById('matrix-modal').classList.add('open');
});

document.querySelector('.modal-close').addEventListener('click', () => {
    document.getElementById('matrix-modal').classList.remove('open');
});

async function renderMatrix(baseDate) {
    const table = document.getElementById('matrix-table');
    table.innerHTML = '<div style="padding: 20px; text-align: center;">α╕üα╕│α╕Ñα╕▒α╕çα╣éα╕½α╕Ñα╕öα╕éα╣ëα╕¡α╕íα╕╣α╕Ñ...</div>';

    const dates = [];
    for (let i = 0; i < 14; i++) {
        const d = new Date(baseDate);
        d.setDate(d.getDate() + i);
        dates.push(d);
    }

    const startDateStr = dates[0].toISOString().split('T')[0];
    const endDateStr = dates[13].toISOString().split('T')[0];

    // Fetch overlaps for 14 days
    const { data: overlaps, error } = await supabase
        .from('vw_active_borrow_items')
        .select(`equipment_id, start_date, end_date, qty_borrowed`)
        .lte('start_date', endDateStr)
        .gte('end_date', new Date(dates[0].getTime() - 86400000).toISOString().split('T')[0]); // -1 day for buffer check

    if (error) {
        table.innerHTML = `<tr><td>Error loading matrix: ${error.message}</td></tr>`;
        return;
    }

    // Build Header
    let html = `<thead><tr><th>α╕úα╕▓α╕óα╕üα╕▓α╕úα╕¡α╕╕α╕¢α╕üα╕úα╕ôα╣î</th>`;
    dates.forEach(d => {
        html += `<th>${d.getDate()}/${d.getMonth() + 1}</th>`;
    });
    html += `</tr></thead><tbody>`;

    // Build Rows
    equipments.forEach(eq => {
        html += `<tr><td>${eq.name_th} <br><small style="color:var(--text-3)">α╕¬α╕┤α╕úα╕┤α╕úα╕ºα╕í ${eq.total_quantity - eq.maintenance_quantity} α╕èα╕┤α╣ëα╕Ö</small></td>`;

        dates.forEach(d => {
            const dStr = d.toISOString().split('T')[0];

            // Calc used qty for this specific day (including 1 day buffer)
            let used = 0;
            overlaps.forEach(o => {
                if (o.equipment_id !== eq.id) return;
                // Buffer rule: end_date + 1 day is still "in use"
                const itemStart = o.start_date;
                const bufferEnd = new Date(o.end_date);
                bufferEnd.setDate(bufferEnd.getDate() + 1);
                const bufferEndStr = bufferEnd.toISOString().split('T')[0];

                if (dStr >= itemStart && dStr <= bufferEndStr) {
                    used += o.qty_borrowed;
                }
            });

            let avail = Math.max(0, (eq.total_quantity - eq.maintenance_quantity) - used);
            let cellClass = avail === 0 ? 'avail-0' : (avail <= 2 ? 'avail-low' : 'avail-high');
            html += `<td class="${cellClass}">${avail}</td>`;
        });

        html += `</tr>`;
    });
    html += `</tbody>`;

    table.innerHTML = html;
}


/* -------- Main Flow -------- */
async function loadEquipments() {
    if (equipments.length === 0) {
        const { data, error } = await supabase.from('equipments').select('*').order('name_th');
        if (error) { console.error('Error fetching equipments:', error); return; }
        equipments = data;
    }
}

btnCheckAvail.addEventListener('click', async () => {
    selectedStartDate = startDateInput.value;
    selectedEndDate = endDateInput.value;

    // Check Date
    const displayStart = new Date(selectedStartDate).toLocaleDateString('th-TH');
    const displayEnd = new Date(selectedEndDate).toLocaleDateString('th-TH');
    document.getElementById('catalog-date-range').textContent = `α╕úα╕░α╕óα╕░α╣Çα╕ºα╕Ñα╕▓: ${displayStart} - ${displayEnd}`;

    // Clear cart if dates change
    if (cart.length > 0) {
        if (!confirm('α╕üα╕▓α╕úα╣Çα╕¢α╕Ñα╕╡α╣êα╕óα╕Öα╕ºα╕▒α╕Öα╕ùα╕╡α╣ê α╕êα╕░α╕ùα╕│α╣âα╕½α╣ëα╕éα╕¡α╕çα╣âα╕Öα╕òα╕░α╕üα╕úα╣ëα╕▓α╕¢α╕▒α╕êα╕êα╕╕α╕Üα╕▒α╕Öα╕ûα╕╣α╕üα╕Ñα╕Ü α╕óα╕╖α╕Öα╕óα╕▒α╕Öα╕½α╕úα╕╖α╕¡α╣äα╕íα╣ê?')) {
            return;
        }
        cart = [];
        updateCartUI();
    }

    btnCheckAvail.textContent = 'α╕üα╕│α╕Ñα╕▒α╕çα╣éα╕½α╕Ñα╕ö...';
    btnCheckAvail.disabled = true;

    await loadEquipments();
    await calculateAvailability(selectedStartDate, selectedEndDate);
    renderCatalog();

    catalogSection.style.display = 'block';
    catalogSection.scrollIntoView({ behavior: 'smooth' });

    btnCheckAvail.textContent = 'α╕òα╕úα╕ºα╕êα╕¬α╕¡α╕Üα╕äα╕┤α╕ºα╕ºα╣êα╕▓α╕çα╕¡α╕╡α╕üα╕äα╕úα╕▒α╣ëα╕ç';
    btnCheckAvail.disabled = false;
});

async function calculateAvailability(start, end) {
    const { data: overlaps, error } = await supabase
        .from('vw_active_borrow_items')
        .select(`equipment_id, start_date, end_date, qty_borrowed`)
        .lte('start_date', end); // Only items starting before or on our end date

    // Custom filter for end_date + buffer >= start
    const validOverlaps = overlaps ? overlaps.filter(o => {
        const bufferEnd = new Date(o.end_date);
        bufferEnd.setDate(bufferEnd.getDate() + 1);
        const bufferEndStr = bufferEnd.toISOString().split('T')[0];
        return bufferEndStr >= start;
    }) : [];

    availabilityMap = {};

    equipments.forEach(eq => {
        let used = 0;
        validOverlaps.forEach(o => {
            if (o.equipment_id === eq.id) {
                used += o.qty_borrowed;
            }
        });
        availabilityMap[eq.id] = Math.max(0, (eq.total_quantity - eq.maintenance_quantity) - used);
    });
}

async function renderCatalog() {
    const grid = document.getElementById('equipments-grid');
    grid.innerHTML = '';

    for (const eq of equipments) {
        const avail = availabilityMap[eq.id] || 0;
        const inCart = cart.find(c => c.equipment_id === eq.id)?.qty || 0;
        const remaining = avail - inCart;

        let outOfStockHtml = '';
        if (avail === 0) {
            // Need to fetch next available date via RPC
            const { data: nextDate } = await supabase.rpc('get_next_available_date', {
                p_equipment_id: eq.id,
                p_start_date: selectedStartDate,
                p_end_date: selectedEndDate,
                p_qty: 1
            });
            const dStr = nextDate ? new Date(nextDate).toLocaleDateString('th-TH') : 'α╣äα╕íα╣êα╕ùα╕úα╕▓α╕Ü';
            outOfStockHtml = `<div class="next-avail-note">α╕ºα╣êα╕▓α╕çα╕¡α╕╡α╕üα╕äα╕úα╕▒α╣ëα╕ç: ${dStr}</div>`;
        }

        const card = document.createElement('div');
        card.className = `product-card age-accent-adult`;
        card.innerHTML = `
            <div class="product-card-top">
                <div class="product-age-badge adult">≡ƒôª</div>
                ${avail > 0
                ? `<div class="avail-badge">α╕ºα╣êα╕▓α╕ç ${avail} α╕èα╕┤α╣ëα╕Ö</div>`
                : `<div class="avail-badge out-of-stock">α╕äα╕┤α╕ºα╣Çα╕òα╣çα╕í</div>`}
            </div>
            <div class="product-body" style="margin-top:15px;">
                <h3 class="product-name" style="font-size: 1.1rem;">${eq.name_th}</h3>
                <div class="product-code">${eq.type === 'UNIT' ? 'α╕êα╣êα╕▓α╕óα╣üα╕Üα╕Üα╕úα╕▓α╕óα╕òα╕▒α╕ºα╣Çα╕äα╕úα╕╖α╣êα╕¡α╕ç (Serial)' : 'α╕êα╣êα╕▓α╕óα╣üα╕Üα╕Üα╕Öα╕▒α╕Üα╕êα╕│α╕Öα╕ºα╕Ö'}</div>
                ${outOfStockHtml}
            </div>
            <div class="product-card-controls">
                <div class="stock-info">
                    α╕óα╕¡α╕öα╕úα╕ºα╕íα╕úα╕░α╕Üα╕Ü: ${eq.total_quantity}
                </div>
                <div class="qty-control">
                    <button class="qty-btn" onclick="updateItemCart('${eq.id}', -1)" ${avail === 0 || inCart === 0 ? 'disabled' : ''}>-</button>
                    <div class="qty-display">${inCart}</div>
                    <button class="qty-btn" onclick="updateItemCart('${eq.id}', 1)" ${remaining <= 0 ? 'disabled' : ''}>+</button>
                </div>
            </div>
        `;
        grid.appendChild(card);
    }
}

/* -------- Cart Logic -------- */
window.updateItemCart = function (eqId, delta) {
    const eq = equipments.find(x => x.id === eqId);
    const avail = availabilityMap[eqId] || 0;

    let item = cart.find(c => c.equipment_id === eqId);
    if (!item) {
        if (delta < 0) return;
        item = { equipment_id: eq.id, name: eq.name_th, qty: 0 };
        cart.push(item);
    }

    const newQty = item.qty + delta;
    if (newQty < 0) return;
    if (newQty > avail) {
        alert('α╕êα╕│α╕Öα╕ºα╕Öα╕ùα╕╡α╣êα╣Çα╕Ñα╕╖α╕¡α╕üα╣Çα╕üα╕┤α╕Öα╕üα╕ºα╣êα╕▓α╕äα╕┤α╕ºα╕ùα╕╡α╣êα╕ºα╣êα╕▓α╕çα╣âα╕Öα╕úα╕░α╕Üα╕Üα╕äα╕úα╕▒α╕Ü');
        return;
    }

    // Anti-hoarding limit 5 items total
    const totalCartQty = cart.reduce((sum, c) => sum + (c.equipment_id === eqId ? newQty : c.qty), 0);
    if (totalCartQty > 5) {
        alert('α╕éα╕¡α╕¡α╕áα╕▒α╕óα╕äα╕úα╕▒α╕Ü α╕òα╕▓α╕íα╕üα╕Äα╕¬α╕▓α╕íα╕▓α╕úα╕ûα╕óα╕╖α╕íα╕¡α╕╕α╕¢α╕üα╕úα╕ôα╣îα╕úα╕ºα╕íα╕üα╕▒α╕Öα╣äα╕öα╣ëα╕¬α╕╣α╕çα╕¬α╕╕α╕ö 5 α╕èα╕┤α╣ëα╕Öα╕òα╣êα╕¡ 1 α╕äα╕│α╕úα╣ëα╕¡α╕ç');
        return;
    }

    item.qty = newQty;
    if (item.qty === 0) {
        cart = cart.filter(c => c.equipment_id !== eqId);
    }

    updateCartUI();
    renderCatalog(); // To update the +/- buttons correctly
}

function updateCartUI() {
    const badge = document.getElementById('cart-badge');
    const total = cart.reduce((sum, item) => sum + item.qty, 0);
    badge.textContent = total;
    badge.style.display = total > 0 ? 'flex' : 'none';

    if (total > 0) {
        badge.classList.remove('bump');
        void badge.offsetWidth; // trigger reflow
        badge.classList.add('bump');
    }

    // Update drawer list
    const list = document.getElementById('cart-items');
    list.innerHTML = '';

    if (cart.length === 0) {
        list.innerHTML = '<div style="text-align:center; color:var(--text-3); padding: 20px;">α╕òα╕░α╕üα╕úα╣ëα╕▓α╕óα╕▒α╕çα╕ºα╣êα╕▓α╕çα╣Çα╕¢α╕Ñα╣êα╕▓</div>';
    } else {
        cart.forEach(item => {
            list.innerHTML += `
                <div class="cart-item">
                    <div class="cart-item-info">
                        <h4>${item.name}</h4>
                        <p>α╕êα╕│α╕Öα╕ºα╕Ö: ${item.qty} α╕èα╕┤α╣ëα╕Ö</p>
                    </div>
                    <button class="cart-item-remove" onclick="updateItemCart('${item.equipment_id}', -${item.qty})">&times;</button>
                </div>
            `;
        });
    }
}

document.getElementById('cart-icon-btn').addEventListener('click', () => {
    if (cart.length === 0) {
        alert('α╕òα╕░α╕üα╕úα╣ëα╕▓α╕óα╕▒α╕çα╕ºα╣êα╕▓α╕çα╣Çα╕¢α╕Ñα╣êα╕▓ α╣éα╕¢α╕úα╕öα╣Çα╕Ñα╕╖α╕¡α╕üα╕¡α╕╕α╕¢α╕üα╕úα╕ôα╣îα╕üα╣êα╕¡α╕Öα╕äα╕úα╕▒α╕Ü');
        return;
    }

    const displayStart = new Date(selectedStartDate).toLocaleDateString('th-TH');
    const displayEnd = new Date(selectedEndDate).toLocaleDateString('th-TH');

    // Calc buffer day for display
    const bDate = new Date(selectedEndDate);
    bDate.setDate(bDate.getDate() + 1);
    const bStr = bDate.toLocaleDateString('th-TH');

    document.getElementById('checkout-dates-display').textContent = `${displayStart} α╕ûα╕╢α╕ç ${displayEnd}`;
    document.getElementById('checkout-buffer-display').textContent = `*α╕úα╕░α╕Üα╕Üα╕êα╕░α╕Ñα╣çα╕¡α╕üα╕½α╕╕α╣êα╕Öα╣Çα╕₧α╕╖α╣êα╕¡α╣Çα╕äα╕Ñα╕╡α╕óα╕úα╣î/α╕ùα╕│α╕äα╕ºα╕▓α╕íα╕¬α╕░α╕¡α╕▓α╕öα╣âα╕Öα╕ºα╕▒α╕Öα╕ùα╕╡α╣ê ${bStr}`;

    document.getElementById('cart-drawer').classList.add('open');
    document.getElementById('cart-drawer-overlay').classList.add('visible');
    document.body.style.overflow = 'hidden';
});

document.getElementById('cart-close').addEventListener('click', closeCart);
document.getElementById('cart-drawer-overlay').addEventListener('click', closeCart);

function closeCart() {
    document.getElementById('cart-drawer').classList.remove('open');
    document.getElementById('cart-drawer-overlay').classList.remove('visible');
    document.body.style.overflow = '';
}

/* -------- Submission Logic -------- */
document.getElementById('btn-submit-request').addEventListener('click', async () => {
    if (!currentUser) {
        alert('α╕üα╕úα╕╕α╕ôα╕▓α╣Çα╕éα╣ëα╕▓α╕¬α╕╣α╣êα╕úα╕░α╕Üα╕Üα╕üα╣êα╕¡α╕Öα╕ùα╕│α╕üα╕▓α╕úα╕êα╕¡α╕çα╕äα╕úα╕▒α╕Ü');
        return;
    }

    const purposeInput = document.getElementById('checkout-purpose');
    if (!purposeInput.value.trim()) {
        purposeInput.style.borderColor = '#ef4444';
        return;
    }
    purposeInput.style.borderColor = 'var(--border)';

    const btn = document.getElementById('btn-submit-request');
    const errDiv = document.getElementById('checkout-error');
    btn.disabled = true;
    btn.textContent = 'α╕üα╕│α╕Ñα╕▒α╕çα╕öα╕│α╣Çα╕Öα╕┤α╕Öα╕üα╕▓α╕úα╕¬α╣êα╕çα╕äα╕│α╕úα╣ëα╕¡α╕ç...';
    errDiv.style.display = 'none';

    const payload = {
        p_borrower_id: currentUser.id,
        p_borrower_name: currentUser.user_metadata?.full_name || currentUser.email,
        p_purpose: purposeInput.value.trim(),
        p_start_date: selectedStartDate,
        p_end_date: selectedEndDate,
        p_items: cart.map(c => ({ equipment_id: c.equipment_id, qty_borrowed: c.qty }))
    };

    const { data: trackingId, error } = await supabase.rpc('submit_borrow_request', payload);

    if (error) {
        errDiv.textContent = `α╣Çα╕üα╕┤α╕öα╕éα╣ëα╕¡α╕£α╕┤α╕öα╕₧α╕Ñα╕▓α╕ö: ${error.message}`;
        errDiv.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'α╕óα╕╖α╕Öα╕óα╕▒α╕Öα╕üα╕▓α╕úα╕êα╕¡α╕ç';

        // Handling specific custom errors inside RPC
        if (error.message.includes('α╕ºα╣êα╕▓α╕çα╣äα╕íα╣êα╕₧α╕¡')) {
            alert('α╕öα╕╣α╣Çα╕½α╕íα╕╖α╕¡α╕Öα╕íα╕╡α╕Üα╕▓α╕çα╕úα╕▓α╕óα╕üα╕▓α╕úα╕ûα╕╣α╕üα╕òα╕▒α╕öα╕½α╕Öα╣ëα╕▓α╕êα╕¡α╕çα╣äα╕¢α╣üα╕Ñα╣ëα╕º α╕üα╕úα╕╕α╕ôα╕▓α╕¡α╕▒α╕¢α╣Çα╕öα╕òα╕òα╕░α╕üα╕úα╣ëα╕▓α╣âα╕½α╕íα╣êα╕äα╕úα╕▒α╕Ü');
            closeCart();
            await calculateAvailability(selectedStartDate, selectedEndDate);
            renderCatalog();
        }
    } else {
        alert(`α╕äα╕│α╕úα╣ëα╕¡α╕çα╕éα╕¡α╕çα╕äα╕╕α╕ôα╕ûα╕╣α╕üα╕¬α╣êα╕çα╣Çα╕úα╕╡α╕óα╕Üα╕úα╣ëα╕¡α╕óα╣üα╕Ñα╣ëα╕º!\nTracking ID: ${trackingId}\n\nα╕üα╕úα╕╕α╕ôα╕▓α╣üα╕äα╕¢α╕½α╕Öα╣ëα╕▓α╕êα╕¡α╣Çα╕üα╣çα╕Üα╣äα╕ºα╣ëα╕òα╕úα╕ºα╕êα╕¬α╕¡α╕Üα╕¬α╕ûα╕▓α╕Öα╕░`);
        cart = [];
        updateCartUI();
        closeCart();
        window.location.reload(); // Quick reset for Phase 1
    }
});

checkUser();
updateCartUI();
