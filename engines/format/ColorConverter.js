'use strict';

(function initColorConverter(global) {

  function clampRgb(v) {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.max(0, Math.min(255, n)) : 0;
  }

  function clampPercent(v) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
  }

  function clampHue(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return ((n % 360) + 360) % 360;
  }

  function normalizeHex(value) {
    if (!value || value === 'transparent') return null;
    let h = String(value).trim().replace(/^#/, '').toUpperCase();
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (!/^[0-9A-F]{6}$/.test(h)) return null;
    return '#' + h;
  }

  function hexToRgb(hex) {
    const h = normalizeHex(hex);
    if (!h) return null;
    return {
      r: parseInt(h.slice(1, 3), 16),
      g: parseInt(h.slice(3, 5), 16),
      b: parseInt(h.slice(5, 7), 16),
    };
  }

  function rgbToHex(r, g, b) {
    const toH = (v) => clampRgb(v).toString(16).padStart(2, '0').toUpperCase();
    return '#' + toH(r) + toH(g) + toH(b);
  }

  // Returns { h: 0..360, s: 0..100, l: 0..100 }
  function rgbToHsl(r, g, b) {
    r = clampRgb(r) / 255;
    g = clampRgb(g) / 255;
    b = clampRgb(b) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (delta > 0) {
      s = delta / (1 - Math.abs(2 * l - 1));
      if (max === r) h = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / delta + 2) / 6;
      else h = ((r - g) / delta + 4) / 6;
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
  }

  // h: 0..360, s: 0..100, l: 0..100 → { r, g, b } 0..255
  function hslToRgb(h, s, l) {
    h = clampHue(h);
    s = clampPercent(s) / 100;
    l = clampPercent(l) / 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60)       { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else              { r = c; g = 0; b = x; }
    return { r: clampRgb((r + m) * 255), g: clampRgb((g + m) * 255), b: clampRgb((b + m) * 255) };
  }

  function hexToHsl(hex) {
    const rgb = hexToRgb(hex);
    if (!rgb) return null;
    return rgbToHsl(rgb.r, rgb.g, rgb.b);
  }

  function hslToHex(h, s, l) {
    const { r, g, b } = hslToRgb(h, s, l);
    return rgbToHex(r, g, b);
  }

  global.ColorConverter = {
    normalizeHex, hexToRgb, rgbToHex, clampRgb,
    clampPercent, clampHue,
    rgbToHsl, hslToRgb, hexToHsl, hslToHex,
  };
})(window);
