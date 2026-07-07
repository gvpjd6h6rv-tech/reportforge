// RF-CR-GUIDE-EXTENT-1 / RF-CR-RULER-HIGHLIGHT-1 — Crystal's selection
// guides run the full visible workspace (not just the selected element's
// own bbox), and the top/left rulers shade orange across the selection's
// width/height. One shared implementation in SelectionOverlayPreviewLayers.js
// for both Design and Preview — #workspace and #ruler-h-row/#ruler-v are the
// SAME elements regardless of DS.previewMode.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function makeRectEl(rect, { display = 'block' } = {}) {
  const children = [];
  const el = {
    style: { display },
    className: '',
    dataset: {},
    children,
    getBoundingClientRect: () => ({ ...rect }),
    appendChild(child) { children.push(child); return child; },
    querySelector(sel) {
      const cls = sel.replace(':scope > .', '').replace('.', '');
      return children.find((c) => String(c.className).split(' ').includes(cls)) || null;
    },
    remove() {},
  };
  return el;
}

// For elements created via document.createElement() — no rect is known
// upfront, so getBoundingClientRect derives from whatever left/top/width/
// height this mock's own code later assigns as plain px strings (same
// trick used in selection_overlay_guides_hairline.test.mjs's makeNode).
function makeDynamicEl() {
  const children = [];
  const node = {
    style: {},
    className: '',
    dataset: {},
    children,
    appendChild(child) { children.push(child); return child; },
    querySelector(sel) {
      const cls = sel.replace(':scope > .', '').replace('.', '');
      return children.find((c) => String(c.className).split(' ').includes(cls)) || null;
    },
    remove() {},
    getBoundingClientRect() {
      const num = (v) => Number.parseFloat(v) || 0;
      const left = num(node.style.left);
      const top = num(node.style.top);
      const width = num(node.style.width);
      const height = num(node.style.height);
      return { left, top, width, height, right: left + width, bottom: top + height };
    },
  };
  return node;
}

