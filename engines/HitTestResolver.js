'use strict';

// RF-INTERACTION-AUDIT-1 (BUG NEW 4): single responsibility — given a screen
// point and a CSS selector for candidate element nodes, decide which one
// should receive the interaction (click routing AND hover highlight — both
// call this, so they can never resolve to two different elements). No DOM
// mutation, no DS writes, no events.
//
// Root cause this replaces: routing trusted the browser's native topmost
// element at a point (event.target / elementFromPoint). When two elements
// share the same (usually absent/default) z-index, native stacking breaks
// the tie by DOM order — later wins — regardless of which one is the
// "content" the user actually wants (a small field) versus a large
// decorative frame (a transparent rect) that happens to have been drawn or
// moved later. Proven live: a Detail-section rect placed after its inner
// fields in DS.elements silently ate every click over its whole bounding
// box, in both Design and Preview, on every repeated row.
//
// Fix: collect every candidate under the point (document.elementsFromPoint,
// already ordered front-to-back), then:
//   1. If any candidate carries an EXPLICIT (truthy) zIndex, trust the
//      native order outright — that's an intentional stacking decision
//      (native CSS stacking already honors it correctly; nothing to fix).
//   2. Otherwise all candidates are tied at the same default stacking level.
//      Prefer the smallest-area candidate that is NOT a transparent-
//      background rect (the "frame") over one that is.
//   3. If every candidate is a transparent frame (or there's only one
//      candidate), fall through to the native topmost — this is exactly
//      what keeps a frame's own border/empty area selectable (Gate S2).
const HitTestResolver = (() => {
  function _candidatesAt(clientX, clientY, selector) {
    if (typeof document === 'undefined' || typeof document.elementsFromPoint !== 'function') return [];
    return document.elementsFromPoint(clientX, clientY).filter((el) => el.matches && el.matches(selector));
  }

  function _elementFor(node, idAttr) {
    const id = node.dataset ? node.dataset[idAttr] : null;
    return (typeof DS !== 'undefined' && DS.getElementById && id) ? DS.getElementById(id) : null;
  }

  function _isTransparentFrame(el) {
    return !!(el && el.type === 'rect' && el.bgColor === 'transparent');
  }

  // Returns the winning DOM node among candidates matching `selector` at
  // (clientX, clientY), or null if none. `idAttr` names the dataset key
  // holding the element id ('id' for Design .cr-element, 'originId' for
  // Preview .pv-el).
  function resolve(clientX, clientY, { selector, idAttr = 'id' } = {}) {
    if (!selector) return null;
    const nodes = _candidatesAt(clientX, clientY, selector);
    if (nodes.length <= 1) return nodes[0] || null;

    const scored = nodes.map((node) => {
      const el = _elementFor(node, idAttr);
      const rect = node.getBoundingClientRect();
      return {
        node,
        hasExplicitZ: !!(el && el.zIndex),
        area: rect.width * rect.height,
        isFrame: _isTransparentFrame(el),
      };
    });

    if (scored.some((s) => s.hasExplicitZ)) return nodes[0];

    const nonFrame = scored.filter((s) => !s.isFrame);
    if (nonFrame.length) {
      nonFrame.sort((a, b) => a.area - b.area);
      return nonFrame[0].node;
    }
    return nodes[0];
  }

  return { resolve };
})();

globalThis.HitTestResolver = HitTestResolver;
if (typeof module !== 'undefined') module.exports = HitTestResolver;
