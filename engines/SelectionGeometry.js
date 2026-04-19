'use strict';

const _SelectionGeometryCore = typeof module !== 'undefined' && module.exports && typeof require === 'function'
  ? require('./GeometryCore.js')
  : GeometryCore;

const SelectionGeometry = (() => {
  function normalizeRectLike(rect) {
    if (!rect || typeof rect !== 'object') return null;
    if ('left' in rect || 'top' in rect || 'width' in rect || 'height' in rect) {
      return _SelectionGeometryCore.makeRect(rect.left, rect.top, rect.width, rect.height);
    }
    if ('x' in rect || 'y' in rect || 'w' in rect || 'h' in rect) {
      return _SelectionGeometryCore.makeRect(rect.x, rect.y, rect.w, rect.h);
    }
    return null;
  }

  function toViewRect(rect) {
    const r = normalizeRectLike(rect);
    if (!r) return null;
    return { left: r.x, top: r.y, width: r.w, height: r.h };
  }

  function selectionBoundsFromRects(rects) {
    const items = (rects || []).map(normalizeRectLike).filter(Boolean);
    const bbox = _SelectionGeometryCore.bboxFromRects(items);
    return bbox ? toViewRect(bbox) : null;
  }

  function selectionBoundsFromElements(elements, rectFn = (item) => item) {
    return selectionBoundsFromRects((elements || []).map(rectFn).filter(Boolean));
  }

  function selectionHandles(rect) {
    const r = normalizeRectLike(rect);
    if (!r) return [];
    const x = r.x;
    const y = r.y;
    const x2 = r.x + r.w;
    const y2 = r.y + r.h;
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    return [
      { pos: 'nw', cx: x, cy: y },
      { pos: 'n', cx, cy: y },
      { pos: 'ne', cx: x2, cy: y },
      { pos: 'w', cx: x, cy },
      { pos: 'e', cx: x2, cy },
      { pos: 'sw', cx: x, cy: y2 },
      { pos: 's', cx, cy: y2 },
      { pos: 'se', cx: x2, cy: y2 },
    ];
  }

  function rubberBandRect(start, end) {
    if (!start || !end) return null;
    const x1 = Math.min(Number(start.x) || 0, Number(end.x) || 0);
    const y1 = Math.min(Number(start.y) || 0, Number(end.y) || 0);
    const x2 = Math.max(Number(start.x) || 0, Number(end.x) || 0);
    const y2 = Math.max(Number(start.y) || 0, Number(end.y) || 0);
    return { left: x1, top: y1, width: x2 - x1, height: y2 - y1 };
  }

  function rectOverlapsBand(rect, band) {
    const a = normalizeRectLike(rect);
    const b = normalizeRectLike(band);
    if (!a || !b) return false;
    return _SelectionGeometryCore.rectOverlaps(a, b);
  }

  return {
    normalizeRectLike,
    selectionBoundsFromRects,
    selectionBoundsFromElements,
    selectionHandles,
    rubberBandRect,
    rectOverlapsBand,
    boundsFromRects: selectionBoundsFromRects,
    boundsFromElements: selectionBoundsFromElements,
  };
})();

if (typeof module !== 'undefined') module.exports = SelectionGeometry;