function loadRuntime({ workspaceRect, scrollbarV, scrollbarH, zoom = 1, rulerHCanvasRect }) {
  const registry = new Map();
  const ws = makeRectEl(workspaceRect);
  registry.set('workspace', ws);

  const rulerHRow = makeRectEl({ left: 20, top: 0, right: 620, bottom: 22, width: 600, height: 22 });
  registry.set('ruler-h-row', rulerHRow);
  const rulerV = makeRectEl({ left: 0, top: 22, right: 20, bottom: 622, width: 20, height: 600 });
  registry.set('ruler-v', rulerV);
  if (rulerHCanvasRect) registry.set('ruler-h-canvas', makeRectEl(rulerHCanvasRect));

  const scrollbarTrackV = scrollbarV
    ? makeRectEl(scrollbarV.rect, { display: scrollbarV.visible ? 'block' : 'none' })
    : null;
  const scrollbarTrackH = scrollbarH
    ? makeRectEl(scrollbarH.rect, { display: scrollbarH.visible ? 'block' : 'none' })
    : null;

  const context = {
    console,
    getComputedStyle: (el) => el.style,
    document: {
      getElementById: (id) => registry.get(id) || null,
      querySelector: (sel) => {
        if (sel === '.rf-scrollbar-track--v') return scrollbarTrackV;
        if (sel === '.rf-scrollbar-track--h') return scrollbarTrackH;
        const m = sel.match(/^#([\w-]+) > (.+)$/);
        if (m) { const host = registry.get(m[1]); return host ? host.querySelector(m[2]) : null; }
        return null;
      },
      // clearRulerGuideStubs scans across all possible hosts (ruler-v /
      // ruler-h-row) for the shared stub class, mirroring the real DOM's
      // document.querySelectorAll (not scoped to one host).
      querySelectorAll: (sel) => {
        const cls = sel.replace('.', '');
        const all = [];
        for (const host of registry.values()) {
          if (!host.children) continue;
          all.push(...host.children.filter((c) => String(c.className).split(' ').includes(cls)));
        }
        return all;
      },
      createElement: () => makeDynamicEl(),
    },
    SelectionOverlayPreview: { selectionOverlayZoom: () => zoom },
    PreviewOverlayStyle: { thinStrokeWidth: (z) => Math.max(0.125, 0.5 / (Number(z) > 0 ? Number(z) : 1)) },
  };
  context.globalThis = context;
  context.window = context;
  vm.createContext(context);
  const src = fs.readFileSync(path.resolve(ROOT, 'engines/SelectionOverlayPreviewLayers.js'), 'utf8');
  vm.runInContext(src, context, { filename: 'engines/SelectionOverlayPreviewLayers.js' });
  return { L: context.SelectionOverlayPreviewLayers, registry };
}

// ---------- guide extent to workspace bounds ----------

test('renderSelectionGuides: guides span #workspace bounds, not layer 100%', () => {
  const { L } = loadRuntime({
    workspaceRect: { left: 100, top: 50, right: 900, bottom: 700, width: 800, height: 650 },
  });
  const layer = makeRectEl({ left: 0, top: 0, right: 1000, bottom: 1000, width: 1000, height: 1000 });
  L.renderSelectionGuides(layer, [{ left: 300, top: 200, width: 150, height: 40 }]);

  const guides = layer.children.filter((c) => String(c.className).includes('selection-guide'));
  assert.equal(guides.length, 4);
  const h = guides.filter((c) => c.className.includes('-h'));
  const v = guides.filter((c) => c.className.includes('-v'));
  for (const g of h) {
    assert.equal(g.style.left, '100px', 'horizontal guide starts at workspace left, not 0');
    assert.equal(g.style.width, '800px', 'horizontal guide spans workspace width, not 100%');
  }
  for (const g of v) {
    assert.equal(g.style.top, '50px', 'vertical guide starts at workspace top, not 0');
    assert.equal(g.style.height, '650px', 'vertical guide spans workspace height, not 100%');
  }
});

test('renderSelectionGuides: subtracts visible scrollbar reserve from the right/bottom bound', () => {
  const { L } = loadRuntime({
    workspaceRect: { left: 100, top: 50, right: 900, bottom: 700, width: 800, height: 650 },
    scrollbarV: { visible: true, rect: { left: 883, top: 50, right: 900, bottom: 683, width: 17, height: 633 } },
    scrollbarH: { visible: true, rect: { left: 100, top: 683, right: 883, bottom: 700, width: 783, height: 17 } },
  });
  const layer = makeRectEl({ left: 0, top: 0, right: 1000, bottom: 1000, width: 1000, height: 1000 });
  L.renderSelectionGuides(layer, [{ left: 300, top: 200, width: 150, height: 40 }]);

  const guides = layer.children.filter((c) => String(c.className).includes('selection-guide'));
  const h = guides.filter((c) => c.className.includes('-h'));
  const v = guides.filter((c) => c.className.includes('-v'));
  for (const g of h) assert.equal(g.style.width, '783px', '800 - 17px vertical scrollbar reserve');
  for (const g of v) assert.equal(g.style.height, '633px', '650 - 17px horizontal scrollbar reserve');
});

test('renderSelectionGuides: hidden scrollbar track reserves nothing', () => {
  const { L } = loadRuntime({
    workspaceRect: { left: 0, top: 0, right: 500, bottom: 500, width: 500, height: 500 },
    scrollbarV: { visible: false, rect: { left: 483, top: 0, right: 500, bottom: 500, width: 17, height: 500 } },
  });
  const layer = makeRectEl({ left: 0, top: 0, right: 500, bottom: 500, width: 500, height: 500 });
  L.renderSelectionGuides(layer, [{ left: 10, top: 10, width: 10, height: 10 }]);
  const h = layer.children.find((c) => c.className.includes('-h'));
  assert.equal(h.style.width, '500px', 'not reserved when the track is display:none');
});

test('renderSelectionGuides: falls back to 100% when #workspace is not resolvable', () => {
  const context = {
    console,
    getComputedStyle: (el) => el.style,
    document: { getElementById: () => null, querySelector: () => null, createElement: () => makeRectEl({}) },
    SelectionOverlayPreview: { selectionOverlayZoom: () => 1 },
    PreviewOverlayStyle: { thinStrokeWidth: () => 0.5 },
  };
  context.globalThis = context;
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.resolve(ROOT, 'engines/SelectionOverlayPreviewLayers.js'), 'utf8'), context);
  const layer = makeRectEl({ left: 0, top: 0, right: 1000, bottom: 1000, width: 1000, height: 1000 });
  context.SelectionOverlayPreviewLayers.renderSelectionGuides(layer, [{ left: 10, top: 10, width: 10, height: 10 }]);
  const h = layer.children.find((c) => c.className.includes('-h'));
  assert.equal(h.style.width, '100%', 'safe fallback, never a broken 0-size guide');
});

// ---------- ruler highlight ----------

