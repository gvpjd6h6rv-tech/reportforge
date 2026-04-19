'use strict';

const SelectionEngineContracts = (() => {
  function _selectionContracts() {
    return (typeof ContractGuards !== 'undefined' && ContractGuards)
      || (window.RF?.RuntimeServices?.getContractGuards?.() || null)
      || null;
  }

  function assertSelectionState(source) {
    const guards = _selectionContracts();
    if (guards && typeof DS !== 'undefined') guards.assertSelectionState(DS.selection, source);
  }

  function assertLayoutContract(el, source) {
    const guards = _selectionContracts();
    if (guards && el) guards.assertLayoutContract(el, source);
  }

  function assertRectShape(rect, source) {
    const guards = _selectionContracts();
    if (guards && rect) guards.assertRectShape(rect, source);
  }

  function assertZoomContract(source) {
    const guards = _selectionContracts();
    if (guards && typeof DS !== 'undefined') guards.assertZoomContract(DS.zoom, source);
  }

  return {
    assertSelectionState,
    assertLayoutContract,
    assertRectShape,
    assertZoomContract,
  };
})();

if (typeof module !== 'undefined') module.exports = SelectionEngineContracts;
