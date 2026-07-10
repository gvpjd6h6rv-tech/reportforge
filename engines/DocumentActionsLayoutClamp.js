'use strict';

// RF-SECTION-MOVE-INK-1: a sectionId change carries x/y that were only ever
// valid relative to the OLD section's coordinate frame. Clamp them into the
// NEW section's own bounds -- otherwise a field created deep in a tall
// section (e.g. y=34 in s-ph) silently lands outside a shorter target
// section's own box when moved (e.g. into the 14px detail band), invisible
// there because .cr-section's `contain: layout paint`
// (designer/styles/canvas.css) clips any child painted past the section's
// own height, even though the separate #selection-layer overlay (unclipped,
// canvas-global) keeps showing a seemingly-correct selection box. Confirmed
// LIVE with a pixel-level ink test on the real Properties "Sección:" dropdown
// (fieldPath cliente.email, sentinel "INK106": 0 ink pixels after an
// unclamped move; forensic scan #10.7R).
//
// Pure function, no DOM, no globals beyond the explicit input -- shared by
// DocumentActions.js::updateElementLayout (the single canonical state
// mutation path both the Properties-panel dropdown and any programmatic
// caller funnel through) so every sectionId change gets the same clamp.
const DocumentActionsLayoutClamp = (() => {
  // RF-SECTION-MOVE-INK-1 / CONTRACT: an element must NEVER straddle two
  // section bands. Enforce the invariant on EVERY layout mutation (not only
  // on a sectionId change) against the RESOLVED owning section
  // (patch.sectionId if the move reassigns it, else element.sectionId):
  //     0 <= y <= section.height - h
  //     0 <= x <= pageWidth  - w
  // Policy B (hard-clamp / no-cross): a mouse drag or keyboard nudge stops at
  // the owning section's boundary instead of half-crossing; to change section
  // the user uses the "Sección:" dropdown (which sets patch.sectionId, and is
  // then clamped into the new band by the same rule here). Idempotent: an
  // already in-bounds element is unchanged.
  // POLICY A (dynamic re-ownership): when a move takes the element into a
  // different band, sectionId FOLLOWS the band where the element visually
  // lands (resolved by its vertical CENTER), y is recomputed relative to the
  // new band, and clamped so it never straddles. Uses the DS globals for the
  // absolute section geometry (getSectionTop / sections).
  function _sectionsList(selectors) {
    if (typeof DS !== 'undefined' && Array.isArray(DS.sections)) return DS.sections;
    if (selectors && Array.isArray(selectors.sections)) return selectors.sections;
    return null;
  }
  function _sectionTop(id, selectors) {
    if (typeof DS !== 'undefined' && typeof DS.getSectionTop === 'function') return DS.getSectionTop(id);
    const list = _sectionsList(selectors) || [];
    let t = 0; for (const s of list) { if (s.id === id) return t; t += Number(s.height) || 0; }
    return 0;
  }
  function _getSection(id, selectors) {
    if (selectors && selectors.getSection) return selectors.getSection(id);
    const list = _sectionsList(selectors) || [];
    return list.find((s) => s.id === id) || null;
  }

  function normalizeElementLayout(element, patch, selectors) {
    const finalPatch = { ...patch };
    const explicitSection = Object.prototype.hasOwnProperty.call(patch, 'sectionId');
    const startId = explicitSection ? patch.sectionId : element.sectionId;

    const w = Object.prototype.hasOwnProperty.call(patch, 'w') ? patch.w : element.w;
    const h = Object.prototype.hasOwnProperty.call(patch, 'h') ? patch.h : element.h;
    const curX = Object.prototype.hasOwnProperty.call(patch, 'x') ? patch.x : element.x;
    const curY = Object.prototype.hasOwnProperty.call(patch, 'y') ? patch.y : element.y;

    let ownerId = startId;
    let relY = curY;
    const list = _sectionsList(selectors);

    // Re-own by OVERFLOW/CARRY when the move is positional (y changed) and the
    // dropdown didn't set an explicit target. A pure center rule deadlocks:
    // the anti-straddle clamp caps y at band.height-h, so the center stops
    // h/2 short of the boundary and can never cross. Instead, when the
    // candidate y overflows the band, carry the surplus into the adjacent
    // band and clamp there -- crosses cleanly, never straddles, works up and
    // down, for both mouse drag and keyboard nudge.
    // DESIGNER-DRAG-LINE-SECTION-LOCK-01: real vertical intent = an explicit
    // sectionId target (dropdown), or a patch.y that actually differs from
    // element.y -- not just "patch has a y key". Gates BOTH the re-owning
    // walk below AND the anti-straddle y-clamp further down: an oversized
    // element (h > section.height) has maxY=0, so without the second gate
    // any horizontal-only move still snapped an already out-of-band y back
    // to 0. Confirmed live against factura_a4.json (line created at y=15,
    // h=60 in a 30px section, snapped to y=0 on its first sideways drag).
    const hasVerticalIntent = explicitSection
      || (Object.prototype.hasOwnProperty.call(patch, 'y') && curY !== element.y);

    if (hasVerticalIntent && !explicitSection && list) {
      let idx = list.findIndex((s) => s.id === startId);
      if (idx >= 0) {
        if (relY < 0) {
          while (relY < 0 && idx > 0) { idx -= 1; relY += Number(list[idx].height) || 0; }
        } else {
          while (relY > (Number(list[idx].height) || 0) - h && idx < list.length - 1) {
            relY -= Number(list[idx].height) || 0; idx += 1;
          }
        }
        ownerId = list[idx].id;
      }
    }

    const ownerSec = _getSection(ownerId, selectors);
    if (!ownerSec) return finalPatch;
    if (ownerId !== element.sectionId) finalPatch.sectionId = ownerId;

    if (hasVerticalIntent) {
      const maxY = Math.max(0, (Number(ownerSec.height) || 0) - h);
      finalPatch.y = Math.max(0, Math.min(relY, maxY));
    }

    const pageW = typeof CFG !== 'undefined' && Number.isFinite(CFG.PAGE_W) ? CFG.PAGE_W : null;
    if (pageW !== null) finalPatch.x = Math.max(0, Math.min(curX, Math.max(0, pageW - w)));
    return finalPatch;
  }

  // Back-compat alias (previous name); same enforcer.
  const clampSectionMovePatch = normalizeElementLayout;

  return { normalizeElementLayout, clampSectionMovePatch };
})();

if (typeof module !== 'undefined') {
  module.exports = DocumentActionsLayoutClamp;
}
