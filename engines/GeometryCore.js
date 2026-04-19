'use strict';

const GeometryCore = (() => {
  function makePoint(x = 0, y = 0) {
    return { x: Number(x) || 0, y: Number(y) || 0 };
  }

  function makeRect(x = 0, y = 0, w = 0, h = 0) {
    return { x: Number(x) || 0, y: Number(y) || 0, w: Number(w) || 0, h: Number(h) || 0 };
  }

  function normalizeRect(rect) {
    const r = rect || {};
    let { x = 0, y = 0, w = 0, h = 0 } = r;
    if (w < 0) { x += w; w = Math.abs(w); }
    if (h < 0) { y += h; h = Math.abs(h); }
    return makeRect(x, y, w, h);
  }

  function rectCenter(rect) {
    const r = normalizeRect(rect);
    return makePoint(r.x + r.w / 2, r.y + r.h / 2);
  }

  function rectUnion(a, b) {
    if (!a && !b) return null;
    if (!a) return normalizeRect(b);
    if (!b) return normalizeRect(a);
    const ra = normalizeRect(a);
    const rb = normalizeRect(b);
    const x = Math.min(ra.x, rb.x);
    const y = Math.min(ra.y, rb.y);
    const x2 = Math.max(ra.x + ra.w, rb.x + rb.w);
    const y2 = Math.max(ra.y + ra.h, rb.y + rb.h);
    return makeRect(x, y, x2 - x, y2 - y);
  }

  function rectIntersect(a, b) {
    if (!a || !b) return null;
    const ra = normalizeRect(a);
    const rb = normalizeRect(b);
    const x = Math.max(ra.x, rb.x);
    const y = Math.max(ra.y, rb.y);
    const x2 = Math.min(ra.x + ra.w, rb.x + rb.w);
    const y2 = Math.min(ra.y + ra.h, rb.y + rb.h);
    if (x2 <= x || y2 <= y) return null;
    return makeRect(x, y, x2 - x, y2 - y);
  }

  function rectOverlaps(a, b) {
    return !!rectIntersect(a, b);
  }

  function rectContainsPoint(rect, point) {
    if (!rect || !point) return false;
    const r = normalizeRect(rect);
    return point.x >= r.x && point.x <= r.x + r.w && point.y >= r.y && point.y <= r.y + r.h;
  }

  function rectContainsRect(outer, inner) {
    if (!outer || !inner) return false;
    const o = normalizeRect(outer);
    const i = normalizeRect(inner);
    return i.x >= o.x && i.y >= o.y && i.x + i.w <= o.x + o.w && i.y + i.h <= o.y + o.h;
  }

  function translateRect(rect, dx = 0, dy = 0) {
    const r = normalizeRect(rect);
    return makeRect(r.x + dx, r.y + dy, r.w, r.h);
  }

  function inflateRect(rect, amount = 0) {
    const r = normalizeRect(rect);
    return makeRect(r.x - amount, r.y - amount, r.w + amount * 2, r.h + amount * 2);
  }

  function deflateRect(rect, amount = 0) {
    return inflateRect(rect, -amount);
  }

  function clampValue(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function clampRect(rect, bounds) {
    if (!rect || !bounds) return normalizeRect(rect);
    const r = normalizeRect(rect);
    const b = normalizeRect(bounds);
    const w = Math.min(r.w, b.w);
    const h = Math.min(r.h, b.h);
    const x = clampValue(r.x, b.x, b.x + b.w - w);
    const y = clampValue(r.y, b.y, b.y + b.h - h);
    return makeRect(x, y, w, h);
  }

  function snapValue(value, grid = 1) {
    const g = Number(grid) || 1;
    if (g <= 0) return Number(value) || 0;
    return Math.round((Number(value) || 0) / g) * g;
  }

  function snapRect(rect, grid = 1) {
    const r = normalizeRect(rect);
    return makeRect(
      snapValue(r.x, grid),
      snapValue(r.y, grid),
      snapValue(r.w, grid),
      snapValue(r.h, grid),
    );
  }

  function bboxFromRects(rects) {
    const items = (rects || []).map(normalizeRect).filter(Boolean);
    if (!items.length) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const r of items) {
      minX = Math.min(minX, r.x);
      minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.w);
      maxY = Math.max(maxY, r.y + r.h);
    }
    return makeRect(minX, minY, maxX - minX, maxY - minY);
  }

  function rectEqualsWithinTolerance(a, b, tolerance = 0) {
    if (!a || !b) return false;
    const ra = normalizeRect(a);
    const rb = normalizeRect(b);
    const t = Math.max(0, Number(tolerance) || 0);
    return (
      Math.abs(ra.x - rb.x) <= t &&
      Math.abs(ra.y - rb.y) <= t &&
      Math.abs(ra.w - rb.w) <= t &&
      Math.abs(ra.h - rb.h) <= t
    );
  }

  function resizeRectFromHandle(rect, handle, dx = 0, dy = 0, constraints = {}) {
    const r = normalizeRect(rect);
    let x = r.x;
    let y = r.y;
    let w = r.w;
    let h = r.h;
    const minW = Number(constraints.minW) || 0;
    const minH = Number(constraints.minH) || 0;
    const maxW = Number(constraints.maxW) || Infinity;
    const maxH = Number(constraints.maxH) || Infinity;
    const snap = typeof constraints.snap === 'function' ? constraints.snap : (v) => v;
    const pos = String(handle || '');

    if (pos.includes('e')) w = clampValue(snap(w + dx), minW, maxW);
    if (pos.includes('s')) h = clampValue(snap(h + dy), minH, maxH);
    if (pos.includes('w')) {
      const nw = clampValue(snap(w - dx), minW, maxW);
      x = snap(x + w - nw);
      w = nw;
    }
    if (pos.includes('n')) {
      const nh = clampValue(snap(h - dy), minH, maxH);
      y = snap(y + h - nh);
      h = nh;
    }

    return makeRect(x, y, w, h);
  }

  function pointDistance(a, b) {
    const p1 = makePoint(a?.x, a?.y);
    const p2 = makePoint(b?.x, b?.y);
    return Math.hypot(p1.x - p2.x, p1.y - p2.y);
  }

  return {
    makePoint,
    makeRect,
    normalizeRect,
    rectUnion,
    rectIntersect,
    rectOverlaps,
    rectContainsPoint,
    rectContainsRect,
    translateRect,
    inflateRect,
    deflateRect,
    clampRect,
    snapValue,
    snapRect,
    bboxFromRects,
    resizeRectFromHandle,
    rectCenter,
    rectEqualsWithinTolerance,
    pointDistance,
  };
})();

if (typeof module !== 'undefined') module.exports = GeometryCore;
