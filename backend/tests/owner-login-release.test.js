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

test('Backend publishes a no-store owner login status route for V9.2', () => {
  assert.match(server, /app\.get\('\/api\/auth\/owner-login-status'/);
  assert.match(server, /api_version: '9\.2\.1'/);
  assert.match(server, /owner_login_ready: registeredPaths\.length === paths\.length/);
});

test('all owner-login aliases share one handler and common rate limiting', () => {
  assert.match(server, /app\.post\('\/api\/auth\/login', ownerLoginHandler\)/);
  assert.match(server, /app\.post\('\/api\/owner\/login', ownerLoginHandler\)/);
  assert.match(server, /app\.post\('\/api\/auth\/owner-login', ownerLoginHandler\)/);
  assert.match(server, /event: 'api_request'/);
  assert.match(server, /origins\.add\('https:\/\/bakry-erp\.github\.io'\)/);
  assert.match(server, /origin_allowed: requestOriginAllowed/);
  assert.match(server, /registered_owner_login_paths: registeredPaths/);
  assert.match(server, /request_id: requestId/);
  assert.doesNotMatch(server, /console\.log\([^\n]*(?:password|authorization|req\.body)/i);
  assert.match(server, /if \(!rateLimitLogin\(req, res\)\) return/);
});

test('owner page retries supported paths and no longer emits the obsolete V7 warning', () => {
  assert.match(owner, /'\/api\/auth\/login', '\/api\/owner\/login', '\/api\/auth\/owner-login'/);
  assert.match(owner, /diagnoseOwnerLoginFailure/);
  assert.doesNotMatch(owner, /النسخة المنشورة لا تعلن عن مسار دخول المالك المطلوب/);
  assert.match(ownerHtml, /js\/owner\.js\?v=9\.2\.1/);
});

test('service worker fetches owner.html network-first instead of stale cache-first', () => {
  assert.match(sw, /const isDocument = .*\.html/);
  assert.match(sw, /Network-first keeps both index\.html and owner\.html/);
  assert.match(sw, /bakry-erp-local-v28/);
});

test('app registers the versioned service worker on HTTPS deployments', () => {
  assert.match(indexHtml, /bakry-service-worker-registration/);
  assert.match(indexHtml, /serviceWorker\.register\('\.\/sw\.js'/);
});

test('request tracing runs before CORS so OPTIONS preflights and rejected origins are logged', () => {
  const traceIndex = server.indexOf('// Trace before CORS');
  const corsIndex = server.indexOf('app.use(cors({');
  assert.ok(traceIndex >= 0 && corsIndex > traceIndex);
  assert.match(server, /method: req\.method/);
  assert.match(server, /origin_allowed: requestOriginAllowed/);
});
