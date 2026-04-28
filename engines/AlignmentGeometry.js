'use strict';

const AlignmentGeometry = (() => {
  const THRESHOLD = 4;

  function _bounds(el) {
    const secTop = (typeof DS !== 'undefined') ? DS.getSectionTop(el.sectionId) : 0;
    return {
      x: el.x,
      y: secTop + el.y,
      x2: el.x + el.w,
      y2: secTop + el.y + el.h,
      cx: el.x + el.w / 2,
      cy: secTop + el.y + el.h / 2,
      w: el.w,
      h: el.h,
    };
  }

  function compute(movingEl, threshold = THRESHOLD) {
    if (typeof DS === 'undefined') return { guides: [], snapX: null, snapY: null };

    const mb = _bounds(movingEl);
    const guides = [];
    let snapX = null;
    let snapY = null;
    let bestDX = threshold + 1;
    let bestDY = threshold + 1;

    const pageEdges = [
      { axis: 'x', pos: 0, src: mb.x },
      { axis: 'x', pos: CFG.PAGE_W, src: mb.x2 },
      { axis: 'x', pos: CFG.PAGE_W / 2, src: mb.cx },
    ];
    for (const e of pageEdges) {
      const d = Math.abs(e.src - e.pos);
      if (d <= threshold) {
        guides.push({ axis: e.axis, modelPos: e.pos, type: 'edge' });
        if (d < bestDX) {
          bestDX = d;
          snapX = e.pos - (e.src - mb.x);
        }
      }
    }

    DS.elements.forEach(el => {
      if (el.id === movingEl.id) return;
      const b = _bounds(el);

      const xCandidates = [
        { pos: b.x, src: mb.x },
        { pos: b.x2, src: mb.x2 },
        { pos: b.cx, src: mb.cx },
        { pos: b.x, src: mb.x2 },
        { pos: b.x2, src: mb.x },
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

      const yCandidates = [
        { pos: b.y, src: mb.y },
        { pos: b.y2, src: mb.y2 },
        { pos: b.cy, src: mb.cy },
        { pos: b.y, src: mb.y2 },
        { pos: b.y2, src: mb.y },
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

    const seen = new Set();
    const unique = guides.filter(g => {
      const key = `${g.axis}:${g.modelPos}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return { guides: unique, snapX, snapY };
  }

  function computeSpacing(movingEl, threshold = THRESHOLD * 2) {
    if (typeof DS === 'undefined') return { guides: [], snapX: null, snapY: null };

    const mb = _bounds(movingEl);
    const others = DS.elements
      .filter(el => el.id !== movingEl.id)
      .map(el => _bounds(el))
      .sort((a, b) => a.x - b.x);

    const guides = [];
    for (let i = 0; i < others.length - 1; i++) {
      const left = others[i];
      const right = others[i + 1];
      const gapL = mb.x - left.x2;
      const gapR = right.x - mb.x2;
      if (Math.abs(gapL - gapR) <= threshold && gapL > 0 && gapR > 0) {
        guides.push({ axis: 'x', modelPos: left.x2, type: 'spacing' });
        guides.push({ axis: 'x', modelPos: right.x, type: 'spacing' });
      }
    }
    return { guides };
  }

  return { THRESHOLD, _bounds, compute, computeSpacing };
})();

if (typeof module !== 'undefined') module.exports = AlignmentGeometry;
