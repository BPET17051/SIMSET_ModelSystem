(function () {
  const app = window.SimsetBorrow = window.SimsetBorrow || {};
  const esc = (value) => (app.esc ? app.esc(value) : String(value ?? ''));
  let currentSession = null;

  function showMessage(type, text) {
    const message = document.getElementById('history-message');
    if (!message) return;
    message.className = `alert alert-${type}`;
    message.textContent = text;
  }

  async function sendHistoryMagicLink() {
    const email = document.getElementById('history-email')?.value || '';
    await app.auth.sendMagicLink(email, `${location.origin}/history.html`);
    showMessage('info', 'Magic link sent. Open it in this browser to view your history.');
  }

  async function renderAuth() {
    const root = document.getElementById('history-auth');
    currentSession = await app.auth.getSession();
    if (currentSession) {
      root.innerHTML = `<div class="alert alert-success mb-0">Signed in as ${esc(currentSession.user.email)}.</div>`;
      return true;
    }

    root.innerHTML = `
      <div class="border rounded bg-white p-3">
        <label class="form-label" for="history-email">Mahidol email</label>
        <div class="input-group">
          <input id="history-email" type="email" class="form-control" placeholder="name@mahidol.ac.th">
          <button id="history-magic-link" class="btn btn-outline-dark" type="button">Send magic link</button>
        </div>
      </div>`;
    document.getElementById('history-list').innerHTML = '';
    return false;
  }

  function renderHistory(rows) {
    const root = document.getElementById('history-list');
    if (!rows.length) {
      root.innerHTML = '<div class="empty-state">No borrow requests yet.</div>';
      return;
    }

    root.innerHTML = rows.map((request) => `
      <div class="bg-white border rounded p-3 mb-3">
        <div class="d-flex justify-content-between gap-3">
          <div>
            <h2 class="h5 mb-1">${esc(request.tracking_id)}</h2>
            <div class="text-muted small">${esc(request.created_at || '-')}</div>
          </div>
          <span class="status-pill status-${esc(request.status)}">${esc(request.status)}</span>
        </div>
        <p class="mt-3 mb-2">${esc(request.purpose || '-')}</p>
        <ul class="mb-3">
          ${(request.items || []).map((item) => `<li>${esc(item.equipment_name)} x${esc(item.qty_borrowed || 1)}</li>`).join('')}
        </ul>
        <div class="d-flex gap-2">
          <a class="btn btn-sm btn-outline-dark" href="track.html?id=${encodeURIComponent(request.tracking_id)}">Track</a>
          ${request.can_cancel ? `<button class="btn btn-sm btn-outline-danger" type="button" data-cancel-request="${esc(request.id)}">Cancel</button>` : ''}
        </div>
      </div>`).join('');
  }

  async function loadHistory() {
    const { data, error } = await app.supabase.rpc('get_my_borrow_requests');
    if (error) throw error;
    renderHistory(Array.isArray(data) ? data : []);
  }

  async function cancelRequest(requestId) {
    const reason = prompt('Reason for cancellation');
    if (!reason || !reason.trim()) return;
    const { error } = await app.supabase.rpc('transition_borrow_request_status', {
      p_request_id: requestId,
      p_current_status: 'pending',
      p_next_status: 'cancelled',
      p_actor_user_id: currentSession.user.id,
      p_actor_type: 'borrower',
      p_reason: reason.trim()
    });
    if (error) throw error;
    showMessage('success', 'Request cancelled.');
    await loadHistory();
  }

  document.addEventListener('click', (event) => {
    if (event.target.closest('#history-magic-link')) {
      sendHistoryMagicLink().catch((error) => showMessage('danger', error.message));
      return;
    }

    const cancelButton = event.target.closest('[data-cancel-request]');
    if (cancelButton) {
      cancelRequest(cancelButton.getAttribute('data-cancel-request')).catch((error) => showMessage('danger', error.message));
    }
  });

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      const signedIn = await renderAuth();
      if (signedIn) await loadHistory();
    } catch (error) {
      showMessage('danger', error.message);
    }
  });
}());