test('paintRulerHighlight: aligns highlight to the box screen rect on both rulers', () => {
  const { L, registry } = loadRuntime({
    workspaceRect: { left: 20, top: 22, right: 620, bottom: 622, width: 600, height: 600 },
  });
  L.paintRulerHighlight({ left: 120, top: 200, right: 270, bottom: 240, width: 150, height: 40 });

  const rulerHRow = registry.get('ruler-h-row');
  const rulerV = registry.get('ruler-v');
  const hHighlight = rulerHRow.children.find((c) => c.className.includes('rf-ruler-highlight-h'));
  const vHighlight = rulerV.children.find((c) => c.className.includes('rf-ruler-highlight-v'));

  assert.ok(hHighlight, 'top ruler highlight created');
  assert.equal(hHighlight.style.left, `${120 - rulerHRow.getBoundingClientRect().left}px`);
  assert.equal(hHighlight.style.width, '150px');

  assert.ok(vHighlight, 'left ruler highlight created');
  assert.equal(vHighlight.style.top, `${200 - rulerV.getBoundingClientRect().top}px`);
  assert.equal(vHighlight.style.height, '40px');
});

test('paintRulerHighlight: repeated calls update in place (no accumulation)', () => {
  const { L, registry } = loadRuntime({ workspaceRect: { left: 0, top: 0, right: 500, bottom: 500, width: 500, height: 500 } });
  L.paintRulerHighlight({ left: 10, top: 10, right: 60, bottom: 30, width: 50, height: 20 });
  L.paintRulerHighlight({ left: 40, top: 10, right: 90, bottom: 30, width: 50, height: 20 });
  const rulerHRow = registry.get('ruler-h-row');
  const highlights = rulerHRow.children.filter((c) => c.className.includes('rf-ruler-highlight-h'));
  assert.equal(highlights.length, 1, 'still exactly one highlight after a second call');
});

test('clearRulerHighlight: removes both ruler highlights, no-ops if absent', () => {
  const { L, registry } = loadRuntime({ workspaceRect: { left: 0, top: 0, right: 500, bottom: 500, width: 500, height: 500 } });
  L.paintRulerHighlight({ left: 10, top: 10, right: 60, bottom: 30, width: 50, height: 20 });
  const rulerHRow = registry.get('ruler-h-row');
  const rulerV = registry.get('ruler-v');
  let removed = { h: false, v: false };
  rulerHRow.children.forEach((c) => { c.remove = () => { removed.h = true; rulerHRow.children.splice(rulerHRow.children.indexOf(c), 1); }; });
  rulerV.children.forEach((c) => { c.remove = () => { removed.v = true; rulerV.children.splice(rulerV.children.indexOf(c), 1); }; });
  L.clearRulerHighlight();
  assert.ok(removed.h, 'top ruler highlight removed');
  assert.doesNotThrow(() => L.clearRulerHighlight());
});

// ---------- ruler-crossing guide stubs (RF-CR-GUIDE-RULER-CROSS-1) ----------
// A guide element lives inside #workspace's own clipped subtree, so it can
// never visually cross INTO a ruler (a sibling entirely outside #workspace).
// Left ('h' guides) and top ('v' guides) ends get a separate stub painted
// directly on the ruler host instead; right/bottom need none — #workspace's
// own edge there is already the correct visible boundary.

test('renderSelectionGuides: paints a ruler-v stub for EACH horizontal guide (top-of-box and bottom-of-box)', () => {
  const { L, registry } = loadRuntime({
    workspaceRect: { left: 100, top: 50, right: 900, bottom: 700, width: 800, height: 650 },
  });
  const layer = makeRectEl({ left: 0, top: 0, right: 1000, bottom: 1000, width: 1000, height: 1000 });
  L.renderSelectionGuides(layer, [{ left: 300, top: 200, width: 150, height: 40 }]);

  const rulerV = registry.get('ruler-v');
  const stubs = rulerV.children.filter((c) => c.className.includes('rf-ruler-guide-stub'));
  assert.equal(stubs.length, 2, 'one stub for the top-of-box guide, one for the bottom-of-box guide');
});

test('renderSelectionGuides: paints a ruler-h-row stub for EACH vertical guide (left-of-box and right-of-box)', () => {
  const { L, registry } = loadRuntime({
    workspaceRect: { left: 100, top: 50, right: 900, bottom: 700, width: 800, height: 650 },
  });
  const layer = makeRectEl({ left: 0, top: 0, right: 1000, bottom: 1000, width: 1000, height: 1000 });
  L.renderSelectionGuides(layer, [{ left: 300, top: 200, width: 150, height: 40 }]);

  const rulerHRow = registry.get('ruler-h-row');
  const stubs = rulerHRow.children.filter((c) => c.className.includes('rf-ruler-guide-stub'));
  assert.equal(stubs.length, 2, 'one stub for the left-of-box guide, one for the right-of-box guide');
});

