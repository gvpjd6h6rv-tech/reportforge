'use strict';

const SnapState = (() => {
  let _gridModel = 4;
  let _enabled = true;

  function init() {
    _gridModel = (typeof CFG !== 'undefined' && Number.isFinite(CFG.MODEL_GRID))
      ? CFG.MODEL_GRID
      : ((typeof CFG !== 'undefined' && CFG.GRID) ? CFG.GRID : 4);
    _enabled = (typeof DS !== 'undefined') ? (DS.snapToGrid !== false) : true;
  }

  function setEnabled(v) {
    _enabled = !!v;
    if (typeof DS !== 'undefined') DS.snapToGrid = _enabled;
  }

  function toggle() {
    setEnabled(!_enabled);
  }

  function isEnabled() {
    return _enabled;
  }

  function setGrid(g) {
    _gridModel = Math.max(1, g);
  }

  function getGrid() {
    return _gridModel;
  }

  return { init, setEnabled, toggle, isEnabled, setGrid, getGrid };
})();

if (typeof module !== 'undefined') module.exports = SnapState;
