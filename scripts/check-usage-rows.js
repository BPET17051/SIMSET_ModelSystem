// Runnable check for buildUsageRows_ in google-sheets-manikin-sync.gs (loads the real file, stubs nothing else).
// Run: node scripts/check-usage-rows.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, 'google-sheets-manikin-sync.gs'), 'utf8'), ctx);
const build = ctx.buildUsageRows_;
const fmt = (d) => d.toISOString().slice(0, 10); // stand-in for Utilities.formatDate

// header order deliberately shuffled + extra columns: lookup must be by name
const H = ['x', 'status', 'course_name', 'session_id', 'sap_code', 'session_date'];
const row = (status, sess, sap, date, course = 'BLS') => ['x', status, course, sess, sap, date];

const today = '2026-11-07';
// Build the Date inside the vm context: `instanceof Date` is false for a Date from another realm.
const aDate = vm.runInContext("new Date('2026-11-08T00:00:00Z')", ctx);
const { rows, skipped } = build([
  H,
  row('ACTIVE', 'S1', '111', '2026-11-07'),                 // today, kept
  row('CONFLICT', 'S2', '112', '2026-11-20'),               // future, kept (double-booked is still "in use")
  row('ORPHAN_PENDING', 'S3', '113', '2026-11-20'),         // not a blocking status
  row('ACTIVE', 'S4', '114', '2026-11-06'),                 // past
  row('active', 'S5', '115', aDate),                        // Date object + lowercase status
  row('ACTIVE', 'S6', '116', '18/9/2569'),                  // unparseable date -> skipped
  row('ACTIVE', 'S7', '', '2026-11-09'),                    // no sap -> skipped
  row('', 'S8', '117', '2026-11-09')                        // legacy row without status
], today, fmt);

// JSON compare: arrays built inside the vm context have a different Array prototype than this file's.
assert.strictEqual(JSON.stringify(rows.map((r) => r.session_id)), JSON.stringify(['S1', 'S2', 'S5']));
assert.strictEqual(rows[2].usage_date, '2026-11-08');
assert.strictEqual(rows[2].status, 'ACTIVE');
assert.strictEqual(skipped, 2);
assert.throws(() => build([['session_id', 'sap_code']], today, fmt), /missing column/);
assert.throws(() => build([], today, fmt), /empty/);
console.log('check-usage-rows: ok');