test('renderSelectionGuides: multi-selection rects each get their own uniquely-keyed stubs (no collision)', () => {
  const { L, registry } = loadRuntime({
    workspaceRect: { left: 0, top: 0, right: 1000, bottom: 1000, width: 1000, height: 1000 },
  });
  const layer = makeRectEl({ left: 0, top: 0, right: 1000, bottom: 1000, width: 1000, height: 1000 });
  L.renderSelectionGuides(layer, [
    { left: 100, top: 100, width: 50, height: 20 },
    { left: 300, top: 300, width: 50, height: 20 },
  ]);
  const rulerV = registry.get('ruler-v');
  const rulerHRow = registry.get('ruler-h-row');
  assert.equal(rulerV.children.filter((c) => c.className.includes('rf-ruler-guide-stub')).length, 4, '2 rects x 2 horizontal guides each');
  assert.equal(rulerHRow.children.filter((c) => c.className.includes('rf-ruler-guide-stub')).length, 4, '2 rects x 2 vertical guides each');
});

test('clearRulerGuideStubs: removes stubs from both ruler hosts', () => {
  const { L, registry } = loadRuntime({
    workspaceRect: { left: 0, top: 0, right: 1000, bottom: 1000, width: 1000, height: 1000 },
  });
  const layer = makeRectEl({ left: 0, top: 0, right: 1000, bottom: 1000, width: 1000, height: 1000 });
  L.renderSelectionGuides(layer, [{ left: 100, top: 100, width: 50, height: 20 }]);
  const rulerV = registry.get('ruler-v');
  const rulerHRow = registry.get('ruler-h-row');
  [...rulerV.children, ...rulerHRow.children].forEach((c) => {
    const host = rulerV.children.includes(c) ? rulerV : rulerHRow;
    c.remove = () => { host.children.splice(host.children.indexOf(c), 1); };
  });
  L.clearRulerGuideStubs();
  assert.equal(rulerV.children.filter((c) => c.className.includes('rf-ruler-guide-stub')).length, 0);
  assert.equal(rulerHRow.children.filter((c) => c.className.includes('rf-ruler-guide-stub')).length, 0);
  assert.doesNotThrow(() => L.clearRulerGuideStubs());
});

// ---------- top ruler highlight clamp (corner exclusion) ----------

test('paintRulerHighlight: clamps the top highlight to #ruler-h-canvas, excluding #ruler-corner', () => {
  const { L, registry } = loadRuntime({
    workspaceRect: { left: 20, top: 22, right: 620, bottom: 622, width: 600, height: 600 },
    rulerHCanvasRect: { left: 20, top: 0, right: 620, bottom: 22, width: 600, height: 22 },
  });
  // box extends to the LEFT of ruler-h-canvas's own start (simulating a
  // selection whose screen rect would otherwise spill into the corner square)
  L.paintRulerHighlight({ left: 5, top: 200, right: 100, bottom: 240, width: 95, height: 40 });
  const rulerHRow = registry.get('ruler-h-row');
  const hHighlight = rulerHRow.children.find((c) => c.className.includes('rf-ruler-highlight-h'));
  const rulerHRowRect = rulerHRow.getBoundingClientRect();
  assert.equal(hHighlight.style.left, `${20 - rulerHRowRect.left}px`, 'clamped to ruler-h-canvas left, not the box left');
  assert.equal(hHighlight.style.width, '80px', 'clamped width: canvas.right(620) capped, box.right(100) - canvas.left(20)');
});

test('paintRulerHighlight: unaffected when the box is fully within #ruler-h-canvas bounds', () => {
  const { L, registry } = loadRuntime({
    workspaceRect: { left: 20, top: 22, right: 620, bottom: 622, width: 600, height: 600 },
    rulerHCanvasRect: { left: 20, top: 0, right: 620, bottom: 22, width: 600, height: 22 },
  });
  L.paintRulerHighlight({ left: 120, top: 200, right: 270, bottom: 240, width: 150, height: 40 });
  const rulerHRow = registry.get('ruler-h-row');
  const hHighlight = rulerHRow.children.find((c) => c.className.includes('rf-ruler-highlight-h'));
  assert.equal(hHighlight.style.width, '150px', 'no clamping needed, box already inside canvas bounds');
});
