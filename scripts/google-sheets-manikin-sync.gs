// T14 preparation. Install trigger only after RPC and Sync Auth UID are approved.
function syncManikinStatus() {
  const props = PropertiesService.getScriptProperties();
  const supabaseUrl = (props.getProperty('SUPABASE_URL') || '').trim();
  const anonKey = (props.getProperty('SUPABASE_ANON_KEY') || '').trim();
  const syncJwt = getSyncAccessToken_(supabaseUrl, props);
  if (!supabaseUrl || !anonKey || !syncJwt) throw new Error('Missing SUPABASE_URL, SUPABASE_ANON_KEY or Sync token settings');

  const sheetId = props.getProperty('MODELS_SHEET_ID');
  if (!sheetId) throw new Error('Missing MODELS_SHEET_ID');
  const sheet = SpreadsheetApp.openById(sheetId).getSheetByName('Models_Data');
  if (!sheet) throw new Error('Sheet Models_Data not found');
  const values = sheet.getDataRange().getValues();
  values.shift();
  // The source sheet currently contains a duplicate `model_id` header (B = unit ID,
  // E = procurement code). Map by verified column positions so B cannot be overwritten.
  const rows = values.map((row) => ({
    sap_code: String(row[0] ?? '').trim(),
    model_id: String(row[1] ?? '').trim(),
    model_type: String(row[6] ?? '').trim(),
    category: String(row[7] ?? '').trim(),
    status: String(row[8] ?? '').trim()
  }));
  const payload = rows.filter((row) => row.sap_code && row.model_id && row.status).map((row) => ({
    sap_id: row.sap_code,
    model_id: row.model_id,
    sheet_status: row.status
  }));
  if (!payload.length) throw new Error('No valid rows found in Models_Data');

  const response = UrlFetchApp.fetch(`${supabaseUrl}/rest/v1/rpc/sync_manikin_status_from_sheet`, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: `Bearer ${syncJwt}`, apikey: anonKey },
    payload: JSON.stringify({ p_rows: payload }),
    muteHttpExceptions: true
  });
  if (response.getResponseCode() >= 300) {
    PropertiesService.getScriptProperties().setProperty('LAST_SYNC_ERROR', response.getContentText());
    throw new Error(`Sync failed (${response.getResponseCode()}): ${redactSecrets_(response.getContentText())}`);
  }
  PropertiesService.getScriptProperties().setProperty('LAST_SYNC_AT', new Date().toISOString());
  PropertiesService.getScriptProperties().deleteProperty('LAST_SYNC_ERROR');
  // Shown in Executions > the run's log (returned values are not shown there).
  Logger.log('sync ok: rows_sent=%s result=%s', payload.length, response.getContentText());
  return response.getContentText();
}

// Read-only reconciliation; intentionally does not write metadata or availability.
function reconcileManikinMetadata() {
  const props = PropertiesService.getScriptProperties();
  const supabaseUrl = (props.getProperty('SUPABASE_URL') || '').trim();
  const sheetId = props.getProperty('MODELS_SHEET_ID');
  const syncJwt = getSyncAccessToken_(supabaseUrl, props);
  if (!supabaseUrl || !sheetId || !syncJwt) throw new Error('Missing reconciliation settings');
  const sheet = SpreadsheetApp.openById(sheetId).getSheetByName('Models_Data');
  if (!sheet) throw new Error('Sheet Models_Data not found');
  const values = sheet.getDataRange().getValues();
  values.shift();
  const source = values.map((row) => ({
    sap_id: String(row[0] ?? '').trim(),
    model_id: String(row[1] ?? '').trim(),
    model_type: String(row[6] ?? '').trim(),
    category: String(row[7] ?? '').trim(),
    sheet_status: String(row[8] ?? '').trim()
  })).filter((row) => row.sap_id);
  const response = UrlFetchApp.fetch(`${supabaseUrl}/rest/v1/manikins?select=sap_id,model_id,display_name,status,is_active&order=sap_id`, {
    method: 'get',
    headers: { Authorization: `Bearer ${syncJwt}`, apikey: (props.getProperty('SUPABASE_ANON_KEY') || '').trim() },
    muteHttpExceptions: true
  });
  if (response.getResponseCode() >= 300) throw new Error(`Reconciliation failed (${response.getResponseCode()}): ${redactSecrets_(response.getContentText())}`);
  const production = JSON.parse(response.getContentText());
  const bySap = Object.fromEntries(production.map((row) => [String(row.sap_id), row]));
  const sheetOnly = source.filter((row) => !bySap[row.sap_id]).map((row) => ({
    sap_id: row.sap_id,
    model_id: row.model_id,
    source_status: row.sheet_status,
    classification: /โอนย้าย|ถ่ายโอน/i.test(row.sheet_status) ? 'transferred' : /ปลดระวาง|งดใช้งาน/i.test(row.sheet_status) ? 'retired' : 'unclassified'
  }));
  const report = JSON.stringify({ source_count: source.length, production_count: production.length, matched_count: source.length - sheetOnly.length, sheet_only: sheetOnly });
  Logger.log(report);
  return report;
}

function redactSecrets_(text) {
  return String(text || '').replace(/(Bearer\s+)[^\s"']+/gi, '$1[REDACTED]').replace(/(refresh_token["']?\s*[:=]\s*["']?)[^,\s"']+/gi, '$1[REDACTED]');
}

function getSyncAccessToken_(supabaseUrl, props) {
  const anonKey = (props.getProperty('SUPABASE_ANON_KEY') || '').trim();
  const refreshToken = (props.getProperty('SYNC_REFRESH_TOKEN') || '').trim();
  if (!supabaseUrl || !anonKey || !refreshToken) {
    throw new Error('Missing SUPABASE_URL, SUPABASE_ANON_KEY or SYNC_REFRESH_TOKEN');
  }

  const cached = props.getProperty('SYNC_ACCESS_TOKEN');
  const expiresAt = Number(props.getProperty('SYNC_ACCESS_TOKEN_EXPIRES_AT') || 0);
  if (cached && expiresAt > Date.now() + 60000) return cached;

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    // Re-read after locking so concurrent runs reuse the token another run refreshed.
    const lockedCached = props.getProperty('SYNC_ACCESS_TOKEN');
    const lockedExpiresAt = Number(props.getProperty('SYNC_ACCESS_TOKEN_EXPIRES_AT') || 0);
    if (lockedCached && lockedExpiresAt > Date.now() + 60000) return lockedCached;

    const response = UrlFetchApp.fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'post',
      contentType: 'application/json',
      headers: { apikey: anonKey },
      payload: JSON.stringify({ refresh_token: refreshToken }),
      muteHttpExceptions: true
    });
    if (response.getResponseCode() >= 300) throw new Error(`Supabase token refresh failed: ${response.getResponseCode()}`);

    const token = JSON.parse(response.getContentText());
    if (!token.access_token || !token.expires_in) throw new Error('Supabase token response incomplete');
    props.setProperties({
      SYNC_ACCESS_TOKEN: token.access_token,
      SYNC_ACCESS_TOKEN_EXPIRES_AT: String(Date.now() + (Number(token.expires_in) * 1000))
    }, false);
    if (token.refresh_token) props.setProperty('SYNC_REFRESH_TOKEN', token.refresh_token);
    return token.access_token;
  } finally {
    lock.releaseLock();
  }
}
