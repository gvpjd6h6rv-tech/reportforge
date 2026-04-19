'use strict';

const _CanvasGeometryCore = typeof module !== 'undefined' && module.exports && typeof require === 'function'
  ? require('./GeometryCore.js')
  : GeometryCore;
const _CFG = typeof globalThis !== 'undefined' && globalThis.CFG
  ? globalThis.CFG
  : (typeof CFG !== 'undefined' ? CFG : { PAGE_W: 0 });

const CanvasGeometry = (() => {
  function sectionAbsoluteRect(section, sectionTop = 0) {
    if (!section) return null;
    return _CanvasGeometryCore.makeRect(0, sectionTop, Number(section.width) || _CFG.PAGE_W, Number(section.height) || 0);
  }

  function elementCanvasRect(el, sectionTop = 0) {
    if (!el) return null;
    return _CanvasGeometryCore.makeRect(el.x, sectionTop + el.y, el.w, el.h);
  }

  function elementViewRect(el, sectionTop = 0, zoom = 1) {
    const rect = elementCanvasRect(el, sectionTop);
    if (!rect) return null;
    const r = _CanvasGeometryCore.makeRect(rect.x * zoom, rect.y * zoom, rect.w * zoom, rect.h * zoom);
    return { left: r.x, top: r.y, width: r.w, height: r.h };
  }

  function rectToView(rect, zoom = 1) {
    const r = _CanvasGeometryCore.normalizeRect(rect);
    const v = _CanvasGeometryCore.makeRect(r.x * zoom, r.y * zoom, r.w * zoom, r.h * zoom);
    return { left: v.x, top: v.y, width: v.w, height: v.h };
  }

  function canvasBoundsFromSections(sections = [], pageWidth = _CFG.PAGE_W) {
    const width = typeof pageWidth === 'number' ? pageWidth : _CFG.PAGE_W;
    let y = 0;
    const rects = [];
    for (const section of sections) {
      const h = Math.max(0, Number(section?.height) || 0);
      rects.push(_CanvasGeometryCore.makeRect(0, y, width, h));
      y += h;
    }
    return _CanvasGeometryCore.bboxFromRects(rects);
  }

  function selectionViewRects(elements = [], sectionTopFn = (sectionId) => 0, zoom = 1) {
    return elements
      .map(el => elementViewRect(el, sectionTopFn(el.sectionId), zoom))
      .filter(Boolean);
  }

  return {
    sectionAbsoluteRect,
    elementCanvasRect,
    elementViewRect,
    rectToView,
    canvasBoundsFromSections,
    selectionViewRects,
  };
})();

if (typeof module !== 'undefined') module.exports = CanvasGeometry;
