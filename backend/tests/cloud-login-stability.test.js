import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const app = await readFile(path.join(root, 'js/app.js'), 'utf8');
const cloud = await readFile(path.join(root, 'js/cloud-sync.js'), 'utf8');
const html = await readFile(path.join(root, 'index.html'), 'utf8');
const sw = await readFile(path.join(root, 'sw.js'), 'utf8');

test('cloud login has separate progress stages and bounded network waits', () => {
  assert.match(app, /جارٍ الاتصال بخادم المنشأة والتحقق من الحساب/);
  assert.match(app, /جارٍ تحميل بيانات المنشأة السحابية/);
  assert.match(app, /AbortController/);
  assert.match(app, /65000/);
  assert.match(app, /withTimeout\(CloudSync\.bootstrap\(\),90000/);
});

test('automatic backup no longer blocks cloud login completion', () => {
  const loginStart = app.indexOf("if(mode==='cloud') {");
  const loginEnd = app.indexOf("} else {", loginStart);
  const cloudLogin = app.slice(loginStart, loginEnd);
  assert.match(cloudLogin, /setTimeout\(\(\)=>App\.Settings\.runAutomaticBackups/);
  assert.doesNotMatch(cloudLogin, /await App\.Settings\.runAutomaticBackups/);
});

test('CloudSync requests have a finite timeout and report the failed API path', () => {
  assert.match(cloud, /timeoutMs=Number\(options\.timeoutMs\)\|\|65000/);
  assert.match(cloud, /انتهت مهلة طلب السحابة/);
});

test('new frontend cache versions are referenced', () => {
  assert.match(html, /js\/cloud-sync\.js\?v=1\.4\.2/);
  assert.match(html, /js\/app\.js\?v=9\.3\.3/);
  assert.match(sw, /bakry-erp-local-v32/);
});


test('cloud backup requests are gated by explicit opt-in and completed destination settings', () => {
  assert.match(app, /backup\.backup_cloud_enable === true && \(s3Ready \|\| webhookReady\)/);
  assert.match(app, /s3_credentials_configured === true/);
  assert.match(app, /webhook_url_configured === true/);
});
