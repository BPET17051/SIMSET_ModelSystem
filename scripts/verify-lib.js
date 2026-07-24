const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertExists(relativePath) {
  assert(fs.existsSync(path.join(ROOT, relativePath)), `Expected file to exist: ${relativePath}`);
}

function assertMissing(relativePath) {
  assert(!fs.existsSync(path.join(ROOT, relativePath)), `Expected generated/secret-like file to be absent: ${relativePath}`);
}

function assertNotContains(text, pattern, label) {
  assert(!pattern.test(text), `${label} still contains ${pattern}`);
}

function assertContains(text, pattern, label) {
  assert(pattern.test(text), `${label} is missing ${pattern}`);
}

module.exports = { ROOT, read, assert, assertExists, assertMissing, assertNotContains, assertContains };
