import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.resolve(here, '../../js/ui-preferences.js'), 'utf8');

function createSurface(storage, standalone) {
  const attrs = {};
  const meta = { content: '', setAttribute(name, value) { if (name === 'content') this.content = value; } };
  const document = {
    documentElement: { setAttribute(name, value) { attrs[name] = value; } },
    querySelector(selector) { return selector === 'meta[name="viewport"]' ? meta : null; }
  };
  const window = {
    document,
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); }
    },
    navigator: { standalone, userAgent: 'Mozilla/5.0 (Linux; Android 14) Mobile' },
    screen: { width: 393 },
    matchMedia(query) { return { matches: query === '(display-mode: standalone)' && standalone }; }
  };
  vm.runInNewContext(source, { window, Boolean, Number, Math, JSON });
  return { prefs: window.BakryUIPreferences, attrs, meta };
}

test('browser and installed PWA keep independent themes and layout preferences', () => {
  const sharedOriginStorage = new Map([['motomax_branding', JSON.stringify({ theme: 'light', name: 'معرض البكري' })]]);
  const browser = createSurface(sharedOriginStorage, false);
  const pwa = createSurface(sharedOriginStorage, true);

  browser.prefs.setTheme('dark');
  browser.prefs.setLayout('desktop');

  assert.equal(browser.prefs.get().theme, 'dark');
  assert.equal(browser.prefs.get().layout, 'desktop');
  assert.equal(pwa.prefs.get().theme, 'light');
  assert.equal(pwa.prefs.get().layout, 'auto');
  assert.equal(browser.prefs.get().surface, 'browser');
  assert.equal(pwa.prefs.get().surface, 'pwa');
  assert.match(browser.meta.content, /^width=1100,/);
  assert.match(pwa.meta.content, /^width=device-width,/);
});

test('visual preferences do not overwrite shared business branding data', () => {
  const storage = new Map([['motomax_branding', JSON.stringify({ theme: 'light', name: 'معرض البكري' })]]);
  const browser = createSurface(storage, false);
  browser.prefs.setTheme('bluegold');
  const branding = JSON.parse(storage.get('motomax_branding'));
  assert.equal(branding.name, 'معرض البكري');
  assert.equal(branding.theme, 'light');
  assert.equal(JSON.parse(storage.get('bakry_ui_preferences_v1_browser')).theme, 'bluegold');
});
