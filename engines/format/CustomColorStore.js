'use strict';

(function initCustomColorStore(global) {
  const KEY = 'rf.customColors.v1';
  const MAX = 16;

  function getColors() {
    try {
      const stored = JSON.parse(localStorage.getItem(KEY));
      if (Array.isArray(stored)) {
        const arr = stored.slice(0, MAX);
        while (arr.length < MAX) arr.push(null);
        return arr;
      }
    } catch (_) { /* ignore */ }
    return new Array(MAX).fill(null);
  }

  function addColor(hex) {
    const norm = global.ColorConverter.normalizeHex(hex);
    if (!norm) return;
    const colors = getColors();
    // Remove duplicate if already present
    const dup = colors.indexOf(norm);
    if (dup !== -1) colors.splice(dup, 1, null);
    // Find first empty slot
    const idx = colors.indexOf(null);
    if (idx !== -1) {
      colors[idx] = norm;
    } else {
      // Shift left and append at end
      colors.shift();
      colors.push(norm);
    }
    try { localStorage.setItem(KEY, JSON.stringify(colors)); } catch (_) { /* ignore */ }
  }

  global.CustomColorStore = { getColors, addColor };
})(window);
