// T14 preparation. Install trigger only after RPC and Sync Auth UID are approved.
function syncManikinStatus() {
  const props = PropertiesService.getScriptProperties();
  const supabaseUrl = (props.getProperty('SUPABASE_URL') || '').trim();
  const anonKey = (props.getProperty('SUPABASE_ANON_KEY') || '').trim();
  const syncJwt = getSyncAccessToken_(supabaseUrl, props);
  if (!supabaseUrl || !anonKey || !syncJwt) throw new Error('Missing SUPABASE_URL, SUPABASE_ANON_KEY or Sync token settings');

  const sheetId = props.getProperty('MODELS_SHEET_ID');
  if (!sheetId) throw new Error('Missing MODELS_SHEET_ID');
  const spreadsheet = SpreadsheetApp.openById(sheetId);
  const sheet = spreadsheet.getSheetByName('Models_Data');
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
  // Usage sync (Sessions tab) must never break the status sync above: its own try/catch, its own error property.
  try {
    syncManikinUsage_(supabaseUrl, anonKey, syncJwt, spreadsheet);
    props.deleteProperty('LAST_USAGE_SYNC_ERROR');
  } catch (e) {
    props.setProperty('LAST_USAGE_SYNC_ERROR', redactSecrets_(e.message));
    Logger.log('usage sync failed: %s', redactSecrets_(e.message));
  }
  // New units in the sheet -> Supabase (T21). Own try/catch: it must never break the status sync above.
  try {
    importNewManikins_(supabaseUrl, anonKey, syncJwt, values);
    props.deleteProperty('LAST_IMPORT_ERROR');
  } catch (e) {
    props.setProperty('LAST_IMPORT_ERROR', redactSecrets_(e.message));
    Logger.log('import new manikins failed: %s', redactSecrets_(e.message));
  }
  return response.getContentText();
}

// Sends only ready units; the RPC skips the ones Supabase already has. Columns by verified position:
// A sap, B unit id, D asset code, E display name, G type, I status. ponytail: positions, not headers (the sheet has a
// duplicate `model_id` header); if columns move, check these first. Check the Logger line "result=" after each run.
function importNewManikins_(supabaseUrl, anonKey, syncJwt, values) {
  const rows = values.map((row) => ({
    sap_id: String(row[0] ?? '').trim(),
    model_id: String(row[1] ?? '').trim(),
    asset_code: String(row[3] ?? '').trim(),
    display_name: String(row[4] ?? '').trim(),
    model_type: String(row[6] ?? '').trim(),
    sheet_status: String(row[8] ?? '').trim()
  })).filter((row) => row.sap_id && row.model_id && row.display_name && row.sheet_status === 'พร้อมใช้งาน');
  if (!rows.length) return;
  const response = UrlFetchApp.fetch(`${supabaseUrl}/rest/v1/rpc/import_new_manikins_from_sheet`, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: `Bearer ${syncJwt}`, apikey: anonKey },
    payload: JSON.stringify({ p_rows: rows }),
    muteHttpExceptions: true
  });
  if (response.getResponseCode() >= 300) throw new Error(`Import failed (${response.getResponseCode()}): ${redactSecrets_(response.getContentText())}`);
  Logger.log('import ok: rows_sent=%s result=%s', rows.length, response.getContentText());
}

// --- Manikin usage: Sessions tab (written by the timer project) -> Supabase manikin_usage_blocks. ---
// Stage 1 = staff warnings only. ACTIVE and CONFLICT both mean "this manikin is in a course that day"
// (the timer project marks CONFLICT when one manikin is booked twice in overlapping times).
const USAGE_BLOCKING_STATUSES_ = ['ACTIVE', 'CONFLICT'];

// Pure on purpose (no Apps Script services) so scripts/check-usage-rows.js can test it in Node.
// Columns are found by header name, so reordering columns in Sessions cannot silently shift the data.
function buildUsageRows_(values, todayYmd, formatDate) {
  if (!values.length) throw new Error('Sessions sheet is empty');
  const header = values[0].map((h) => String(h).trim());
  const col = {};
  ['session_id', 'sap_code', 'session_date', 'status', 'course_name'].forEach((name) => {
    col[name] = header.indexOf(name);
    if (col[name] < 0) throw new Error(`Sessions is missing column ${name}`);
  });
  const rows = [];
  let skipped = 0;
  values.slice(1).forEach((row) => {
    const status = String(row[col.status] ?? '').trim().toUpperCase();
    if (!USAGE_BLOCKING_STATUSES_.includes(status)) return;
    const raw = row[col.session_date];
    const date = raw instanceof Date ? formatDate(raw) : String(raw ?? '').trim();
    const sessionId = String(row[col.session_id] ?? '').trim();
    const sapId = String(row[col.sap_code] ?? '').trim();
    // ponytail: only ISO yyyy-mm-dd (or a real Date) is understood; anything else is counted as skipped and logged.
    if (!sessionId || !sapId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { skipped++; return; }
    if (date < todayYmd) return;
    rows.push({ session_id: sessionId, sap_id: sapId, usage_date: date, course_name: String(row[col.course_name] ?? '').trim(), status });
  });
  return { rows, skipped };
}

function syncManikinUsage_(supabaseUrl, anonKey, syncJwt, spreadsheet) {
  const sheet = spreadsheet.getSheetByName('Sessions');
  if (!sheet) throw new Error('Sheet Sessions not found');
  const ymd = (d) => Utilities.formatDate(d, 'Asia/Bangkok', 'yyyy-MM-dd');
  const { rows, skipped } = buildUsageRows_(sheet.getDataRange().getValues(), ymd(new Date()), ymd);
  if (!rows.length) {
    Logger.log('usage sync: no current/future sessions (skipped=%s), nothing sent', skipped);
    return;
  }
  const response = UrlFetchApp.fetch(`${supabaseUrl}/rest/v1/rpc/sync_manikin_usage_from_sheet`, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: `Bearer ${syncJwt}`, apikey: anonKey },
    payload: JSON.stringify({ p_rows: rows }),
    muteHttpExceptions: true
  });
  if (response.getResponseCode() >= 300) throw new Error(`Usage sync failed (${response.getResponseCode()}): ${redactSecrets_(response.getContentText())}`);
  Logger.log('usage sync ok: rows_sent=%s skipped=%s result=%s', rows.length, skipped, response.getContentText());
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
