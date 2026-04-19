'use strict';

(function initCanvasLayoutContracts(global) {
  function _contracts() {
    return (typeof ContractGuards !== 'undefined' && ContractGuards)
      || (window.RF?.RuntimeServices?.getContractGuards?.() || null)
      || null;
  }

  function _assertSelectionState(source) {
    const guards = _contracts();
    if (guards && typeof DS !== 'undefined') guards.assertSelectionState(DS.selection, source);
  }

  function _assertLayoutContract(el, source) {
    const guards = _contracts();
    if (guards && el) guards.assertLayoutContract(el, source);
  }

  function _assertZoomContract(source) {
    const guards = _contracts();
    if (guards && typeof DS !== 'undefined') guards.assertZoomContract(DS.zoom, source);
  }

  global.CanvasLayoutContracts = {
    contracts: _contracts,
    assertSelectionState: _assertSelectionState,
    assertLayoutContract: _assertLayoutContract,
    assertZoomContract: _assertZoomContract,
  };
})(window);
