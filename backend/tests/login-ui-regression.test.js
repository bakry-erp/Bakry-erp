import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const stability = fs.readFileSync(path.join(root, 'css/bakry-stability.css'), 'utf8');
const prefs = fs.readFileSync(path.join(root, 'js/ui-preferences.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

test('manual login shows a spinner only while processing and restores the original button afterward', () => {
  assert.match(app, /button\.innerHTML='<span class="bakry-login-spinner" aria-hidden="true"><\/span>'/);
  assert.match(app, /const progress=\(\)=>\{\};/);
  assert.match(app, /button\.dataset\.originalHtml/);
  assert.match(app, /button\.removeAttribute\('aria-busy'\)/);
  assert.match(app, /if\(hint\)\{hint\.style\.display='block';hint\.textContent=error\.message/);
  assert.match(stability, /\.bakry-login-spinner/);
});

test('login screen has no informational storage and input guidance, while retaining an error region', () => {
  assert.doesNotMatch(html, /local-auth-note/);
  assert.doesNotMatch(html, /الوضع المحلي لا يشارك البيانات/);
  assert.doesNotMatch(html, /تم ضبط اتصال السيرفر تلقائيًا/);
  assert.match(html, /id="login-hint"/);
});

test('startup session restore overlay is spinner-only', () => {
  assert.match(stability, /bakry-auth-pending:not\(\.bakry-authenticated\) body::before[\s\S]*?content:""/);
  assert.doesNotMatch(stability, /content:"جارٍ استعادة جلسة الدخول/);
});

test('PWA launch uses a stable app id and an explicit mobile-surface marker', () => {
  assert.equal(manifest.id, './');
  assert.equal(manifest.start_url, './?bakry_surface=pwa');
  assert.equal(manifest.display, 'standalone');
  assert.match(prefs, /get\('bakry_surface'\) === 'pwa'/);
  assert.match(prefs, /state\.layout = 'mobile'/);
  assert.match(html, /js\/ui-preferences\.js\?v=9\.3\.4/);
  assert.match(sw, /bakry-erp-local-v33/);
  assert.match(sw, /ui-preferences\.js\?v=9\.3\.4/);
});
