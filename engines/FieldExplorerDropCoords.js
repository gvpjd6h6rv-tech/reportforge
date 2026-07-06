'use strict';

// RF-PREVIEW-DROP-1: pure geometry for resolving a Field-Explorer drop inside a
// section, given the section's ON-SCREEN rect (getBoundingClientRect) and the
// pointer's client coords. In Preview the render is paginated/inset/scaled, so
// the design-model Y (getSectionAtY) no longer matches what the user points at;
// instead we resolve the section by DOM (elementFromPoint -> [data-section-id])
// and convert the pointer offset back to MODEL coordinates using the
// model/rect ratio. That ratio makes the result invariant to zoom and scroll:
// the same visual band always yields the same relY, whatever the scale.
//
// Pure: no DOM, no globals. Owner of the preview-drop coordinate math, unit
// tested in isolation (field_explorer_drop_coords.test.mjs).
(function initFieldExplorerDropCoords(global) {
  // rect: { left, top, width, height } in screen px (post-transform/scale).
  // secH / pageW: MODEL section height / page width. H: element height.
  // Returns { x, relY } in MODEL coordinates, relY clamped to [0, secH - H].
  function relFromRect(rect, clientX, clientY, secH, pageW, H) {
    const rw = Number(rect && rect.width) || 0;
    const rh = Number(rect && rect.height) || 0;
    const sx = rw > 0 && pageW > 0 ? pageW / rw : 1;
    const sy = rh > 0 && secH > 0 ? secH / rh : 1;
    const x = Math.max(0, (clientX - rect.left) * sx);
    const maxRelY = Math.max(0, (Number(secH) || 0) - (Number(H) || 0));
    const relY = Math.max(0, Math.min((clientY - rect.top) * sy, maxRelY));
    return { x, relY };
  }

  global.FieldExplorerDropCoords = { relFromRect };
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof module !== 'undefined') {
  module.exports = (typeof window !== 'undefined' ? window : globalThis).FieldExplorerDropCoords;
}
