'use strict';

const SnapCore = (() => {
  function snapValue(v, grid, enabled) {
    if (!enabled || grid <= 0) return v;
    return Math.round(v / grid) * grid;
  }

  function snapPoint(modelX, modelY, grid, enabled) {
    return {
      x: snapValue(modelX, grid, enabled),
      y: snapValue(modelY, grid, enabled),
    };
  }

  function snapFromClient(clientX, clientY, grid, enabled) {
    const model = RF.Geometry.viewToModel(clientX, clientY);
    const snapped = snapPoint(model.x, model.y, grid, enabled);
    return RF.Geometry.modelToView(snapped.x, snapped.y);
  }

  return { snapValue, snapPoint, snapFromClient };
})();

if (typeof module !== 'undefined') module.exports = SnapCore;
