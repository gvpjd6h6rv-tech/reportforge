'use strict';

// Addresses preview render-layer nodes (server-rendered .cr-section/.cr-detail-row
// children, tagged with data-el-index) so a drag in progress can keep the
// visible preview content in sync with the (otherwise invisible) hit-layer
// proxy and the design-mode element, instead of only catching up on mouseup.
const SelectionDragPreviewSync = (() => {
  function previewRenderElementIndex(sectionId, elementId) {
    if (typeof DS === 'undefined' || !Array.isArray(DS.elements)) return -1;
    return DS.elements.filter((el) => el.sectionId === sectionId).findIndex((el) => el.id === elementId);
  }

  function findPreviewRenderNodes(orig) {
    if (typeof DS === 'undefined' || !DS.previewMode || typeof document === 'undefined') return [];
    const section = typeof DS.getSection === 'function' ? DS.getSection(orig.sectionId) : null;
    if (!section) return [];
    const index = previewRenderElementIndex(orig.sectionId, orig.id);
    if (index < 0) return [];
    const base = section.iterates
      ? `#preview-content .preview-render-layer .cr-detail-row[data-section-id="${orig.sectionId}"]`
      : `#preview-content .preview-render-layer .cr-section[data-section-id="${orig.sectionId}"]`;
    return [...document.querySelectorAll(`${base} [data-el-index="${index}"]`)];
  }

  function dragTransformStyle(node, el, orig, sectionTop, dx, dy) {
    if (!node) return;
    const snappedAbsX = el.x;
    const snappedAbsY = sectionTop + el.y;
    const rawAbsX = orig.x + dx;
    const rawAbsY = orig.sectionTop + orig.y + dy;
    node.style.left = el.x + 'px';
    node.style.top = el.y + 'px';
    node.style.transform = `translate(${(rawAbsX - snappedAbsX).toFixed(3)}px, ${(rawAbsY - snappedAbsY).toFixed(3)}px)`;
  }

  return {
    previewRenderElementIndex,
    findPreviewRenderNodes,
    dragTransformStyle,
  };
})();

globalThis.SelectionDragPreviewSync = SelectionDragPreviewSync;

if (typeof module !== 'undefined') module.exports = SelectionDragPreviewSync;
