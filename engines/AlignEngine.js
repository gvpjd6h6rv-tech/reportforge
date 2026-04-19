'use strict';

const AlignEngine = {
  alignLeft() { if (typeof CommandEngine !== 'undefined') CommandEngine.alignLefts?.(); else this._fallback('left'); DS.saveHistory(); },
  alignRight() { if (typeof CommandEngine !== 'undefined') CommandEngine.alignRights?.(); else this._fallback('right'); DS.saveHistory(); },
  alignTop() { if (typeof CommandEngine !== 'undefined') CommandEngine.alignTops?.(); else this._fallback('top'); DS.saveHistory(); },
  alignBottom() { if (typeof CommandEngine !== 'undefined') CommandEngine.alignBottoms?.(); else this._fallback('bottom'); DS.saveHistory(); },
  alignCenter() { if (typeof CommandEngine !== 'undefined') CommandEngine.alignCenters?.(); DS.saveHistory(); },
  _fallback(dir) {
    const ids = [...DS.selection]; if (ids.length < 2) return;
    const els = ids.map(id => DS.getElementById(id)).filter(Boolean);
    if (dir === 'left') { const minX = Math.min(...els.map(e => e.x)); els.forEach(e => DS.updateElementLayout(e.id, { x: minX })); }
    if (dir === 'right') { const maxR = Math.max(...els.map(e => e.x + e.w)); els.forEach(e => DS.updateElementLayout(e.id, { x: maxR - e.w })); }
    if (dir === 'top') { const minY = Math.min(...els.map(e => e.y)); els.forEach(e => DS.updateElementLayout(e.id, { y: minY })); }
    if (dir === 'bottom') { const maxB = Math.max(...els.map(e => e.y + e.h)); els.forEach(e => DS.updateElementLayout(e.id, { y: maxB - e.h })); }
    _canonicalCanvasWriter().renderAll();
  },
};

if (typeof module !== 'undefined') module.exports = AlignEngine;
