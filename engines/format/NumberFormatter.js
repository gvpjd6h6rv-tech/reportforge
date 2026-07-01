'use strict';
/**
 * NumberFormatter
 *
 * Single responsibility: pure formatting function.
 * Receives a value + number format config, returns a formatted string.
 *
 * No DOM. No DS. No events. No modal. No layout I/O.
 *
 * API:
 *   formatNumber(value, config) → string
 *
 * Config shape (all optional — falls back to safe defaults):
 *   decimals           number   0-6, default 2
 *   thousands          boolean  separator de miles, default false
 *   decimalSeparator   string   "." default
 *   thousandsSeparator string   "," default
 *   currency.enabled   boolean  default false
 *   currency.symbol    string   "$" default
 *   currency.position  string   "floating" | "fixed" (BACKLOG)
 *   negative.mode      string   "minus" | "parentheses"
 *   zero.blankIfZero   boolean  default false
 *   zero.leadingZero   boolean  default true (BACKLOG: affects values 0 < v < 1)
 *   rounding.*         object   BACKLOG — not active
 *   accounting.*       object   BACKLOG — not active
 *
 * Null contract:
 *   null / undefined / "" → "" (never "0.00" unless value is actually 0 and blankIfZero=false)
 *
 * Thousands inference rule:
 *   If `thousands` is not explicitly set (undefined) AND negative.mode==="parentheses",
 *   thousands is implied true (accountant convention). Otherwise defaults to false.
 *
 * Gate 1 unit tests (run with node):
 *   formatNumber(24, {decimals:2})                             → "24.00"
 *   formatNumber(2.600001, {decimals:2})                       → "2.60"
 *   formatNumber(1049.14, {decimals:2})                        → "1049.14"
 *   formatNumber(null, {decimals:2})                           → ""
 *   formatNumber(-1123, {decimals:2, negative:{mode:"parentheses"}}) → "(1,123.00)"
 *   formatNumber(0, {decimals:2, zero:{blankIfZero:true}})     → ""
 */
(function initNumberFormatter(global) {

  function formatNumber(value, config) {
    // ── Null contract ─────────────────────────────────────────────────────
    if (value === null || value === undefined || value === '') return '';

    const cfg = config || {};

    // ── Parse ─────────────────────────────────────────────────────────────
    const raw = typeof value === 'string' ? value.replace(/,/g, '') : String(value);
    const n = parseFloat(raw);
    if (!Number.isFinite(n)) return String(value);

    // ── Zero blank ───────────────────────────────────────────────────────
    const zeroCfg = cfg.zero || {};
    if (n === 0 && zeroCfg.blankIfZero) return '';

    // ── Config resolution ─────────────────────────────────────────────────
    const decimals = typeof cfg.decimals === 'number'
      ? Math.max(0, Math.min(6, Math.round(cfg.decimals)))
      : 2;

    const negMode = (cfg.negative && cfg.negative.mode) || 'minus';

    // thousands: explicit config wins; else implied by parentheses convention
    const thousands = cfg.thousands !== undefined
      ? cfg.thousands
      : (negMode === 'parentheses');

    const decSep  = cfg.decimalSeparator   || '.';
    const thsSep  = cfg.thousandsSeparator || ',';

    const isNeg = n < 0;
    const absN  = Math.abs(n);

    // ── Format absolute value ─────────────────────────────────────────────
    let formatted;
    if (thousands && decSep === '.' && thsSep === ',') {
      // Fast path: standard en-US locale
      formatted = absN.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
    } else {
      // Manual path: custom separators or no thousands
      let base = absN.toFixed(decimals);
      if (thousands) {
        // Insert thousands separators into integer part
        const parts = base.split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, thsSep);
        base = parts.join('.');
      }
      if (decSep !== '.') {
        base = base.replace('.', decSep);
      }
      formatted = base;
    }

    // ── Currency symbol ───────────────────────────────────────────────────
    const cur = cfg.currency || {};
    if (cur.enabled) {
      const sym = cur.symbol || '$';
      // position 'floating' (default): symbol before absolute value, negative sign after symbol
      // position 'fixed': BACKLOG — treat as floating for now
      formatted = sym + ' ' + formatted;
    }

    // ── Negative sign ─────────────────────────────────────────────────────
    if (isNeg) {
      if (negMode === 'parentheses') {
        formatted = '(' + formatted + ')';
      } else {
        formatted = '-' + formatted;
      }
    }

    return formatted;
  }

  global.NumberFormatter = { formatNumber: formatNumber };
  if (typeof module !== 'undefined') module.exports = { formatNumber: formatNumber };

})(typeof window !== 'undefined' ? window : globalThis);
