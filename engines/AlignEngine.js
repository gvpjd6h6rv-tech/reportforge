'use strict';

const AlignEngine = {
  alignLeft() { this._dispatch('alignLefts', 'left'); },
  alignRight() { this._dispatch('alignRights', 'right'); },
  alignTop() { this._dispatch('alignTops', 'top'); },
  alignBottom() { this._dispatch('alignBottoms', 'bottom'); },
  alignCenter() { this._dispatch('alignCenters', null); },

  // SP-CLEANUP-01: alignLeft/Right/Top/Bottom/Center all shared this exact
  // dispatch shape (CommandEngine if present, else _fallback, then
  // DS.saveHistory()) — extracted for real, not to hide it: fallbackDir is
  // deliberately null for alignCenter, preserving its original asymmetry
  // (no fallback call, no render, when CommandEngine is absent).
  _dispatch(commandMethod, fallbackDir) {
    if (typeof CommandEngine !== 'undefined') {
      CommandEngine[commandMethod]?.();
    } else if (fallbackDir) {
      this._fallback(fallbackDir);
    }
    DS.saveHistory();
  },

  _fallback(dir) {
    const ids = [...DS.selection];
    if (ids.length < 2) return;
    const els = ids.map(id => DS.getElementById(id)).filter(Boolean);
    if (dir === 'left') {
      const minX = Math.min(...els.map(e => e.x));
      els.forEach(e => DS.updateElementLayout(e.id, { x: minX }, 'AlignEngine.fallback'));
    }
    if (dir === 'right') {
      const maxR = Math.max(...els.map(e => e.x + e.w));
      els.forEach(e => DS.updateElementLayout(e.id, { x: maxR - e.w }, 'AlignEngine.fallback'));
    }
    if (dir === 'top') {
      const minY = Math.min(...els.map(e => e.y));
      els.forEach(e => DS.updateElementLayout(e.id, { y: minY }, 'AlignEngine.fallback'));
    }
    if (dir === 'bottom') {
      const maxB = Math.max(...els.map(e => e.y + e.h));
      els.forEach(e => DS.updateElementLayout(e.id, { y: maxB - e.h }, 'AlignEngine.fallback'));
    }
    _canonicalCanvasWriter().renderAll();
  },
};

if (typeof module !== 'undefined') module.exports = AlignEngine;
