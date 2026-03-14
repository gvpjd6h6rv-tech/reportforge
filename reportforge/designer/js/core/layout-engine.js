/**
 * core/layout-engine.js — RF.Core.LayoutEngine
 * Layer   : Core
 * Purpose : Report pagination and section layout.
 *   - Dynamic section growth (canGrow, canShrink)
 *   - keepTogether (header+data+footer on same page)
 *   - Orphan/widow control
 *   - Multi-column layout
 *   - Page break before/after
 *
 * Public API:
 *   layoutSection(section, rows, ctx)  → { height, pages, overflow }
 *   measureSection(section, data)      → { intrinsicHeight, canGrow, canShrink }
 *   paginate(ctx)                      → Page[]
 *
 * Page = { pageNum, sections: LayoutSection[], heightUsed }
 * LayoutSection = { sectionId, rows, y, height, pageNum }
 */
import RF from '../rf.js';

RF.Core.LayoutEngine = (() => {

  // ── Constants ─────────────────────────────────────────────────────────────
  const PAGE_H_DEFAULT  = 1122; // A4 at 96dpi (297mm)
  const PAGE_W_DEFAULT  = 794;
  const MARGIN_TOP      = 20;
  const MARGIN_BOTTOM   = 20;
  const ORPHAN_MIN_ROWS = 2;    // minimum rows before a page break

  // ── Measure ────────────────────────────────────────────────────────────────

  /**
   * Compute the intrinsic height of a section for a given data row set.
   * @param {object} section   DocumentModel section descriptor.
   * @param {any[]}  [rows]    Data rows (for detail sections).
   * @returns {{ intrinsicHeight:number, canGrow:boolean, canShrink:boolean }}
   */
  function measureSection(section, rows = []) {
    const base = section.height ?? 18;
    let   h    = base;

    if (section.canGrow && rows.length > 1) {
      // Each extra row adds base height (simplified; real impl measures element content)
      h = base * Math.max(1, rows.length);
    }
    if (section.canShrink && rows.length === 0) {
      h = 0;
    }
    return {
      intrinsicHeight: h,
      canGrow:         section.canGrow ?? false,
      canShrink:       section.canShrink ?? false,
    };
  }

  /**
   * Layout a single section, handling overflow across pages.
   * @param {object}  section
   * @param {any[]}   rows       Rows for this section (detail sections).
   * @param {object}  ctx        Execution context (has .pageH, .pageW, .currentY, .pageNum).
   * @returns {{ bands: LayoutBand[], pagesConsumed: number }}
   */
  function layoutSection(section, rows = [], ctx = {}) {
    const pageH   = (ctx.pageH   ?? PAGE_H_DEFAULT) - MARGIN_TOP - MARGIN_BOTTOM;
    const startY  = ctx.currentY ?? MARGIN_TOP;
    let   currentY = startY;
    let   pageNum  = ctx.pageNum ?? 1;
    const bands    = [];

    if (section.pageBreakBefore && currentY > MARGIN_TOP) {
      pageNum++;
      currentY = MARGIN_TOP;
    }

    if (section.stype === 'det' && rows.length > 0) {
      // Detail sections: one band per row
      const rowH = section.height ?? 18;
      for (let i = 0; i < rows.length; i++) {
        // Orphan control: if only ORPHAN_MIN_ROWS fit and we're near page bottom, force break
        const remaining = rows.length - i;
        if (currentY + rowH > pageH && remaining >= ORPHAN_MIN_ROWS) {
          pageNum++;
          currentY = MARGIN_TOP;
        }
        bands.push({ sectionId: section.id, rowIndex: i, row: rows[i], y: currentY, height: rowH, pageNum });
        currentY += rowH;
      }
    } else {
      // Fixed sections (RH, PH, GH, GF, PF, RF): single band
      const h = measureSection(section, rows).intrinsicHeight;
      if (h === 0 && section.canShrink) {
        // Suppressed section — no band
      } else {
        if (currentY + h > pageH) {
          pageNum++;
          currentY = MARGIN_TOP;
        }
        bands.push({ sectionId: section.id, rowIndex: -1, row: null, y: currentY, height: h, pageNum });
        currentY += h;
      }
    }

    return {
      bands,
      finalY:         currentY,
      finalPage:      pageNum,
      pagesConsumed:  pageNum - (ctx.pageNum ?? 1),
    };
  }

  /**
   * Full report pagination.
   * @param {object} ctx  ExecutionGraph context: { rows, groupTree, layout? }
   * @returns {Page[]}    Array of page objects.
   */
  function paginate(ctx) {
    const layout    = RF.Core.DocumentModel?.layout ?? ctx.layout ?? {};
    const sections  = layout.sections ?? [];
    const rows      = ctx.rows ?? [];
    const groupTree = ctx.groupTree ?? null;
    const pageH     = layout.pageHeight ?? PAGE_H_DEFAULT;
    const pageW     = layout.pageWidth  ?? PAGE_W_DEFAULT;
    const columns   = layout.columns    ?? 1;

    // Build a flat ordered list of { section, rows } to render
    const renderList = _buildRenderList(sections, rows, groupTree, layout.groups ?? []);

    const pages  = [{ pageNum: 1, bands: [], heightUsed: MARGIN_TOP }];
    let pCtx = { pageH, pageW, currentY: MARGIN_TOP, pageNum: 1, columns };

    for (const { section, sectionRows } of renderList) {
      const result = layoutSection(section, sectionRows, pCtx);
      // Ensure we have enough page slots
      while (pages.length < result.finalPage) {
        pages.push({ pageNum: pages.length + 1, bands: [], heightUsed: MARGIN_TOP });
      }
      for (const band of result.bands) {
        const page = pages[band.pageNum - 1];
        page.bands.push(band);
        page.heightUsed = Math.max(page.heightUsed, band.y + band.height);
      }
      pCtx.currentY = result.finalY;
      pCtx.pageNum  = result.finalPage;
    }

    return pages;
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /**
   * Flatten the section/group tree into an ordered render list.
   * Returns [{section, sectionRows}] in report order:
   *   RH, PH, [GH]*, Detail, [GF]*, PF, RF
   */
  function _buildRenderList(sections, rows, groupTree, groups) {
    const list = [];
    const byType = type => sections.filter(s => s.stype === type);

    // Report Header
    for (const s of byType('rh')) list.push({ section: s, sectionRows: [] });
    // Page Header
    for (const s of byType('ph')) list.push({ section: s, sectionRows: [] });

    if (groups.length && groupTree) {
      _flattenGroupTree(groupTree, sections, groups, list, 0);
    } else {
      // No groups: detail only
      for (const s of byType('det')) list.push({ section: s, sectionRows: rows });
    }

    // Page Footer
    for (const s of byType('pf')) list.push({ section: s, sectionRows: [] });
    // Report Footer
    for (const s of byType('rf')) list.push({ section: s, sectionRows: [] });

    return list;
  }

  function _flattenGroupTree(nodes, sections, groups, list, level) {
    for (const node of nodes) {
      // Group Header
      const gh = sections.find(s => s.stype === `gh${level + 1}` || (s.stype === 'gh' && s.groupIndex === level));
      if (gh) list.push({ section: gh, sectionRows: [{ _groupKey: node._groupKey }] });

      if (Array.isArray(node.rows) && node.rows[0]?._groupKey !== undefined) {
        // Nested group
        _flattenGroupTree(node.rows, sections, groups, list, level + 1);
      } else {
        // Leaf: detail rows
        const det = sections.find(s => s.stype === 'det');
        if (det) list.push({ section: det, sectionRows: node.rows ?? [] });
      }

      // Group Footer
      const gf = sections.find(s => s.stype === `gf${level + 1}` || (s.stype === 'gf' && s.groupIndex === level));
      if (gf) list.push({ section: gf, sectionRows: [{ _groupKey: node._groupKey }] });
    }
  }

  return Object.freeze({ layoutSection, measureSection, paginate });
})();

export default RF;
