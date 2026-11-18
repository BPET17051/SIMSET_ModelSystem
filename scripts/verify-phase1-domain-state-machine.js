const fs = require('fs');
const path = require('path');
const { ROOT, read, assert, assertContains } = require('./verify-lib');

const SQL_PATH = 'supabase/phase1_domain_state_machine.sql';

assert(fs.existsSync(path.join(ROOT, SQL_PATH)), `Expected file to exist: ${SQL_PATH}`);

const sql = read(SQL_PATH);
const workerJs = read('cloudflare-worker/worker.js');

for (const status of ['pending', 'approved', 'rejected', 'ready', 'borrowed', 'returned', 'cancelled', 'expired']) {
  assertContains(sql, new RegExp(`'${status}'`), SQL_PATH);
}

assertContains(sql, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.transition_borrow_request_status\s*\(/i, SQL_PATH);
assertContains(sql, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.expire_pending_borrow_requests\s*\(\s*p_system_actor_id\s+uuid/i, SQL_PATH);
assertContains(sql, /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.borrow_request_status_audit/i, SQL_PATH);
assertContains(sql, /CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\s+pg_cron/i, SQL_PATH);

for (const column of ['from_status', 'to_status', 'actor_user_id', 'actor_type', 'reason', 'created_at']) {
  assertContains(sql, new RegExp(`\\b${column}\\b`, 'i'), SQL_PATH);
}

assertContains(sql, /p_actor_user_id\s+uuid/i, SQL_PATH);
assertContains(sql, /p_actor_user_id\s+IS\s+DISTINCT\s+FROM\s+auth\.uid\(\)/i, SQL_PATH);
assertContains(sql, /pending'\s+AND\s+p_next_status\s+IN\s*\('approved',\s*'rejected',\s*'cancelled',\s*'expired'\)/i, SQL_PATH);
assertContains(sql, /p_current_status\s*=\s*'borrowed'\s+AND\s+p_next_status\s*=\s*'returned'/i, SQL_PATH);
assertContains(sql, /cron\.schedule\s*\(/i, SQL_PATH);
assertContains(sql, /00000000-0000-0000-0000-000000000001/, SQL_PATH);
assertContains(sql, /expire_pending_borrow_requests/i, SQL_PATH);
assertContains(sql, /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.transition_borrow_request_status/i, SQL_PATH);
assertContains(sql, /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.expire_pending_borrow_requests/i, SQL_PATH);
assertContains(workerJs, /\/rest\/v1\/rpc\/transition_borrow_request_status/, 'cloudflare-worker/worker.js');

console.log('Phase 1 domain state machine contract checks passed');
