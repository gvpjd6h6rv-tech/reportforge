'use strict';

const { Matrix2D, AABB, MagneticSnap, PointerNorm } = (() => {
  if (typeof module !== 'undefined' && module.exports && typeof require === 'function') {
    return require('./RuntimeGeometryPrimitives.js');
  }
  if (typeof globalThis !== 'undefined' && globalThis.RuntimeGeometryPrimitives) {
    return globalThis.RuntimeGeometryPrimitives;
  }
  throw new Error('RuntimeGeometryPrimitives unavailable');
})();

const { RuntimeGeometryDomCache } = (() => {
  if (typeof module !== 'undefined' && module.exports && typeof require === 'function') {
    return require('./RuntimeGeometryDomCache.js');
  }
  if (typeof globalThis !== 'undefined' && globalThis.RuntimeGeometryDomCache) {
    return { RuntimeGeometryDomCache: globalThis.RuntimeGeometryDomCache };
  }
  throw new Error('RuntimeGeometryDomCache unavailable');
})();

function runtimeGeometryZoom() {
  return (typeof DS !== 'undefined' ? DS.zoom : 1) || 1;
}

const RuntimeGeometryApiTemplate = {
  ...RuntimeGeometryDomCache,
  toCanvasSpace(clientX, clientY) { return this.viewToModel(clientX, clientY); },
  Matrix2D, AABB, MagneticSnap, PointerNorm,
  canvasMatrix() { return Matrix2D.scale(runtimeGeometryZoom()); },
  canvasMatrixInverse() { return this.canvasMatrix().inverse(); },
  zoom() { return runtimeGeometryZoom(); },
  scale(v) { return v * this.zoom(); },
  unscale(v) { return v / this.zoom(); },
  modelToView(x, y) {
    const z = this.zoom();
    return { x: x * z, y: y * z };
  },
  rectToView(r) {
    const z = this.zoom();
    return this._rect(r.x * z, r.y * z, r.w * z, r.h * z);
  },
  snapModel(v, grid) { return (!grid || grid <= 0) ? v : Math.round(v / grid) * grid; },
  roundView(v) { return Math.round(v); },
};

const RuntimeGeometry = (() => {
  function install() {
    window.RF = window.RF || {};
    window.RF.Geometry = Object.assign({}, RuntimeGeometryApiTemplate, {
      _frameCache: null,
      _cacheFrame: -1,
    });
  }
  return { install };
})();

if (typeof module !== 'undefined') module.exports = { RuntimeGeometry, Matrix2D, AABB, MagneticSnap, PointerNorm };
if (typeof globalThis !== 'undefined') globalThis.RuntimeGeometry = RuntimeGeometry;
