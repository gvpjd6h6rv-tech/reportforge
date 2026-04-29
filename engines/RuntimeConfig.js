'use strict';
/**
 * RuntimeConfig — ReportForge SSOT for all visual / configurable constants.
 *
 * THIS IS THE ONLY PLACE where ruler sizes, canvas dimensions, zoom steps,
 * and layout metrics are defined.  Every consumer must read from here.
 *
 * Rule: to change a ruler or layout dimension, edit ONE value here.
 *       The guard `audit/configurational_ssot_guard.mjs` enforces it.
 *
 * SSOT invariant:
 *   ruler.topPx  === --rf-ruler-top  in tokens.css
 *   ruler.sidePx === --rf-ruler-side in tokens.css
 *   ruler.sidePx === CFG.RULER_W     (RuntimeGlobals.js)
 *   ruler.topPx  === CFG.RULER_H     (RuntimeGlobals.js)
 */

const _RC = Object.freeze({
  ruler: Object.freeze({
    topPx:    22,   // horizontal ruler height in CSS px
    sidePx:   22,   // vertical ruler total width in CSS px
    gutterPx: 0,    // canonical geometry: no split gutter
    tickPx:   22,   // full-width ruler like horizontal
    // invariant: gutterPx + tickPx === sidePx
  }),

  canvas: Object.freeze({
    pageW:         754,
    grid:          4,
    modelGrid:     0.01 * 96 / 25.4,
    pageMarginLeft: 0,
    pageMarginTop:  0,
    sectionMinH:   12,
    sectionMaxH:   800,
    minElW:        8,
    minElH:        6,
    handleHit:     4,
  }),

  zoom: Object.freeze({
    steps: Object.freeze([0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 4.0]),
    min:   0.01,
    max:   64.0,
  }),
});

if (typeof window !== 'undefined') {
  window.RF = window.RF || {};
  window.RF.RuntimeConfig = _RC;
}
if (typeof module !== 'undefined') module.exports = { RuntimeConfig: _RC };
if (typeof globalThis !== 'undefined') {
  globalThis.RF = globalThis.RF || {};
  globalThis.RF.RuntimeConfig = _RC;
}
