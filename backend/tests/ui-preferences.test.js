import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.resolve(here, '../../js/ui-preferences.js'), 'utf8');

function createSurface(storage, standalone, screenWidth = 393, search = '') {
  const attrs = {};
  const meta = { content: '', setAttribute(name, value) { if (name === 'content') this.content = value; } };
  const layoutHint = { textContent: '' };
  const layoutSelect = {
    value: 'desktop', disabled: false, title: '', attrs: {},
    setAttribute(name, value) { this.attrs[name] = value; },
    parentElement: { querySelector(selector) { return selector === 'small' ? layoutHint : null; } }
  };
  const document = {
    referrer: '', readyState: 'complete',
    documentElement: { setAttribute(name, value) { attrs[name] = value; } },
    querySelector(selector) { return selector === 'meta[name="viewport"]' ? meta : null; },
    getElementById(id) { return id === 'set-layout-mode' ? layoutSelect : null; },
    addEventListener() {}
  };
  const window = {
    document,
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); }
    },
    navigator: { standalone, userAgent: 'Mozilla/5.0 (Linux; Android 14) Mobile' },
    screen: { width: screenWidth },
    location: { search },
    addEventListener() {},
    matchMedia(query) { return { matches: query === '(display-mode: standalone)' && standalone }; }
  };
  vm.runInNewContext(source, { window, Boolean, Number, Math, JSON, String, URLSearchParams });
  return { prefs: window.BakryUIPreferences, attrs, meta, layoutSelect, layoutHint };
}

test('browser and installed PWA keep independent themes while browser layout remains selectable', () => {
  const sharedOriginStorage = new Map([['motomax_branding', JSON.stringify({ theme: 'light', name: 'معرض البكري' })]]);
  const browser = createSurface(sharedOriginStorage, false);
  const pwa = createSurface(sharedOriginStorage, true);

  browser.prefs.setTheme('dark');
  browser.prefs.setLayout('desktop');
  pwa.prefs.setTheme('bluegold');
  pwa.prefs.setLayout('desktop');

  assert.equal(browser.prefs.get().theme, 'dark');
  assert.equal(browser.prefs.get().layout, 'desktop');
  assert.equal(pwa.prefs.get().theme, 'bluegold');
  assert.equal(pwa.prefs.get().layout, 'mobile');
  assert.equal(browser.prefs.get().surface, 'browser');
  assert.equal(pwa.prefs.get().surface, 'pwa');
  assert.match(browser.meta.content, /^width=1100,/);
  assert.match(pwa.meta.content, /^width=393,/);
  assert.equal(pwa.layoutSelect.disabled, true);
  assert.equal(pwa.layoutSelect.value, 'mobile');
  assert.match(pwa.layoutHint.textContent, /واجهة الهاتف فقط/);
});

test('installed PWA stays on a phone breakpoint even on a wide screen', () => {
  const pwa = createSurface(new Map(), true, 1440);
  assert.equal(pwa.prefs.get().layout, 'mobile');
  assert.match(pwa.meta.content, /^width=430,/);
  pwa.prefs.setLayout('desktop');
  assert.equal(pwa.prefs.get().layout, 'mobile');
  assert.match(pwa.meta.content, /^width=430,/);
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


test('installed PWA launch marker forces the mobile surface when display-mode is unavailable', () => {
  const pwa = createSurface(new Map([['bakry_ui_preferences_v1_browser', JSON.stringify({ layout: 'desktop' })]]), false, 1440, '?bakry_surface=pwa');
  assert.equal(pwa.prefs.get().surface, 'pwa');
  assert.equal(pwa.prefs.get().layout, 'mobile');
  assert.match(pwa.meta.content, /^width=430,/);
  pwa.prefs.setLayout('desktop');
  assert.equal(pwa.prefs.get().layout, 'mobile');
});
