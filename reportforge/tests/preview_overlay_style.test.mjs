// RF-PREVIEW-BBOX-HUG-1 — hover & selection share one frame-drawing
// mechanism in Preview; Design selection keeps its plain border (control/
// regression, untouched).
//
// RF-PREVIEW-THIN-OVERLAY-1 — proven live (raw pixel raster, see
// tools/diagnostics/rf-bbox-ink/rf_thickness_raster_probe.mjs) that neither
// outline-width NOR a div's own height/width survives Preview's
// transform:scale(zoom) at sub-1px values — both floor to a whole device
// pixel pre-transform. Only background-size on a CSS gradient anti-aliases
// correctly through the transform. A first attempt combined 4 gradient
// layers into ONE element's `background` and only the first layer rendered
// live — so paintHairlineFrame instead builds 4 INDEPENDENT edge divs,
// appended directly to the overlay layer at the target rect's real absolute
// coordinates (never nested in / percentage-relative to the selection or
// hover box), each with ONE centered gradient layer.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { thinStrokeWidth, designBoxStyle } = require('../../engines/PreviewOverlayStyle.js');

// ---------- pure formula (no DOM needed) ----------

test('thinStrokeWidth: 100% zoom renders the 0.5px hairline target', () => {
  assert.equal(thinStrokeWidth(1), 0.5);
});

test('thinStrokeWidth: 400% zoom divides down so the SCREEN result stays 0.5px', () => {
  const w = thinStrokeWidth(4);
  assert.equal(w, 0.125);
  assert.equal(w * 4, 0.5); // visual result after transform:scale(4)
});

test('thinStrokeWidth: floors at 0.125 instead of vanishing at extreme zoom', () => {
  assert.equal(thinStrokeWidth(8), 0.125);
  assert.equal(thinStrokeWidth(100), 0.125);
});

test('thinStrokeWidth: zoom<1 direction is untouched (asks for a wider stroke)', () => {
  assert.equal(thinStrokeWidth(0.5), 1);
});

test('thinStrokeWidth: invalid zoom falls back to 1 (never NaN/Infinity)', () => {
  assert.equal(thinStrokeWidth(0), 0.5);
  assert.equal(thinStrokeWidth(-1), 0.5);
  assert.equal(thinStrokeWidth(NaN), 0.5);
  assert.equal(thinStrokeWidth(undefined), 0.5);
});

test('designBoxStyle: DESIGN unchanged — flat 1px border, no outline', () => {
  const s = designBoxStyle('#0066CC');
  assert.equal(s.border, '1px solid #0066CC');
  assert.equal(s.outline, 'none');
});

// ---------- paintHairlineFrame (needs a DOM — vm + fake elements, same
// pattern used across this repo's other engine tests) ----------

const SRC = fs.readFileSync(path.resolve(ROOT, 'engines/PreviewOverlayStyle.js'), 'utf8');

function makeFakeLayer() {
  const children = [];
  return {
    children,
    appendChild(child) { children.push(child); return child; },
    querySelector(sel) {
      const cls = sel.replace('.', '');
      return children.find((c) => c.className.split(' ').includes(cls)) || null;
    },
  };
}

function makeFakeDoc() {
  return {
    createElement() {
      return { className: '', style: {}, remove() {} };
    },
  };
}

function loadInVm() {
  const ctx = { document: makeFakeDoc() };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: 'PreviewOverlayStyle.js' });
  return ctx.PreviewOverlayStyle;
}

const RECT = { left: 100, top: 200, width: 300, height: 40 };

test('paintHairlineFrame: appends 4 INDEPENDENT edge divs directly to the layer (not nested)', () => {
  const P = loadInVm();
  const layer = makeFakeLayer();
  const edges = P.paintHairlineFrame(layer, RECT, '#0066CC', 4, 'sel');
  assert.equal(edges.length, 4);
  assert.equal(layer.children.length, 4, 'all 4 edges are direct children of the layer');
});

test('paintHairlineFrame: each edge uses REAL absolute px coordinates from rect (no %, no calc)', () => {
  const P = loadInVm();
  const layer = makeFakeLayer();
  P.paintHairlineFrame(layer, RECT, '#0066CC', 1, 'sel');
  const top = layer.querySelector('rf-hairline-edge-sel-top');
  const bottom = layer.querySelector('rf-hairline-edge-sel-bottom');
  const left = layer.querySelector('rf-hairline-edge-sel-left');
  const right = layer.querySelector('rf-hairline-edge-sel-right');
  for (const edge of [top, bottom, left, right]) {
    for (const prop of ['left', 'top', 'width', 'height']) {
      assert.doesNotMatch(String(edge.style[prop]), /%|calc\(/, `${prop} must be a real px value, not %/calc`);
    }
  }
  assert.equal(top.style.left, '100px');
  assert.equal(top.style.top, `${200 - 3}px`); // HIT_PAD=3
  assert.equal(top.style.width, '300px');
  assert.equal(left.style.left, `${100 - 3}px`);
  assert.equal(left.style.top, '200px');
  assert.equal(left.style.height, '40px');
  assert.equal(right.style.left, `${100 + 300 - 3}px`, 'right edge sits at rect.left+rect.width, not the box border');
  assert.equal(bottom.style.top, `${200 + 40 - 3}px`, 'bottom edge sits at rect.top+rect.height, not the box border');
});

test('paintHairlineFrame: gradient stroke width follows thinStrokeWidth(zoom), never the hit-box size', () => {
  const P = loadInVm();
  const layer = makeFakeLayer();
  P.paintHairlineFrame(layer, RECT, '#0066CC', 4, 'sel');
  const top = layer.querySelector('rf-hairline-edge-sel-top');
  assert.match(top.style.background, /center \/ 100% 0\.125px no-repeat/);
});

test('paintHairlineFrame: repeated calls with the same key update in place (no accumulation)', () => {
  const P = loadInVm();
  const layer = makeFakeLayer();
  P.paintHairlineFrame(layer, RECT, '#F08000', 1, 'hover');
  P.paintHairlineFrame(layer, { ...RECT, left: 999 }, '#F08000', 4, 'hover');
  assert.equal(layer.children.length, 4, 'still exactly 4 edges after a second call with the same key');
  const top = layer.querySelector('rf-hairline-edge-hover-top');
  assert.equal(top.style.left, '999px', 'second call updates the existing edge in place');
});

test('paintHairlineFrame: different keys never collide (selection + hover + multi-item coexist)', () => {
  const P = loadInVm();
  const layer = makeFakeLayer();
  P.paintHairlineFrame(layer, RECT, '#0066CC', 1, 'sel');
  P.paintHairlineFrame(layer, RECT, '#F08000', 1, 'hover');
  P.paintHairlineFrame(layer, RECT, '#000', 1, 'multi-0');
  assert.equal(layer.children.length, 12, '4 edges each for sel, hover, multi-0');
});

test('clearHairlineFrame: removes all 4 edges for that key, no-ops otherwise', () => {
  const P = loadInVm();
  const layer = makeFakeLayer();
  P.paintHairlineFrame(layer, RECT, '#0066CC', 1, 'sel');
  assert.equal(layer.children.length, 4);
  layer.children.forEach((c) => { c.remove = () => { layer.children.splice(layer.children.indexOf(c), 1); }; });
  P.clearHairlineFrame(layer, 'sel');
  assert.equal(layer.children.length, 0);
  assert.doesNotThrow(() => P.clearHairlineFrame(layer, 'sel')); // already gone -> no-op, no throw
  assert.doesNotThrow(() => P.clearHairlineFrame(null, 'sel')); // no layer -> no-op, no throw
});
