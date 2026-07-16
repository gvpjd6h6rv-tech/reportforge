'use strict';
/**
 * RuntimeConfig — ReportForge SSOT for all visual / configurable constants.
 *
 * THIS IS THE ONLY PLACE where ruler sizes, canvas dimensions, zoom steps,
 * page-format presets, and layout metrics are defined.
 *
 * Rule: to change a ruler or layout dimension, edit ONE value here.
 *       The guard `audit/configurational_ssot_guard.mjs` enforces it.
 */

const _RC = Object.freeze({
  units: Object.freeze({
    cssPxPerMm: 96 / 25.4,
  }),

  ruler: Object.freeze({
    topPx:    22,
    sidePx:   22,
    gutterPx: 0,
    tickPx:   22,
  }),

  canvas: Object.freeze({
    pageW:         754,
    pageH:         1123,
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

  pageFormats: Object.freeze({
    A4: Object.freeze({
      id: 'A4',
      label: 'A4',
      pageSize: 'A4',
      widthMm: 210,
      pageWidthPx: 794,
      pageHeightPx: 1123,
      marginsMm: Object.freeze({ top: 15, right: 20, bottom: 15, left: 20 }),
    }),
    TICKET: Object.freeze({
      id: 'TICKET',
      label: 'Ticket',
      pageSize: 'TICKET',
      widthsMm: Object.freeze([58, 70, 76]),
      defaultWidthMm: 76,
      pageHeightPx: 1123,
      marginsMm: Object.freeze({ top: 3, right: 3, bottom: 3, left: 3 }),
    }),
  }),

  zoom: Object.freeze({
    steps: Object.freeze([0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 3.0, 4.0]),
    min:   0.01,
    max:   4.0,
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
