'use strict';

const AlignmentActions = (() => {
  function align(mode, elements) {
    if (!elements || elements.length < 2) return elements;
    const bounds = elements.map(AlignmentGeometry._bounds);

    switch (mode) {
      case 'left': {
        const v = Math.min(...bounds.map(b => b.x));
        elements.forEach(el => { el.x = v; });
        break;
      }
      case 'right': {
        const v = Math.max(...bounds.map(b => b.x2));
        elements.forEach(el => { el.x = v - el.w; });
        break;
      }
      case 'cx': {
        const v = bounds.reduce((s, b) => s + b.cx, 0) / bounds.length;
        elements.forEach(el => { el.x = v - el.w / 2; });
        break;
      }
      case 'top': {
        const v = Math.min(...bounds.map(b => b.y));
        elements.forEach(el => { el.y = v - DS.getSectionTop(el.sectionId); });
        break;
      }
      case 'bottom': {
        const v = Math.max(...bounds.map(b => b.y2));
        elements.forEach(el => { el.y = v - el.h - DS.getSectionTop(el.sectionId); });
        break;
      }
      case 'cy': {
        const v = bounds.reduce((s, b) => s + b.cy, 0) / bounds.length;
        elements.forEach(el => { el.y = v - el.h / 2 - DS.getSectionTop(el.sectionId); });
        break;
      }
    }
    return elements;
  }

  function distribute(axis, elements) {
    if (!elements || elements.length < 3) return elements;
    const sorted = [...elements].sort((a, b) => axis === 'horizontal' ? a.x - b.x : a.y - b.y);
    const first = AlignmentGeometry._bounds(sorted[0]);
    const last = AlignmentGeometry._bounds(sorted[sorted.length - 1]);

    if (axis === 'horizontal') {
      const totalW = sorted.reduce((s, el) => s + el.w, 0);
      const span = last.x2 - first.x;
      const gap = (span - totalW) / (sorted.length - 1);
      let cursor = first.x2;
      for (let i = 1; i < sorted.length - 1; i++) {
        sorted[i].x = Math.round(cursor + gap);
        cursor = sorted[i].x + sorted[i].w;
      }
    } else {
      const secTops = sorted.map(el => DS.getSectionTop(el.sectionId));
      const totalH = sorted.reduce((s, el) => s + el.h, 0);
      const span = last.y2 - first.y;
      const gap = (span - totalH) / (sorted.length - 1);
      let cursor = first.y2;
      for (let i = 1; i < sorted.length - 1; i++) {
        sorted[i].y = Math.round(cursor + gap) - secTops[i];
        cursor = secTops[i] + sorted[i].y + sorted[i].h;
      }
    }
    return elements;
  }

  return { align, distribute };
})();

if (typeof module !== 'undefined') module.exports = AlignmentActions;
