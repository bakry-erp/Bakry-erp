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

test('Backend publishes a no-store owner login status route for V9.3', () => {
  assert.match(server, /app\.get\('\/api\/auth\/owner-login-status'/);
  assert.match(server, /api_version: '9\.3\.3'/);
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
  assert.match(owner, /function apiUrl\(base,path\)/);
  assert.match(owner, /fetchApi\(apiUrl\(state\.apiBase,path\)/);
  assert.doesNotMatch(owner, /النسخة المنشورة لا تعلن عن مسار دخول المالك المطلوب/);
  assert.match(ownerHtml, /js\/owner\.js\?v=9\.3\.3/);
});

test('service worker fetches owner.html network-first instead of stale cache-first', () => {
  assert.match(sw, /const isDocument = .*\.html/);
  assert.match(sw, /Network-first keeps both index\.html and owner\.html/);
  assert.match(sw, /bakry-erp-local-v32/);
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


test('tenant identity can be edited through an owner-only PATCH route', () => {
  assert.match(server, /app\.patch\('\/api\/owner\/tenants\/:tenantId\/identity', requireOwner/);
  assert.match(server, /normalizeTenantIdentity\(req\.body \|\| \{\}\)/);
  assert.match(server, /tenant_identity_updated/);
  assert.match(server, /tenant_slug_already_exists/);
  assert.match(owner, /editTenantIdentity/);
  assert.match(owner, /تعديل الاسم والكود/);
});

test('storage controls no longer call the missing legacy database endpoints', () => {
  assert.match(server, /app\.get\('\/api\/settings\/storage'/);
  assert.match(server, /app\.put\('\/api\/settings\/storage'/);
  assert.match(server, /app\.post\('\/api\/settings\/db\/test'/);
  assert.match(server, /app\.post\('\/api\/settings\/backups\/cloud'/);
  assert.doesNotMatch(indexHtml + fs.readFileSync(path.join(root, 'js/app.js'), 'utf8'), /\/api\/db\/(?:backup\/config|test-connection|migrate)/);
  assert.match(fs.readFileSync(path.join(root, 'js/db.js'), 'utf8'), /backup_snapshots/);
  assert.match(fs.readFileSync(path.join(root, 'js/app.js'), 'utf8'), /downloadLocalBackup/);
});

test('storage settings CORS allows the PUT method used by the settings UI', () => {
  assert.match(server, /methods: \[\s*'GET', 'POST', 'PUT', 'PATCH', 'OPTIONS'\s*\]/);
});

test('cloud backup upload network failures return controlled gateway errors', () => {
  assert.match(server, /backup_upload_failed_\|backup_upload_timeout\|backup_upload_network_error/);
  assert.match(fs.readFileSync(path.join(root, 'backend/storage-services.js'), 'utf8'), /backup_upload_network_error/);
});

test('storage secrets are encrypted and are not returned as plaintext', () => {
  assert.match(server, /webhook_url_encrypted/);
  assert.match(server, /webhook_url_configured: Boolean/);
  assert.match(server, /password_configured: Boolean\(db\.password_encrypted\)/);
  const storageGetStart = server.indexOf("app.get('/api/settings/storage'");
  const storagePutStart = server.indexOf("app.put('/api/settings/storage'");
  assert.ok(storagePutStart > storageGetStart);
  assert.doesNotMatch(server.slice(storageGetStart, storagePutStart), /decryptSetting\(backup\.webhook_url_encrypted/);
});

test('local administrator login and restore schedule backups without blocking login', () => {
  const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
  assert.match(app, /if\(currentRole==='admin'\) setTimeout\(\(\) => App\.Settings\.runAutomaticBackups/);
  assert.match(app, /if\(role==='admin'\) setTimeout\(\(\) => App\.Settings\.runAutomaticBackups/);
});

test('storage UI reports the actual active database engine separately from the saved preference', () => {
  const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
  assert.match(app, /getElementById\('db-runtime-status'\)/);
  assert.match(app, /محرك التشغيل الفعلي: PostgreSQL على خادم Render/);
  assert.match(app, /محرك التشغيل الفعلي: IndexedDB داخل هذا المتصفح/);
});
