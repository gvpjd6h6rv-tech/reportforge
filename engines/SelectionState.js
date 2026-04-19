'use strict';

const SelectionState = (() => {
  function selectedIds() {
    return DS.selection;
  }

  function selectedElementsFromIds(ids) {
    return (ids || []).map(id => DS.getElementById(id)).filter(Boolean);
  }

  function selectedElements() {
    return selectedElementsFromIds([...DS.selection]);
  }

  function clearSelection() {
    DS.clearSelectionState();
  }

  function selectOnly(id) {
    DS.selectOnly(id);
  }

  function addSelection(id) {
    DS.addSelection(id);
  }

  function removeSelection(id) {
    DS.removeSelection(id);
  }

  function isSelected(id) {
    return DS.isSelected(id);
  }

  function getElementById(id) {
    return DS.getElementById(id);
  }

  function getSectionTop(sectionId) {
    return DS.getSectionTop(sectionId);
  }

  function getSectionAtY(y) {
    return DS.getSectionAtY(y);
  }

  function snap(value) {
    return DS.snap(value);
  }

  function saveHistory() {
    DS.saveHistory();
  }

  function clearSelectionState() {
    DS.clearSelectionState();
  }

  return {
    selectedIds,
    selectedElementsFromIds,
    selectedElements,
    clearSelection,
    clearSelectionState,
    selectOnly,
    addSelection,
    removeSelection,
    isSelected,
    getElementById,
    getSectionTop,
    getSectionAtY,
    snap,
    saveHistory,
  };
})();

if (typeof module !== 'undefined') module.exports = SelectionState;
