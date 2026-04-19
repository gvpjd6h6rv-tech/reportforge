'use strict';

(function initPreviewEngineContracts(global) {
  function _contracts() {
    return (typeof ContractGuards !== 'undefined' && ContractGuards)
      || (window.RF?.RuntimeServices?.getContractGuards?.() || null)
      || null;
  }

  function assertSelectionState(source) {
    const guards = _contracts();
    if (guards && typeof DS !== 'undefined') guards.assertSelectionState(DS.selection, source);
  }

  function assertLayoutContract(el, source) {
    const guards = _contracts();
    if (guards && el) guards.assertLayoutContract(el, source);
  }

  function assertZoomContract(value, source) {
    const guards = _contracts();
    if (guards) guards.assertZoomContract(value, source);
  }

  function assertPreviewDomContract() {
    const ids = ['preview-layer', 'preview-content'];
    for (const id of ids) {
      if (!document.getElementById(id)) {
        throw new Error(`INVALID PREVIEW DOM CONTRACT: missing #${id}`);
      }
    }
    return true;
  }

  global.PreviewEngineContracts = {
    assertSelectionState,
    assertLayoutContract,
    assertZoomContract,
    assertPreviewDomContract,
  };
})(window);
