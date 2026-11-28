/* Bakry ERP — isolated visual preferences for browser and installed PWA surfaces.
   Business records and the IndexedDB/cloud sync layer remain shared. */
(function (global) {
  'use strict';
  const root = global.document.documentElement;
  const validThemes = ['light', 'dark', 'bluegold'];
  const validLayouts = ['auto', 'mobile', 'desktop'];
  const isStandalone = (() => {
    try {
      const displayModes = ['standalone', 'fullscreen', 'minimal-ui'];
      const displayModeMatch = displayModes.some(mode =>
        global.matchMedia && global.matchMedia(`(display-mode: ${mode})`).matches
      );
      const androidTwa = String(global.document.referrer || '').startsWith('android-app://');
      return Boolean(global.navigator.standalone) || displayModeMatch || androidTwa;
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
    // An installed app is deliberately mobile-only. Browser tabs retain their own layout choice.
    layout: isStandalone ? 'mobile' : (validLayouts.includes(saved.layout) ? saved.layout : 'auto')
  };
  const persist = () => {
    try { global.localStorage.setItem(storageKey, JSON.stringify(state)); } catch (_) {}
  };
  function applyViewport() {
    const meta = global.document.querySelector('meta[name="viewport"]');
    if (!meta) return;
    if (isStandalone) {
      // Keep the installed app on a phone-sized responsive breakpoint, even on wide screens.
      const screenWidth = Number(global.screen && global.screen.width) || 393;
      const width = Math.min(430, Math.max(320, Math.round(screenWidth)));
      meta.setAttribute('content', `width=${width}, initial-scale=1, minimum-scale=0.75, maximum-scale=3, viewport-fit=cover`);
      return;
    }
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
    state.layout = isStandalone ? 'mobile' : (validLayouts.includes(layout) ? layout : 'auto');
    root.setAttribute('data-layout-mode', state.layout);
    persist();
    applyViewport();
  }
  function lockInstalledAppLayoutControl() {
    if (!isStandalone) return;
    const select = global.document.getElementById('set-layout-mode');
    if (select) {
      select.value = 'mobile';
      select.disabled = true;
      select.setAttribute('aria-disabled', 'true');
      select.title = 'التطبيق المثبت يعمل بواجهة الهاتف فقط';
    }
    const help = select && select.parentElement && select.parentElement.querySelector('small');
    if (help) help.textContent = 'التطبيق المثبت مخصص لواجهة الهاتف فقط. يمكنك تغيير طريقة العرض في الموقع داخل المتصفح دون التأثير على التطبيق.';
  }
  global.BAKRY_UI_SURFACE = surface;
  global.BakryUIPreferences = { surface, storageKey, get, setTheme, setLayout, applyViewport };
  persist();
  apply();
  if (isStandalone) {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', lockInstalledAppLayoutControl, { once: true });
    } else {
      lockInstalledAppLayoutControl();
    }
  }
})(window);
