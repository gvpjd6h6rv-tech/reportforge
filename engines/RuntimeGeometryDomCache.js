'use strict';

const { AABB } = (() => {
  if (typeof module !== 'undefined' && module.exports && typeof require === 'function') {
    return require('./RuntimeGeometryPrimitives.js');
  }
  if (typeof globalThis !== 'undefined' && globalThis.RuntimeGeometryPrimitives) {
    return globalThis.RuntimeGeometryPrimitives;
  }
  throw new Error('RuntimeGeometryPrimitives unavailable');
})();

function runtimeGeometryFallbackRect() {
  return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
}

function runtimeGeometryEnsureCache(geometry) {
  if (!geometry._frameCache) geometry._frameCache = {};
  return geometry._frameCache;
}

function runtimeGeometryInvalidate() {
  this._frameCache = null;
}

function runtimeGeometryLegacyRectProp(prop) {
  const msg = `INVALID GEOMETRY SHAPE: use left/top/width/height only (${prop})`;
  console.error(msg);
  throw new Error(msg);
}

function runtimeGeometryRect(geometry, left, top, width, height) {
  const rect = { left, top, width, height };
  Object.defineProperties(rect, {
    x: { get: () => geometry._invalidLegacyRectProp('x'), enumerable: false },
    y: { get: () => geometry._invalidLegacyRectProp('y'), enumerable: false },
    w: { get: () => geometry._invalidLegacyRectProp('w'), enumerable: false },
    h: { get: () => geometry._invalidLegacyRectProp('h'), enumerable: false },
  });
  return Object.freeze(rect);
}

function runtimeGeometryReadRectById(id) {
  const el = document.getElementById(id);
  return el ? el.getBoundingClientRect() : runtimeGeometryFallbackRect();
}

function runtimeGeometryReadCachedRect(geometry, cacheKey, id) {
  if (geometry._frameCache && geometry._frameCache[cacheKey]) return geometry._frameCache[cacheKey];
  const rect = runtimeGeometryReadRectById(id);
  runtimeGeometryEnsureCache(geometry);
  geometry._frameCache[cacheKey] = rect;
  return rect;
}

function runtimeGeometryReadElementNode(elOrId) {
  return (typeof elOrId === 'string')
    ? document.querySelector(`.cr-element[data-id="${elOrId}"]`)
    : elOrId;
}

function runtimeGeometryReadSectionNode(secOrId) {
  return (typeof secOrId === 'string')
    ? document.querySelector(`.cr-section[data-section-id="${secOrId}"]`)
    : secOrId;
}

function runtimeGeometryZoom() {
  return (typeof DS !== 'undefined' ? DS.zoom : 1) || 1;
}

function runtimeGeometryViewToModel(geometry, clientX, clientY) {
  const z = runtimeGeometryZoom();
  const cR = geometry.canvasRect();
  return { x: (clientX - cR.left) / z, y: (clientY - cR.top) / z };
}

function runtimeGeometryElementRect(geometry, elDiv) {
  if (!elDiv) return null;
  const zoom = runtimeGeometryZoom();
  const eR = elDiv.getBoundingClientRect();
  const cR = geometry.canvasRect();
  return runtimeGeometryRect(geometry, (eR.left - cR.left) / zoom, (eR.top - cR.top) / zoom, eR.width / zoom, eR.height / zoom);
}

function runtimeGeometrySectionRect(geometry, secDiv) {
  if (!secDiv) return null;
  const zoom = runtimeGeometryZoom();
  const sR = secDiv.getBoundingClientRect();
  const cR = geometry.canvasRect();
  return runtimeGeometryRect(geometry, (sR.left - cR.left) / zoom, (sR.top - cR.top) / zoom, sR.width / zoom, sR.height / zoom);
}

function runtimeGeometryModelToScreen(geometry, x, y) {
  const dpr = window.devicePixelRatio || 1;
  const r = geometry.canvasRect();
  const ws = document.getElementById('workspace');
  const z = geometry.zoom();
  return {
    x: (x * z + r.left - (ws ? ws.scrollLeft : 0)) * dpr,
    y: (y * z + r.top - (ws ? ws.scrollTop : 0)) * dpr,
  };
}

