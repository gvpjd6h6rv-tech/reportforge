/**
 * AlignmentEngine — ReportForge v19 Phase 2
 * ─────────────────────────────────────────────────────────────────
 * Figma-style smart alignment: edge, center, and spacing guides.
 *
 * All computations in MODEL SPACE.
 * Guide positions returned in model units → GuideEngine converts to view.
 *
 * Alignment types:
 *   edge    — aligns left/right/top/bottom edges
 *   center  — aligns horizontal or vertical centers
 *   spacing — equal spacing between elements
 */
'use strict';

const AlignmentEngine = (() => {
  const THRESHOLD = 4;  // model units snap proximity

  /**
   * Get absolute bounds of a DS element (model space).
   */
  function _bounds(el) {
    const secTop = (typeof DS !== 'undefined') ? DS.getSectionTop(el.sectionId) : 0;
    return {
      x:  el.x,
      y:  secTop + el.y,
      x2: el.x + el.w,
      y2: secTop + el.y + el.h,
      cx: el.x + el.w / 2,
      cy: secTop + el.y + el.h / 2,
      w:  el.w,
      h:  el.h,
    };
  }

  /**
   * Compute alignment guides for a moving element.
   * Checks all other elements for edges/centers within THRESHOLD.
   *
   * @param {object} movingEl      — DS element being dragged
   * @param {number} [threshold]   — snap proximity in model units
   * @returns {{ guides: Array, snapX: number|null, snapY: number|null }}
   */
  function compute(movingEl, threshold = THRESHOLD) {
    if (typeof DS === 'undefined') return { guides: [], snapX: null, snapY: null };

    const mb = _bounds(movingEl);
    const guides = [];
    let snapX = null, snapY = null;
    let bestDX = threshold + 1, bestDY = threshold + 1;

    // ── Page edges ───────────────────────────────────────────────
    const pageEdges = [
      { axis: 'x', pos: 0,           label: 'page-left',   src: mb.x  },
      { axis: 'x', pos: CFG.PAGE_W,  label: 'page-right',  src: mb.x2 },
      { axis: 'x', pos: CFG.PAGE_W/2,label: 'page-cx',     src: mb.cx },
    ];
    for (const e of pageEdges) {
      const d = Math.abs(e.src - e.pos);
      if (d <= threshold) {
        guides.push({ axis: e.axis, modelPos: e.pos, type: 'edge' });
        if (d < bestDX) { bestDX = d; snapX = e.pos - (e.src - mb.x); }
      }
    }

    // ── Other elements ─────────────────────────────────────────
    DS.elements.forEach(el => {
      if (el.id === movingEl.id) return;
      const b = _bounds(el);

      // X axis — check left/right/center
      const xCandidates = [
        { pos: b.x,  src: mb.x,  label: 'left' },
        { pos: b.x2, src: mb.x2, label: 'right' },
        { pos: b.cx, src: mb.cx, label: 'cx' },
        { pos: b.x,  src: mb.x2, label: 'l-r' },
        { pos: b.x2, src: mb.x,  label: 'r-l' },
      ];
      for (const c of xCandidates) {
        const d = Math.abs(c.src - c.pos);
        if (d <= threshold) {
          guides.push({ axis: 'x', modelPos: c.pos, type: 'edge' });
          if (d < bestDX) {
            bestDX = d;
            snapX = c.pos - (c.src - mb.x);
          }
        }
      }

      // Y axis — check top/bottom/center
      const yCandidates = [
        { pos: b.y,  src: mb.y,  label: 'top' },
        { pos: b.y2, src: mb.y2, label: 'bottom' },
        { pos: b.cy, src: mb.cy, label: 'cy' },
        { pos: b.y,  src: mb.y2, label: 't-b' },
        { pos: b.y2, src: mb.y,  label: 'b-t' },
      ];
      for (const c of yCandidates) {
        const d = Math.abs(c.src - c.pos);
        if (d <= threshold) {
          guides.push({ axis: 'y', modelPos: c.pos, type: 'edge' });
          if (d < bestDY) {
            bestDY = d;
            snapY = c.pos - (c.src - mb.y);
          }
        }
      }
    });

    // Deduplicate guides
    const seen = new Set();
    const unique = guides.filter(g => {
      const k = `${g.axis}:${g.modelPos}`;
      if (seen.has(k)) return false;
      seen.add(k); return true;
    });

    return { guides: unique, snapX, snapY };
  }

  /**
   * Compute equal-spacing guides (Figma-style distribute).
   * Returns spacing guides when gaps between elements are nearly equal.
   */
  function computeSpacing(movingEl, threshold = THRESHOLD * 2) {
    if (typeof DS === 'undefined') return { guides: [], snapX: null, snapY: null };
    const mb = _bounds(movingEl);
    const others = DS.elements
      .filter(el => el.id !== movingEl.id)
      .map(el => _bounds(el))
      .sort((a, b) => a.x - b.x);

    const guides = [];
    // Find pairs where moving element could fit with equal spacing
    for (let i = 0; i < others.length - 1; i++) {
      const left  = others[i];
      const right = others[i + 1];
      const gapL  = mb.x  - left.x2;
      const gapR  = right.x - mb.x2;
      if (Math.abs(gapL - gapR) <= threshold && gapL > 0 && gapR > 0) {
        guides.push({ axis: 'x', modelPos: left.x2,  type: 'spacing' });
        guides.push({ axis: 'x', modelPos: right.x,   type: 'spacing' });
      }
    }
    return { guides };
  }

  /**
   * Align selected elements.
   * @param {'left'|'right'|'top'|'bottom'|'cx'|'cy'} mode
   * @param {Array<object>} elements — DS elements to align
   * @returns {Array<object>}   — updated elements (caller must call updateElementPosition)
   */
  function align(mode, elements) {
    if (!elements || elements.length < 2) return elements;
    const bounds = elements.map(_bounds);

    switch (mode) {
      case 'left':   { const v = Math.min(...bounds.map(b => b.x));  elements.forEach(el => { el.x = v; }); break; }
      case 'right':  { const v = Math.max(...bounds.map(b => b.x2)); elements.forEach((el,i) => { el.x = v - el.w; }); break; }
      case 'cx':     { const v = bounds.reduce((s,b) => s+b.cx, 0)/bounds.length; elements.forEach(el => { el.x = v - el.w/2; }); break; }
      case 'top':    { const v = Math.min(...bounds.map(b => b.y));  elements.forEach((el,i) => { el.y = v - (DS.getSectionTop(el.sectionId)); }); break; }
      case 'bottom': { const v = Math.max(...bounds.map(b => b.y2)); elements.forEach((el,i) => { el.y = v - el.h - (DS.getSectionTop(el.sectionId)); }); break; }
      case 'cy':     { const v = bounds.reduce((s,b) => s+b.cy, 0)/bounds.length; elements.forEach((el,i) => { el.y = v - el.h/2 - (DS.getSectionTop(el.sectionId)); }); break; }
    }
    return elements;
  }

  /**
   * Distribute elements with equal spacing.
   * @param {'horizontal'|'vertical'} axis
   * @param {Array<object>} elements
   */
  function distribute(axis, elements) {
    if (!elements || elements.length < 3) return elements;
    const sorted = [...elements].sort((a, b) => axis === 'horizontal' ? a.x - b.x : a.y - b.y);
    const first = _bounds(sorted[0]);
    const last  = _bounds(sorted[sorted.length - 1]);

    if (axis === 'horizontal') {
      const totalW  = sorted.reduce((s, el) => s + el.w, 0);
      const span    = last.x2 - first.x;
      const gap     = (span - totalW) / (sorted.length - 1);
      let cursor    = first.x2;
      for (let i = 1; i < sorted.length - 1; i++) {
        sorted[i].x = Math.round(cursor + gap);
        cursor = sorted[i].x + sorted[i].w;
      }
    } else {
      const secTops = sorted.map(el => DS.getSectionTop(el.sectionId));
      const totalH  = sorted.reduce((s, el) => s + el.h, 0);
      const span    = last.y2 - first.y;
      const gap     = (span - totalH) / (sorted.length - 1);
      let cursor    = first.y2;
      for (let i = 1; i < sorted.length - 1; i++) {
        sorted[i].y = Math.round(cursor + gap) - secTops[i];
        cursor = secTops[i] + sorted[i].y + sorted[i].h;
      }
    }
    return elements;
  }

  return { compute, computeSpacing, align, distribute, THRESHOLD };
})();

if (typeof module !== 'undefined') module.exports = AlignmentEngine;
