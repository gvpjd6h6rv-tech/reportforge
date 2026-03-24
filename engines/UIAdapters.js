'use strict';

(function initUIAdapters(global) {
  function bindToolbar() {
    document.querySelectorAll('[data-action]').forEach((btn) => {
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
      handleZoomSelection(parseFloat(e.target.value));
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
