'use strict';

// RF-PREVIEW-INSERT-CLICK-POSITION-1: DS.getSectionAtY() walks DS.sections in
// their flat DESIGN declaration order, treating every section — including a
// repeating 'det' section — as exactly one band of its template height. That
// model is correct for the Design canvas (one instance per section, in
// declared order) but diverges from what Preview actually renders: a
// repeating section prints once per data row (N × its template height,
// stacked), and Report Footer prints once right after the last detail row —
// before the current page's Page Footer — regardless of where 'rf'/'pf' sit
// in DS.sections. Proven live: for a 9-row document, DS.getSectionAtY()
// placed a Page-Footer click inside 's-rf' because the flat model puts 'pf'
// before 'rf', while the rendered page draws 'rf' before 'pf'.
//
// A Preview click must therefore resolve its target section from the real
// rendered DOM — the hit-layer's own .pv-section proxies (already the
// pointer-events:auto hit-testing surface, geometry-identical to the visible
// .preview-render-layer) — never from the flat model.
//
// Single responsibility: pointer position -> {sectionId, relY}. Creates
// nothing, touches no DS state.
const PreviewInsertPositionResolver = (() => {
  function _zoom() {
    return (typeof RF !== 'undefined' && RF.Geometry && typeof RF.Geometry.zoom === 'function')
      ? RF.Geometry.zoom() : 1;
  }

  // Resolves {sectionId, relY} (relY in unscaled model units, relative to the
  // resolved section/row's own top) for a Preview pointer position, from
  // whichever rendered section/detail-row node is actually under the point.
  // Returns null when the point isn't over any rendered section (Gate 8).
  function resolve(clientX, clientY) {
    if (typeof document === 'undefined') return null;
    const node = document.elementFromPoint(clientX, clientY);
    if (!node || typeof node.closest !== 'function') return null;
    const secNode = node.closest('.pv-section[data-section-id]')
      || node.closest('#preview-content .preview-render-layer .cr-section, #preview-content .preview-render-layer .cr-detail-row');
    if (!secNode) return null;
    const sectionId = secNode.dataset.sectionId;
    if (!sectionId) return null;
    const rect = secNode.getBoundingClientRect();
    const relY = (clientY - rect.top) / _zoom();
    return { sectionId, relY };
  }

  return { resolve };
})();

globalThis.PreviewInsertPositionResolver = PreviewInsertPositionResolver;
if (typeof module !== 'undefined') module.exports = PreviewInsertPositionResolver;
