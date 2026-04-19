'use strict';

const _HitTestGeometryCore = typeof module !== 'undefined' && module.exports && typeof require === 'function'
  ? require('./GeometryCore.js')
  : GeometryCore;

const HitTestGeometry = (() => {
  function pointInRect(point, rect, tolerance = 0) {
    if (!point || !rect) return false;
    return _HitTestGeometryCore.rectContainsPoint(_HitTestGeometryCore.inflateRect(rect, tolerance), point);
  }

  function handlePoint(rect, pos) {
    const r = _HitTestGeometryCore.normalizeRect(rect);
    const x = r.x;
    const y = r.y;
    const x2 = r.x + r.w;
    const y2 = r.y + r.h;
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    switch (pos) {
      case 'nw': return _HitTestGeometryCore.makePoint(x, y);
      case 'n': return _HitTestGeometryCore.makePoint(cx, y);
      case 'ne': return _HitTestGeometryCore.makePoint(x2, y);
      case 'w': return _HitTestGeometryCore.makePoint(x, cy);
      case 'e': return _HitTestGeometryCore.makePoint(x2, cy);
      case 'sw': return _HitTestGeometryCore.makePoint(x, y2);
      case 's': return _HitTestGeometryCore.makePoint(cx, y2);
      case 'se': return _HitTestGeometryCore.makePoint(x2, y2);
      default: return _HitTestGeometryCore.rectCenter(r);
    }
  }

  function handleAt(rect, point, tolerance = 5) {
    if (!rect || !point) return null;
    const positions = ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'];
    for (const pos of positions) {
      if (_HitTestGeometryCore.pointDistance(point, handlePoint(rect, pos)) <= tolerance) return pos;
    }
    if (pointInRect(point, rect, tolerance)) return 'move';
    return null;
  }

  function edgeAt(rect, point, tolerance = 4) {
    if (!rect || !point) return null;
    const r = _HitTestGeometryCore.normalizeRect(rect);
    const inside = pointInRect(point, r, tolerance);
    if (!inside) return null;
    const nearLeft = Math.abs(point.x - r.x) <= tolerance;
    const nearRight = Math.abs(point.x - (r.x + r.w)) <= tolerance;
    const nearTop = Math.abs(point.y - r.y) <= tolerance;
    const nearBottom = Math.abs(point.y - (r.y + r.h)) <= tolerance;
    if (nearTop && nearLeft) return 'nw';
    if (nearTop && nearRight) return 'ne';
    if (nearBottom && nearLeft) return 'sw';
    if (nearBottom && nearRight) return 'se';
    if (nearTop) return 'n';
    if (nearBottom) return 's';
    if (nearLeft) return 'w';
    if (nearRight) return 'e';
    return 'move';
  }

  function rectOverlapsRect(a, b) {
    return _HitTestGeometryCore.rectOverlaps(a, b);
  }

  function rectContainsBand(rect, band) {
    return _HitTestGeometryCore.rectOverlaps(rect, band);
  }

  return {
    pointInRect,
    handlePoint,
    handleAt,
    edgeAt,
    rectOverlapsRect,
    rectContainsBand,
  };
})();

if (typeof module !== 'undefined') module.exports = HitTestGeometry;
