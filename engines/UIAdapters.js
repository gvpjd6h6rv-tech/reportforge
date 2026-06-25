'use strict';

(function initUIAdapters(global) {
  function bindToolbar() {
    // RF-FIREFOX-PERMISSION-MODAL-DOUBLEFIRE-1: every [data-action] element
    // is EITHER a toolbar .tb-icon button OR a dropdown-menu .dd-item — and
    // .dd-item is ALREADY bound by MenuAdapters.js's MenuEngine.init(). The
    // old unscoped '[data-action]' selector matched .dd-item too, so every
    // dropdown menu click (Archivo > Nuevo, Guardar, Guardar como, ...) ran
    // handleAction() TWICE. Confirmed live: one click fired confirm()
    // twice — harmless-looking in Chrome, but Firefox's dialog-spam
    // heuristic offers a "don't show this again" checkbox on the second
    // confirm() in quick succession; checking it silently suppresses ALL
    // future confirm()/alert()/prompt() calls on the page (including
    // save()'s prompt() fallback), which is what made Guardar/Guardar
    // como look "stuck" after that checkbox was ticked.
    document.querySelectorAll('.tb-icon[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => handleAction(btn.dataset.action));
    });
    document.querySelectorAll('[data-tool]').forEach((btn) => {
      btn.addEventListener('click', () => handleToolSelection(btn.dataset.tool));
    });
  }

  function bindTabs() {
    document.getElementById('tab-design')?.addEventListener('click', () => handleViewSelection('design'));
    document.getElementById('tab-preview')?.addEventListener('click', () => handleViewSelection('preview'));
  }

  function bindDocType() {
    document.querySelectorAll('.doc-type-btn').forEach((btn) =>
      btn.addEventListener('click', () => switchDocType(btn.dataset.doctype)));
  }

  function bindFormatControls() {
    document.querySelectorAll('[data-format]').forEach((btn) => {
      btn.addEventListener('click', () => handleFormatAction(btn.dataset.format));
    });
    document.getElementById('tb-font-name')?.addEventListener('change', (e) => {
      handleFontFamilyChange(e.target.value);
    });
    document.getElementById('tb-font-size')?.addEventListener('change', (e) => {
      handleFontSizeChange(parseInt(e.target.value));
    });
    document.getElementById('tb-zoom')?.addEventListener('change', (e) => {
      handleZoomSelection(parseFloat(e.target.value), 'toolbar-select');
    });
  }

  function initUIBindings() {
    bindToolbar();
    bindTabs();
    bindDocType();
    bindFormatControls();
  }

  global.initUIBindings = initUIBindings;
})(window);
