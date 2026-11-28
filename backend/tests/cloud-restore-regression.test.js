import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const app = await readFile(new URL('js/app.js', root), 'utf8');
const index = await readFile(new URL('index.html', root), 'utf8');
const sw = await readFile(new URL('sw.js', root), 'utf8');
const server = await readFile(new URL('backend/server.js', root), 'utf8');

test('cloud session restore has bounded stages and backup is non-blocking', () => {
  assert.match(app, /restoreWithTimeout\(\(\) => CloudSync\.validateSession\(\), 20000/);
  assert.match(app, /restoreWithTimeout\(\(\) => CloudSync\.bootstrap\(\), 60000/);
  const initStart = app.indexOf('init: async function() {', app.indexOf('Auth: {'));
  const initEnd = app.indexOf('onLoginModeChange:', initStart);
  const initBlock = app.slice(initStart, initEnd);
  assert.match(initBlock, /Backups must never block restoring an already authenticated session/);
  assert.doesNotMatch(initBlock, /await App\.Settings\.runAutomaticBackups/);
});

test('cloud login internal errors expose a safe correlation id to the UI', () => {
  assert.match(server, /event: 'api_request_failed', request_id: requestId/);
  assert.match(server, /json\(\{ error: 'internal_error', request_id: requestId \}\)/);
  assert.match(server, /api_version: '9\.3\.3'/);
  assert.match(app, /رقم المتابعة: \$\{result\.request_id/);
});

test('frontend and service worker cache versions are advanced together', () => {
  assert.match(index, /js\/app\.js\?v=9\.3\.4/);
  assert.match(sw, /bakry-erp-local-v33/);
});


test('all CloudSync internal errors identify the failed API path and correlation id', async () => {
  const cloud = await readFile(new URL('js/cloud-sync.js', root), 'utf8');
  assert.match(cloud, /const requestId=String\(body\.request_id \|\| response\.headers\.get\('X-Request-Id'\) \|\| ''\)/);
  assert.match(cloud, /const failedPath=String\(path \|\| ''\)\.slice\(0,120\)/);
  assert.match(cloud, /رقم المتابعة: \$\{requestId \|\| 'غير متاح'\}/);
  assert.match(cloud, /error\.path=failedPath;error\.requestId=requestId/);
});

test('backend uses the same request id for API trace and error diagnostics', () => {
  assert.match(server, /req\.requestId = requestId/);
  assert.match(server, /const requestId = req\.requestId \|\| randomUUID\(\)/);
  assert.match(server, /event: 'api_request_failed', request_id: requestId/);
  assert.match(server, /res\.status\(500\)\.json\(\{ error: 'internal_error', request_id: requestId \}\)/);
});

test('local session restoration has a bounded IndexedDB open', () => {
  assert.match(app, /restoreWithTimeout\(\(\) => MotoDB\.ensureReady\(\), 18000/);
  assert.match(app, /restoreWithTimeout\(\(\) => App\.switchTab\(route/);
});

test('cloud backups remain opt-in and require a complete destination', () => {
  assert.match(app, /backup\.backup_cloud_enable === true && \(s3Ready \|\| webhookReady\)/);
  assert.match(app, /s3_credentials_configured === true/);
  assert.match(app, /webhook_url_configured === true/);
  assert.match(app, /Activation\/login must never depend on a backup destination such as R2/);
});


test('subscription activation does not wait for a backup destination or R2 setup', () => {
  const start = app.indexOf('submitActivation: async function');
  const end = app.indexOf('normalizePassword: function', start);
  const activation = app.slice(start, end);
  assert.doesNotMatch(activation, /await App\.Settings\.runAutomaticBackups/);
  assert.match(activation, /Activation\/login must never depend on a backup destination such as R2/);
});

test('health schema readiness checks columns used by tenant login and cloud bootstrap', () => {
  assert.match(server, /\('tenant_users','password_hash'\)/);
  assert.match(server, /\('tenant_subscriptions','starts_at'\)/);
  assert.match(server, /\('app_records','record_uuid'\)/);
  assert.match(server, /\('app_records','record_data'\)/);
  assert.match(server, /\('sync_operations','operation_uuid'\)/);
});
