const USE_SUPABASE = true;
const SIMSET_SUPABASE_URL = 'https://simset-showroom-proxy.simset-admin.workers.dev';
const SIMSET_SUPABASE_ANON = 'worker-managed-key';

window.SimsetBorrow = window.SimsetBorrow || {};
window.SimsetBorrow.supabase = null;
window.SimsetBorrow.apiBaseUrl = SIMSET_SUPABASE_URL;

if (!window.supabase?.createClient) {
  throw new Error('Supabase client library is required.');
}

window.SimsetBorrow.supabase = window.supabase.createClient(SIMSET_SUPABASE_URL, SIMSET_SUPABASE_ANON);
