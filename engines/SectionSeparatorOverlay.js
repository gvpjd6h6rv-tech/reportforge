'use strict';

/* SectionSeparatorOverlay — RF-CR-SECTION-SEPARATOR-1
 *
 * Renders the Crystal-like 1px-dark / 2px-gray / 1px-dark hairline relief
 * at the bottom edge of every Design-mode section, in a dedicated
 * `position: fixed` layer appended to <body> — entirely outside
 * #workspace/#viewport/#canvas-layer's scaled/clipped subtree.
 *
 * Why a screen-space overlay and not a CSS rule on .cr-section itself: a
 * CSS gradient declared inside #viewport (which carries the zoom
 * transform:scale(z)) has to divide its own thickness by --geo-zoom so the
 * POST-transform result stays constant — proven live this survives for a
 * single hairline, but a 4px-total 3-stop gradient sized that way blends
 * away or misrenders at some zoom fractions since the whole thing is
 * painted at a sub-device-pixel size pre-transform. Positioning a fixed
 * element from the section's own POST-transform getBoundingClientRect (the
 * same technique engines/SelectionOverlayPreviewLayers.js's
 * rf-extended-guide-layer already uses for the same class of problem) means
 * the 4px thickness is a REAL, already-final screen measurement — no zoom
 * division needed anywhere in this file.
 *
 * Ruler crossing: Crystal's separator visibly reaches into the interior of
 * the left (vertical) ruler gutter. #ruler-v is a sibling of #workspace,
 * outside this layer's own positioning context, so a small stub is painted
 * directly inside #ruler-v (mirroring
 * SelectionOverlayPreviewLayers.js's _paintRulerGuideStub for the
 * equivalent guide-into-ruler case) rather than trying to extend the fixed
 * line itself across a container it isn't part of.
 */
