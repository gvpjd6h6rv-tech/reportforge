// RF-PREVIEW-BBOX-INK-1 — hover & selection consume ONE visual-bbox source:
// the render-layer ink first, the hit-layer .pv-el as a safe fallback, never
// flat model coords. Pure decision, DOM stubbed.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const INK = { left: 100, top: 50, width: 200, height: 30 };   // render ink rect
const HIT = { left: 101, top: 51, width: 200, height: 30 };   // pv-el, +1px off
const mkNode = (rect, ds) => ({ dataset: ds || {}, getBoundingClientRect: () => rect });
const LAYER = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 1000 }) };

function install(renderNodes, hitNodes) {
  globalThis.window = {};
  globalThis.DS = { zoom: 1, elements: [{ id: 'a', sectionId: 's-rh' }, { id: 'b', sectionId: 's-rh' }] };
  const route = (sel) => sel.includes('preview-render-layer') ? renderNodes
    : sel.includes('preview-hit-layer') ? hitNodes : [];
  globalThis.document = {
    querySelectorAll: (sel) => route(sel),
    querySelector: (sel) => route(sel)[0] || null,
  };
}

const P = require('../../engines/SelectionOverlayPreview.js');
const EL = { id: 'a', sectionId: 's-rh', x: 100, y: 50, w: 200, h: 30 };

test('render ink is unique -> bbox uses the INK rect (not the +1px pv-el)', () => {
  install([mkNode(INK)], [mkNode(HIT, { originId: 'a' })]);
  const r = P.getPreviewVisualBBox(EL, LAYER);
  assert.deepEqual({ left: r.left, top: r.top, width: r.width, height: r.height }, INK);
});

test('render ink AMBIGUOUS (2 matches, e.g. repeated section) -> fall back to pv-el', () => {
  install([mkNode(INK), mkNode(INK)], [mkNode(HIT, { originId: 'a' })]);
  const r = P.getPreviewVisualBBox(EL, LAYER);
  assert.deepEqual({ left: r.left, top: r.top, width: r.width, height: r.height }, HIT);
});

test('neither ink nor pv-el found -> null (never flat model coords / stale box)', () => {
  install([], []);
  assert.equal(P.getPreviewVisualBBox(EL, LAYER), null);
});

test('previewRect delegates to the same single source', () => {
  install([mkNode(INK)], [mkNode(HIT, { originId: 'a' })]);
  assert.deepEqual(P.previewRect(EL, LAYER), P.getPreviewVisualBBox(EL, LAYER));
});

test('findRenderInkElement returns null when the model id is not in its section', () => {
  install([mkNode(INK)], []);
  assert.equal(P.findRenderInkElement({ id: 'zzz', sectionId: 's-rh' }), null);
});