function runtimeGeometryScreenToModel(geometry, sx, sy) {
  const dpr = window.devicePixelRatio || 1;
  const r = geometry.canvasRect();
  const ws = document.getElementById('workspace');
  const z = geometry.zoom();
  return {
    x: (sx / dpr - r.left + (ws ? ws.scrollLeft : 0)) / z,
    y: (sy / dpr - r.top + (ws ? ws.scrollTop : 0)) / z,
  };
}

function runtimeGeometryCanvasLeft(geometry) {
  const cR = geometry.canvasRect();
  const sR = geometry.scrollRect();
  return cR.left - sR.left;
}

function runtimeGeometryRulerVTop(geometry) {
  const cR = geometry.canvasRect();
  const rR = geometry.rulerVRect();
  return cR.top - rR.top;
}

function runtimeGeometryAllElementAABBs(geometry) {
  const result = [];
  document.querySelectorAll('.cr-element').forEach((el) => {
    const r = geometry.getElementRect(el);
    if (r) result.push({ id: el.dataset.id, aabb: AABB.fromRect(r) });
  });
  return result;
}

function runtimeGeometryFindOverlaps(geometry) {
  const boxes = runtimeGeometryAllElementAABBs(geometry);
  const pairs = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (boxes[i].aabb.overlaps(boxes[j].aabb)) {
        pairs.push({ a: boxes[i].id, b: boxes[j].id, mtv: boxes[i].aabb.mtv(boxes[j].aabb) });
      }
    }
  }
  return pairs;
}

const RuntimeGeometryDomCache = {
  _frameCache: null,
  _cacheFrame: -1,
  invalidate: runtimeGeometryInvalidate,
  _ensureCache() { return runtimeGeometryEnsureCache(this); },
  _invalidLegacyRectProp(prop) { return runtimeGeometryLegacyRectProp(prop); },
  _rect(left, top, width, height) { return runtimeGeometryRect(this, left, top, width, height); },
  canvasRect() { return runtimeGeometryReadCachedRect(this, 'canvasRect', 'canvas-layer'); },
  scrollRect() { return runtimeGeometryReadCachedRect(this, 'scrollRect', 'workspace'); },
  rulerVRect() { return runtimeGeometryReadCachedRect(this, 'rulerVRect', 'ruler-v'); },
  elementRect(elDiv) { return runtimeGeometryElementRect(this, elDiv); },
  sectionBand(secDiv) {
    if (!secDiv) return null;
    const cR = this.canvasRect();
    const sR = secDiv.getBoundingClientRect();
    return { y: sR.top - cR.top, h: sR.height };
  },
  canvasLeft() { return runtimeGeometryCanvasLeft(this); },
  rulerVTop() { return runtimeGeometryRulerVTop(this); },
  getCanvasRect() { return this.canvasRect(); },
  getElementRect(elOrId) {
    const el = runtimeGeometryReadElementNode(elOrId);
    return this.elementRect(el);
  },
  getSectionRect(secOrId) {
    const sec = runtimeGeometryReadSectionNode(secOrId);
    if (!sec) return null;
    return runtimeGeometrySectionRect(this, sec);
  },
  elementAABB(elOrId) {
    const r = this.getElementRect(elOrId);
    return r ? AABB.fromRect(r) : null;
  },
  allElementAABBs() {
    return runtimeGeometryAllElementAABBs(this);
  },
  findOverlaps() {
    return runtimeGeometryFindOverlaps(this);
  },
  viewToModel(clientX, clientY) { return runtimeGeometryViewToModel(this, clientX, clientY); },
  modelToScreen(x, y) { return runtimeGeometryModelToScreen(this, x, y); },
  screenToModel(sx, sy) { return runtimeGeometryScreenToModel(this, sx, sy); },
};

if (typeof module !== 'undefined') module.exports = { RuntimeGeometryDomCache };
if (typeof globalThis !== 'undefined') globalThis.RuntimeGeometryDomCache = RuntimeGeometryDomCache;
