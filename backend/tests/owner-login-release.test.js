import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const server = fs.readFileSync(path.join(root, 'backend/server.js'), 'utf8');
const owner = fs.readFileSync(path.join(root, 'js/owner.js'), 'utf8');
const ownerHtml = fs.readFileSync(path.join(root, 'owner.html'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

test('Backend publishes a no-store owner login status route for V9', () => {
  assert.match(server, /app\.get\('\/api\/auth\/owner-login-status'/);
  assert.match(server, /api_version: '9\.0\.0'/);
  assert.match(server, /owner_login_ready: true/);
});

test('all owner-login aliases share one handler and common rate limiting', () => {
  assert.match(server, /app\.post\(\['\/api\/auth\/login', '\/api\/owner\/login', '\/api\/auth\/owner-login'\], ownerLoginHandler\)/);
  assert.match(server, /if \(!rateLimitLogin\(req, res\)\) return/);
});

test('owner page retries supported paths and no longer emits the obsolete V7 warning', () => {
  assert.match(owner, /'\/api\/auth\/login', '\/api\/owner\/login', '\/api\/auth\/owner-login'/);
  assert.match(owner, /diagnoseOwnerLoginFailure/);
  assert.doesNotMatch(owner, /النسخة المنشورة لا تعلن عن مسار دخول المالك المطلوب/);
  assert.match(ownerHtml, /js\/owner\.js\?v=9\.0\.0/);
});

test('service worker fetches owner.html network-first instead of stale cache-first', () => {
  assert.match(sw, /const isDocument = .*\.html/);
  assert.match(sw, /Network-first keeps both index\.html and owner\.html/);
  assert.match(sw, /bakry-erp-local-v27/);
});

test('app registers the versioned service worker on HTTPS deployments', () => {
  assert.match(indexHtml, /bakry-service-worker-registration/);
  assert.match(indexHtml, /serviceWorker\.register\('\.\/sw\.js'/);
});
