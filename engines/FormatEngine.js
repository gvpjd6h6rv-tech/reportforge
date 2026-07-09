'use strict';

const FormatEngine = {
  updateToolbar() {
    const sel = DS.getSelectedElements();
    const el = sel[0];
    if (!el) {
      document.getElementById('btn-bold').classList.remove('active');
      document.getElementById('btn-italic').classList.remove('active');
      document.getElementById('btn-underline').classList.remove('active');
      return;
    }
    document.getElementById('btn-bold').classList.toggle('active', el.bold);
    document.getElementById('btn-italic').classList.toggle('active', el.italic);
    document.getElementById('btn-underline').classList.toggle('active', el.underline);
    document.getElementById('btn-al')?.classList.toggle('active', el.align === 'left');
    document.getElementById('btn-ac')?.classList.toggle('active', el.align === 'center');
    document.getElementById('btn-ar')?.classList.toggle('active', el.align === 'right');
    document.documentElement.style.setProperty('--swatch-font', el.color);
    // BUG J: --swatch-bg/--swatch-border were only ever written by the
    // toolbar's own color-bg/color-border pick handlers, never on selection
    // change — so they kept showing whatever was last toolbar-picked instead
    // of the newly-selected element's actual bgColor/borderColor.
    document.documentElement.style.setProperty('--swatch-bg', el.bgColor === 'transparent' ? 'transparent' : el.bgColor);
    document.documentElement.style.setProperty('--swatch-border', el.borderColor === 'transparent' ? 'transparent' : el.borderColor);
    this._selectMatchingOption('tb-font-name', (option) => option.text === el.fontFamily);
    this._selectMatchingOption('tb-font-size', (option) => parseInt(option.text) === el.fontSize);
  },

  // SP-CLEANUP-01: font-name/font-size both looped their <select>'s
  // options looking for a match, then set .selected and broke — same
  // pattern, deduplicated honestly, only the predicate differs.
  _selectMatchingOption(selectId, predicate) {
    const select = document.getElementById(selectId);
    if (!select) return;
    for (const option of select.options) if (predicate(option)) {
      option.selected = true;
      break;
    }
  },

  // SP-CLEANUP-01: applyFormat/toggleFormat both ended with the exact
  // same "apply to every selected element, then saveHistory + refresh
  // toolbar + refresh properties" sequence — deduplicated honestly.
  _commitFormat(sel, key, value) {
    sel.forEach((el) => {
      el[key] = value;
      _canonicalCanvasWriter().updateElement(el.id);
    });
    DS.saveHistory();
    this.updateToolbar();
    PropertiesEngine.render();
  },

  applyFormat(key, value) {
    const sel = DS.getSelectedElements();
    if (!sel.length) return;
    this._commitFormat(sel, key, value);
  },

  toggleFormat(key) {
    const sel = DS.getSelectedElements();
    if (!sel.length) return;
    const newVal = !sel[0][key];
    this._commitFormat(sel, key, newVal);
  },
};

if (typeof module !== 'undefined') {
  module.exports = FormatEngine;
}
