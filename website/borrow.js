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
    table.innerHTML = '<div style="padding: 20px; text-align: center;">กำลังโหลดข้อมูล...</div>';

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
        .from('borrow_request_items')
        .select(`
            equipment_id, start_date, end_date, qty_borrowed,
            borrow_requests!inner(status)
        `)
        .not('borrow_requests.status', 'in', '("cancelled","expired","rejected","returned")')
        .lte('start_date', endDateStr)
        .gte('end_date', new Date(dates[0].getTime() - 86400000).toISOString().split('T')[0]); // -1 day for buffer check

    if (error) {
        table.innerHTML = `<tr><td>Error loading matrix: ${error.message}</td></tr>`;
        return;
    }

    // Build Header
    let html = `<thead><tr><th>รายการอุปกรณ์</th>`;
    dates.forEach(d => {
        html += `<th>${d.getDate()}/${d.getMonth() + 1}</th>`;
    });
    html += `</tr></thead><tbody>`;

    // Build Rows
    equipments.forEach(eq => {
        html += `<tr><td>${eq.name_th} <br><small style="color:var(--text-3)">สิริรวม ${eq.total_quantity - eq.maintenance_quantity} ชิ้น</small></td>`;

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
    document.getElementById('catalog-date-range').textContent = `ระยะเวลา: ${displayStart} - ${displayEnd}`;

    // Clear cart if dates change
    if (cart.length > 0) {
        if (!confirm('การเปลี่ยนวันที่ จะทำให้ของในตะกร้าปัจจุบันถูกลบ ยืนยันหรือไม่?')) {
            return;
        }
        cart = [];
        updateCartUI();
    }

    btnCheckAvail.textContent = 'กำลังโหลด...';
    btnCheckAvail.disabled = true;

    await loadEquipments();
    await calculateAvailability(selectedStartDate, selectedEndDate);
    renderCatalog();

    catalogSection.style.display = 'block';
    catalogSection.scrollIntoView({ behavior: 'smooth' });

    btnCheckAvail.textContent = 'ตรวจสอบคิวว่างอีกครั้ง';
    btnCheckAvail.disabled = false;
});

async function calculateAvailability(start, end) {
    const { data: overlaps, error } = await supabase
        .from('borrow_request_items')
        .select(`
            equipment_id, start_date, end_date, qty_borrowed,
            borrow_requests!inner(status)
        `)
        .not('borrow_requests.status', 'in', '("cancelled","expired","rejected","returned")')
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
            const dStr = nextDate ? new Date(nextDate).toLocaleDateString('th-TH') : 'ไม่ทราบ';
            outOfStockHtml = `<div class="next-avail-note">ว่างอีกครั้ง: ${dStr}</div>`;
        }

        const card = document.createElement('div');
        card.className = `product-card age-accent-adult`;
        card.innerHTML = `
            <div class="product-card-top">
                <div class="product-age-badge adult">📦</div>
                ${avail > 0
                ? `<div class="avail-badge">ว่าง ${avail} ชิ้น</div>`
                : `<div class="avail-badge out-of-stock">คิวเต็ม</div>`}
            </div>
            <div class="product-body" style="margin-top:15px;">
                <h3 class="product-name" style="font-size: 1.1rem;">${eq.name_th}</h3>
                <div class="product-code">${eq.type === 'UNIT' ? 'จ่ายแบบรายตัวเครื่อง (Serial)' : 'จ่ายแบบนับจำนวน'}</div>
                ${outOfStockHtml}
            </div>
            <div class="product-card-controls">
                <div class="stock-info">
                    ยอดรวมระบบ: ${eq.total_quantity}
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
        alert('จำนวนที่เลือกเกินกว่าคิวที่ว่างในระบบครับ');
        return;
    }

    // Anti-hoarding limit 5 items total
    const totalCartQty = cart.reduce((sum, c) => sum + (c.equipment_id === eqId ? newQty : c.qty), 0);
    if (totalCartQty > 5) {
        alert('ขออภัยครับ ตามกฎสามารถยืมอุปกรณ์รวมกันได้สูงสุด 5 ชิ้นต่อ 1 คำร้อง');
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
        list.innerHTML = '<div style="text-align:center; color:var(--text-3); padding: 20px;">ตะกร้ายังว่างเปล่า</div>';
    } else {
        cart.forEach(item => {
            list.innerHTML += `
                <div class="cart-item">
                    <div class="cart-item-info">
                        <h4>${item.name}</h4>
                        <p>จำนวน: ${item.qty} ชิ้น</p>
                    </div>
                    <button class="cart-item-remove" onclick="updateItemCart('${item.equipment_id}', -${item.qty})">&times;</button>
                </div>
            `;
        });
    }
}

document.getElementById('cart-icon-btn').addEventListener('click', () => {
    if (cart.length === 0) {
        alert('ตะกร้ายังว่างเปล่า โปรดเลือกอุปกรณ์ก่อนครับ');
        return;
    }

    const displayStart = new Date(selectedStartDate).toLocaleDateString('th-TH');
    const displayEnd = new Date(selectedEndDate).toLocaleDateString('th-TH');

    // Calc buffer day for display
    const bDate = new Date(selectedEndDate);
    bDate.setDate(bDate.getDate() + 1);
    const bStr = bDate.toLocaleDateString('th-TH');

    document.getElementById('checkout-dates-display').textContent = `${displayStart} ถึง ${displayEnd}`;
    document.getElementById('checkout-buffer-display').textContent = `*ระบบจะล็อกหุ่นเพื่อเคลียร์/ทำความสะอาดในวันที่ ${bStr}`;

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
        alert('กรุณาเข้าสู่ระบบก่อนทำการจองครับ');
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
    btn.textContent = 'กำลังดำเนินการส่งคำร้อง...';
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
        errDiv.textContent = `เกิดข้อผิดพลาด: ${error.message}`;
        errDiv.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'ยืนยันการจอง';

        // Handling specific custom errors inside RPC
        if (error.message.includes('ว่างไม่พอ')) {
            alert('ดูเหมือนมีบางรายการถูกตัดหน้าจองไปแล้ว กรุณาอัปเดตตะกร้าใหม่ครับ');
            closeCart();
            await calculateAvailability(selectedStartDate, selectedEndDate);
            renderCatalog();
        }
    } else {
        alert(`คำร้องของคุณถูกส่งเรียบร้อยแล้ว!\nTracking ID: ${trackingId}\n\nกรุณาแคปหน้าจอเก็บไว้ตรวจสอบสถานะ`);
        cart = [];
        updateCartUI();
        closeCart();
        window.location.reload(); // Quick reset for Phase 1
    }
});

checkUser();
updateCartUI();
