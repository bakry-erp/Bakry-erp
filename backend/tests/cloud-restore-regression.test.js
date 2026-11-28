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
  assert.match(server, /api_version: '9\.3\.2'/);
  assert.match(app, /رقم المتابعة: \$\{result\.request_id/);
});

test('frontend and service worker cache versions are advanced together', () => {
  assert.match(index, /js\/app\.js\?v=9\.3\.2/);
  assert.match(sw, /bakry-erp-local-v31/);
});
