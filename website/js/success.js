(function () {
  const app = window.SimsetBorrow = window.SimsetBorrow || {};
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));

  function showMessage(type, text) {
    const message = document.getElementById('success-message');
    if (!message) return;
    message.className = `alert alert-${type}`;
    message.textContent = text;
  }

  function firstItemDate(request, field) {
    return (request.items || []).find((item) => item[field])?.[field] || '';
  }

  function splitDate(dateValue) {
    const date = dateValue ? new Date(`${dateValue}T00:00:00`) : null;
    if (!date || Number.isNaN(date.getTime())) return { day: '', month: '', year: '' };
    return {
      day: String(date.getDate()).padStart(2, '0'),
      month: String(date.getMonth() + 1).padStart(2, '0'),
      year: String(date.getFullYear() + 543)
    };
  }

  function purposePart(request, key) {
    const purpose = String(request.purpose || '');
    const patterns = {
      owner: /ยืมพัสดุของ:\s*([^|]+)/,
      work: /เพื่อใช้ในงาน:\s*([^|]+)/,
      location: /สถานที่ใช้งาน:\s*([^|]+)/,
      department: /Department:\s*([^|]+)/,
      phone: /Phone:\s*([^|]+)/
    };
    return purpose.match(patterns[key])?.[1]?.trim() || '';
  }

  function itemRows(items) {
    const rows = (items || []).slice(0, 5).map((item, index) => {
      const code = item.asset_code || item.manikin_sap_id || item.unit_code || '';
      return `
        <tr>
          <td>${index + 1}</td>
          <td>${esc(item.equipment_name || '')}</td>
          <td>${esc(code)}</td>
          <td>${esc(item.qty_borrowed || 1)}</td>
          <td>ชิ้น</td>
          <td></td>
        </tr>`;
    });
    while (rows.length < 5) rows.push('<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td></tr>');
    return rows.join('');
  }

  function renderReceipt(request) {
    const root = document.getElementById('receipt-content');
    const trackingId = request.tracking_id;
    const trackUrl = `${location.origin}/track.html?id=${encodeURIComponent(trackingId)}`;
    const borrowDate = splitDate(firstItemDate(request, 'start_date'));
    const returnDate = splitDate(firstItemDate(request, 'end_date'));
    const createdDate = splitDate(String(request.created_at || '').slice(0, 10));
    const borrowerName = request.borrower_name || '';
    const borrowerPosition = request.borrower_position || '';
    const department = request.borrower_department || purposePart(request, 'department');
    const phone = request.borrower_phone || purposePart(request, 'phone');
    const owner = request.borrow_purpose_owner || purposePart(request, 'owner');
    const workPurpose = request.work_purpose || purposePart(request, 'work');
    const usageLocation = request.usage_location || purposePart(request, 'location');
    document.getElementById('track-link').href = `track.html?id=${encodeURIComponent(trackingId)}`;
    document.getElementById('tracking-url').textContent = trackUrl;
    document.getElementById('tracking-qr').src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(trackUrl)}`;

    root.innerHTML = `
      <section class="borrow-form-print">
        <div class="borrow-form-meta">
          <span>Tracking ID: <strong>${esc(trackingId)}</strong></span>
          <span>Status: ${esc(request.status)}</span>
        </div>
        <div class="borrow-form-date">วันที่ ${esc(createdDate.day)} เดือน ${esc(createdDate.month)} พ.ศ. ${esc(createdDate.year)}</div>
        <h2>ส่วนที่ 1 สำหรับผู้ยืม</h2>
        <div class="borrow-form-line">ข้าพเจ้า <strong>${esc(borrowerName)}</strong> ตำแหน่ง <strong>${esc(borrowerPosition)}</strong></div>
        <div class="borrow-form-line">ภาควิชา/หน่วยงาน <strong>${esc(department)}</strong> โทร. <strong>${esc(phone)}</strong></div>
        <div class="borrow-form-line">มีความประสงค์ขอยืมพัสดุของ <strong>${esc(owner)}</strong> เพื่อใช้ในงาน <strong>${esc(workPurpose)}</strong></div>
        <div class="borrow-form-line">สถานที่ใช้งาน <strong>${esc(usageLocation)}</strong> ระหว่างวันที่ <strong>${esc(borrowDate.day)}/${esc(borrowDate.month)}/${esc(borrowDate.year)}</strong> ถึง <strong>${esc(returnDate.day)}/${esc(returnDate.month)}/${esc(returnDate.year)}</strong></div>
        <table class="borrow-form-table">
          <thead>
            <tr>
              <th>ลำดับ</th>
              <th>รายการ</th>
              <th>รหัสพัสดุ</th>
              <th>จำนวน</th>
              <th>หน่วยนับ</th>
              <th>หมายเหตุ</th>
            </tr>
          </thead>
          <tbody>${itemRows(request.items)}</tbody>
        </table>
        <div class="borrow-form-sign-grid">
          <div>ผู้รับอุปกรณ์ ........................................<br>วันที่ .......... / .......... / ..........</div>
          <div>ผู้จ่ายอุปกรณ์ ........................................<br>วันที่ .......... / .......... / ..........</div>
        </div>
        <div class="borrow-form-sign-grid borrow-form-sign-bottom">
          <div>ลงชื่อ ........................................ ผู้ยืม<br>( ........................................ )<br>โทร. ................................</div>
          <div>ลงชื่อ ........................................ หัวหน้าหน่วยงาน<br>( ........................................ )<br>วันที่ .......... / .......... / ..........</div>
        </div>
      </section>`;
  }

  async function init() {
    const trackingId = new URLSearchParams(location.search).get('id');
    if (!trackingId) {
      showMessage('warning', 'Tracking ID is missing.');
      return;
    }

    try {
      const { data, error } = await app.supabase.rpc('get_borrow_request_status', { p_tracking_id: trackingId });
      if (error) throw error;
      renderReceipt(data);
    } catch (error) {
      showMessage('danger', error.message);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('print-receipt')?.addEventListener('click', () => window.print());
    document.getElementById('copy-tracking-url')?.addEventListener('click', function () {
      const url = document.getElementById('tracking-url')?.textContent || '';
      navigator.clipboard.writeText(url).then(() => {
        this.textContent = 'คัดลอกแล้ว ✓';
        setTimeout(() => { this.textContent = 'คัดลอกลิงก์'; }, 2000);
      });
    });
    init();
  });
}());
