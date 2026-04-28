'use strict';

const KeyboardCombo = (() => {
  function normalizeCombo(combo) {
    return String(combo || '').toLowerCase().replace(/\s+/g, '');
  }

  function encodeKeyEvent(e) {
    const parts = [];
    if (e.ctrlKey || e.metaKey) parts.push('ctrl');
    if (e.altKey) parts.push('alt');
    if (e.shiftKey) parts.push('shift');
    parts.push(String(e.key || '').toLowerCase());
    return parts.join('+');
  }

  return {
    normalizeCombo,
    encodeKeyEvent,
  };
})();

if (typeof module !== 'undefined') module.exports = KeyboardCombo;
