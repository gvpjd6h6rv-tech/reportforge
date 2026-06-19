'use strict';

/*
 * PreviewPaginationEngine — SINGLE SOURCE OF TRUTH for Preview pagination.
 *
 * Responsibility (1 file = 1 responsibility):
 *   Decide which detail rows land on which page, mirroring the Python render
 *   engine (advanced_engine.py::_pages) byte-for-byte. Both hit-layer and
 *   render-layer MUST consume this; neither may re-derive the formula.
 *
 * Canonical formula (advanced_engine.py):
 *   usable = pageH - mTop - mBot - phH - pfH
 *   cy starts at 0
 *   avail = usable - (rhH if page index 0 else 0)
 *   break when (forceBreak && cur) || (cy + rowH > avail && cur)
 *   page composition: [rh? (first only)] + [ph] + rows + [rf? (last only)] + [pf]
 *
 * Pure: no DOM, no globals beyond the explicit input. Deterministic.
 */
(function initPreviewPaginationEngine(global) {
  const MM2PX = 3.7795;

  // section: { id, stype, height, iterates?, newPageBefore? }
  function _byType(sections, stype) {
    return sections.filter((s) => s.stype === stype);
  }
  function _sumH(sections) {
    return sections.reduce((a, s) => a + Math.round(Number(s.height) || 0), 0);
  }

  /*
   * paginate(sections, rowCount, metrics) -> {
   *   pages: [{ index, first, last, rowStart, rowEnd }],  // rowEnd exclusive
   *   totalPages,
   *   metrics: { usable, rhH, phH, pfH, pageH, mTop, mBot }
   * }
   * rowCount = number of detail row instances (items * detailSecs.length is NOT
   * assumed; caller passes the real per-row heights via rowHeights).
   *
   * rowHeights: array, one entry per body row, in document order. Each entry:
   *   { height, forceBreak }
   */
  function paginate(sections, rowHeights, metrics) {
    const m = metrics || {};
    const pageH = Number.isFinite(m.pageH) ? m.pageH : 1123;
    const mTop = Number.isFinite(m.mTop) ? m.mTop : Math.trunc((Number(m.marginTopMm) || 0) * MM2PX);
    const mBot = Number.isFinite(m.mBot) ? m.mBot : Math.trunc((Number(m.marginBottomMm) || 0) * MM2PX);

    const phH = _sumH(_byType(sections, 'ph'));
    const pfH = _sumH(_byType(sections, 'pf'));
    const rhH = _sumH(_byType(sections, 'rh'));
    const usable = pageH - mTop - mBot - phH - pfH;

    const pages = [];
    let curStart = 0;
    let cy = 0;
    let count = 0;

    for (let i = 0; i < rowHeights.length; i++) {
      const rowH = Math.round(Number(rowHeights[i].height) || 0);
      const forceBreak = !!rowHeights[i].forceBreak;
      const avail = usable - (pages.length === 0 ? rhH : 0);
      if ((forceBreak && count > 0) || (cy + rowH > avail && count > 0)) {
        pages.push({ rowStart: curStart, rowEnd: i });
        curStart = i;
        cy = 0;
        count = 0;
      }
      cy += rowH;
      count++;
    }
    pages.push({ rowStart: curStart, rowEnd: rowHeights.length });

    const totalPages = pages.length;
    return {
      pages: pages.map((p, idx) => ({
        index: idx,
        first: idx === 0,
        last: idx === totalPages - 1,
        rowStart: p.rowStart,
        rowEnd: p.rowEnd,
      })),
      totalPages,
      metrics: { usable, rhH, phH, pfH, pageH, mTop, mBot },
    };
  }

  global.PreviewPaginationEngine = { paginate, MM2PX };
})(typeof window !== 'undefined' ? window : globalThis);
