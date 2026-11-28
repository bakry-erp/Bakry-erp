/* Bakry ERP — isolated visual preferences for browser and installed PWA surfaces.
   Business records and the IndexedDB/cloud sync layer remain shared. */
(function (global) {
  'use strict';
  const root = global.document.documentElement;
  const validThemes = ['light', 'dark', 'bluegold'];
  const validLayouts = ['auto', 'mobile', 'desktop'];
  const isStandalone = (() => {
    try {
      return Boolean(global.navigator.standalone) || Boolean(global.matchMedia && global.matchMedia('(display-mode: standalone)').matches);
    } catch (_) { return false; }
  })();
  const surface = isStandalone ? 'pwa' : 'browser';
  const storageKey = `bakry_ui_preferences_v1_${surface}`;
  const readObject = (key) => {
    try { const value = global.localStorage.getItem(key); return value ? JSON.parse(value) : null; }
    catch (_) { return null; }
  };
  const legacyBranding = readObject('motomax_branding') || {};
  const saved = readObject(storageKey) || {};
  const state = {
    theme: validThemes.includes(saved.theme) ? saved.theme : (validThemes.includes(legacyBranding.theme) ? legacyBranding.theme : 'light'),
    layout: validLayouts.includes(saved.layout) ? saved.layout : 'auto'
  };
  const persist = () => {
    try { global.localStorage.setItem(storageKey, JSON.stringify(state)); } catch (_) {}
  };
  function applyViewport() {
    const meta = global.document.querySelector('meta[name="viewport"]');
    if (!meta) return;
    const mobileDevice = /Android|iPhone|iPad|iPod|Mobile/i.test(global.navigator.userAgent || '') ||
      (global.screen && Number(global.screen.width) > 0 && Number(global.screen.width) <= 700);
    if (state.layout === 'desktop' && mobileDevice) {
      const width = 1100;
      const screenWidth = Number(global.screen && global.screen.width) || 393;
      const scale = Math.max(0.30, Math.min(1, screenWidth / width));
      meta.setAttribute('content', `width=${width}, initial-scale=${scale.toFixed(3)}, minimum-scale=0.25, maximum-scale=3, viewport-fit=cover`);
    } else {
      meta.setAttribute('content', 'width=device-width, initial-scale=1, viewport-fit=cover');
    }
  }
  function apply() {
    root.setAttribute('data-bakry-surface', surface);
    root.setAttribute('data-layout-mode', state.layout);
    root.setAttribute('data-theme', state.theme);
    applyViewport();
  }
  function get() { return { theme: state.theme, layout: state.layout, surface }; }
  function setTheme(theme) {
    state.theme = validThemes.includes(theme) ? theme : 'light';
    root.setAttribute('data-theme', state.theme);
    persist();
  }
  function setLayout(layout) {
    state.layout = validLayouts.includes(layout) ? layout : 'auto';
    root.setAttribute('data-layout-mode', state.layout);
    persist();
    applyViewport();
  }
  global.BAKRY_UI_SURFACE = surface;
  global.BakryUIPreferences = { surface, storageKey, get, setTheme, setLayout, applyViewport };
  persist();
  apply();
})(window);
