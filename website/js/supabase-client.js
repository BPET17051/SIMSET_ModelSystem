const USE_SUPABASE = true;
const SIMSET_SUPABASE_URL = 'https://simset-showroom-proxy.simset-admin.workers.dev';
const SIMSET_SUPABASE_ANON = 'worker-managed-key';

window.SimsetBorrow = window.SimsetBorrow || {};
window.SimsetBorrow.supabase = null;

if (!window.supabase?.createClient) {
  throw new Error('Supabase client library is required.');
}

window.SimsetBorrow.supabase = window.supabase.createClient(SIMSET_SUPABASE_URL, SIMSET_SUPABASE_ANON);

window.SimsetBorrow.esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[char]));

window.SimsetBorrow.showMessage = (elementId, type, text) => {
  const message = document.getElementById(elementId);
  if (!message) return;
  message.className = `alert alert-${type}`;
  message.textContent = text;
};

window.SimsetBorrow.boot = function boot(asyncFn, options = {}) {
  document.addEventListener('DOMContentLoaded', async () => {
    try {
      await asyncFn();
    } catch (error) {
      if (typeof options.onError === 'function') {
        options.onError(error);
        return;
      }

      console.error(error);
    }
  });
};

window.SimsetBorrow.STATUS_LABELS = {
  pending: 'รออนุมัติ',
  approved: 'อนุมัติแล้ว',
  ready: 'พร้อมรับอุปกรณ์',
  borrowed: 'กำลังยืม',
  returned: 'คืนแล้ว',
  inspection: 'รอตรวจรับ',
  completed: 'เสร็จสิ้น',
  damaged: 'พบชำรุด',
  lost: 'สูญหาย',
  cancelled: 'ยกเลิกแล้ว',
  expired: 'หมดอายุ',
  overdue: 'เกินกำหนดคืน',
  rejected: 'ไม่อนุมัติ'
};
