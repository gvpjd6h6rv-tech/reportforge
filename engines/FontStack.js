'use strict';

(function initFontStack(global) {
  // Arial/Helvetica are not guaranteed to exist on a Linux host (no msttcorefonts
  // by default) — resolving them straight to a free, metric-reasonable Linux stack
  // keeps canvas/preview rendering deterministic across machines without depending
  // on a proprietary font being installed. Stored document data keeps using the
  // canonical name (e.g. "Arial") for UI/export purposes; only this render-time
  // resolution step substitutes the portable stack.
  // Single-quoted font names: PreviewEngineData.js interpolates this value
  // straight into a double-quoted HTML style="..." attribute string — double
  // quotes here would prematurely close that attribute and silently corrupt
  // every style declared after font-family (font-weight, font-size, etc).
  const LINUX_SAFE_SANS_STACK = "'Liberation Sans', 'DejaVu Sans', 'Noto Sans', sans-serif";
  const PORTABLE_FALLBACKS = {
    arial: LINUX_SAFE_SANS_STACK,
    helvetica: LINUX_SAFE_SANS_STACK,
  };

  function resolveCssFontFamily(name) {
    const key = String(name || '').trim().toLowerCase();
    if (!key) return LINUX_SAFE_SANS_STACK;
    return PORTABLE_FALLBACKS[key] || name;
  }

  global.FontStack = { resolveCssFontFamily, LINUX_SAFE_SANS_STACK };
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof module !== 'undefined') module.exports = globalThis.FontStack;