const SectionSeparatorOverlay = (() => {
  const LAYER_ID = 'rf-section-separator-layer';
  const LINE_CLASS = 'rf-section-sep-line';
  const RULER_STUB_CLASS = 'rf-section-sep-ruler-stub';

  const DARK_PX = 1;
  const GRAY_PX = 2;
  const TOTAL_PX = DARK_PX * 2 + GRAY_PX; // 4 visual px, stable at any zoom
  const DARK = '#303030';
  const LIGHT = '#d6d6d6';

  function _gradient() {
    return `linear-gradient(to bottom, ${DARK} 0, ${DARK} ${DARK_PX}px, ${LIGHT} ${DARK_PX}px, ${LIGHT} ${DARK_PX + GRAY_PX}px, ${DARK} ${DARK_PX + GRAY_PX}px, ${DARK} ${TOTAL_PX}px)`;
  }

  function _ensureLayer() {
    if (typeof document === 'undefined' || !document.body) return null;
    let layer = document.getElementById(LAYER_ID);
    if (!layer) {
      layer = document.createElement('div');
      layer.id = LAYER_ID;
      layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:3;overflow:visible';
      document.body.appendChild(layer);
    }
    return layer;
  }

  function _lineEl(layer, sectionId) {
    const cls = `${LINE_CLASS}-${sectionId}`;
    let el = layer.querySelector(`:scope > .${cls}`);
    if (!el) {
      el = document.createElement('div');
      el.className = `${LINE_CLASS} ${cls}`;
      el.style.position = 'fixed';
      el.style.backgroundRepeat = 'no-repeat';
      layer.appendChild(el);
    }
    return el;
  }

  // Mirrors SelectionOverlayPreviewLayers.js's _paintRulerGuideStub (the
  // "h axis" branch — a horizontal line's left endpoint crossing into the
  // vertical ruler), adapted to paint the 3-band gradient instead of a
  // single color.
  function _paintRulerStub(sectionId, sectionRect) {
    const rulerV = document.getElementById('ruler-v');
    if (!rulerV) return;
    rulerV.style.position = rulerV.style.position || 'relative';
    const cls = `${RULER_STUB_CLASS}-${sectionId}`;
    let stub = rulerV.querySelector(`:scope > .${cls}`);
    if (!stub) {
      stub = document.createElement('div');
      stub.className = `${RULER_STUB_CLASS} ${cls}`;
      stub.style.position = 'absolute';
      stub.style.pointerEvents = 'none';
      stub.style.zIndex = '6';
      stub.style.left = '0px';
      stub.style.width = '100%';
      stub.style.backgroundRepeat = 'no-repeat';
      rulerV.appendChild(stub);
    }
    const hostRect = rulerV.getBoundingClientRect();
    stub.style.top = `${sectionRect.bottom - hostRect.top - TOTAL_PX / 2}px`;
    stub.style.height = `${TOTAL_PX}px`;
    stub.style.backgroundImage = _gradient();
  }

  function render() {
    if (typeof document === 'undefined' || typeof DS === 'undefined' || !Array.isArray(DS.sections)) return;
    if (DS.previewMode) { clear(); return; }
    const layer = _ensureLayer();
    if (!layer) return;
    const gradient = _gradient();
    const seen = new Set();
    DS.sections.forEach((sec) => {
      if (sec.visible === false) return;
      const div = document.querySelector(`.cr-section[data-section-id="${sec.id}"]`);
      if (!div) return;
      const rect = div.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      seen.add(sec.id);
      const el = _lineEl(layer, sec.id);
      el.style.left = `${rect.left}px`;
      el.style.width = `${rect.width}px`;
      el.style.top = `${rect.bottom - TOTAL_PX / 2}px`;
      el.style.height = `${TOTAL_PX}px`;
      el.style.backgroundImage = gradient;
      _paintRulerStub(sec.id, rect);
    });
    layer.querySelectorAll(`.${LINE_CLASS}`).forEach((el) => {
      const id = el.className.split(' ').find((c) => c.startsWith(`${LINE_CLASS}-`))?.slice(LINE_CLASS.length + 1);
      if (id && !seen.has(id)) el.remove();
    });
    const rulerV = document.getElementById('ruler-v');
    if (rulerV) {
      rulerV.querySelectorAll(`.${RULER_STUB_CLASS}`).forEach((el) => {
        const id = el.className.split(' ').find((c) => c.startsWith(`${RULER_STUB_CLASS}-`))?.slice(RULER_STUB_CLASS.length + 1);
        if (id && !seen.has(id)) el.remove();
      });
    }
  }

  function clear() {
    const layer = typeof document !== 'undefined' ? document.getElementById(LAYER_ID) : null;
    if (layer) layer.innerHTML = '';
    const rulerV = typeof document !== 'undefined' ? document.getElementById('ruler-v') : null;
    if (rulerV) rulerV.querySelectorAll(`.${RULER_STUB_CLASS}`).forEach((el) => el.remove());
  }

  function init() {
    if (typeof document === 'undefined') return;
    const ws = document.getElementById('workspace');
    if (ws) {
      ws.addEventListener('rf:zoom-changed', render);
    }
    if (typeof ResizeObserver !== 'undefined') {
      const cl = document.getElementById('canvas-layer');
      if (cl) new ResizeObserver(render).observe(cl);
    }
    // PreviewEngineMode.js's show()/hide() are already at their governance
    // byte ceiling, so this can't hook them directly — instead watch the
    // same data-render-mode attribute show() sets synchronously before
    // DS.setPreviewMode(true), catching the Design->Preview transition the
    // instant it happens rather than waiting for some other trigger to
    // eventually call OverlayEngine.render() (hide()'s own render() call
    // already covers the Preview->Design direction).
    if (typeof MutationObserver !== 'undefined' && document.body) {
      new MutationObserver(render).observe(document.body, { attributes: true, attributeFilter: ['data-render-mode'] });
    }
    render();
  }

  return { render, clear, init, LAYER_ID };
})();

if (typeof module !== 'undefined') module.exports = SectionSeparatorOverlay;
