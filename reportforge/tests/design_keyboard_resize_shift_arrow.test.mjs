// RF-CR-KEYBOARD-RESIZE-1 — Crystal Reports parity: Shift+Arrow resizes the
// selected element(s) instead of RF's earlier "nudge by 10 units" (which
// contradicted CR's own contract and is deliberately retired — see
// engines/KeyboardEngine.js's _resizeSelected). Right/Down grow, Left/Up
// shrink; x/y must never change (growth/shrink anchors at the top-left
// corner); step is exactly 1 model unit per keydown, never multiplied by
// zoom, never grid-snapped (grid-snap was proven live to drift x/y itself —
// see KeyboardEngine.js's comment on why this reuses a targeted clamp
// instead of SelectionInteractionMotion's own snap-based one).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function loadKeyboardEngineRuntime({ elements, selection, previewMode = false, sectionHeight = 200, pageWidth = 754 } = {}) {
  const listeners = [];
  const calls = [];
  const els = elements || [{ id: 'el-1', x: 10, y: 20, w: 30, h: 12, sectionId: 's1' }];

  const context = {
    console,
    CFG: { MIN_EL_W: 8, MIN_EL_H: 6, PAGE_W: pageWidth },
    DS: {
      selection: new Set(selection || ['el-1']),
      previewMode,
      elements: els,
      getElementById(id) { return this.elements.find((item) => item.id === id) || null; },
      getSection() { return { height: sectionHeight }; },
      updateElementLayout(id, patch, source) {
        calls.push({ event: 'DS.updateElementLayout', id, patch, source });
        const el = this.getElementById(id);
        Object.assign(el, patch);
      },
      saveHistory() { calls.push({ event: 'DS.saveHistory' }); },
    },
    _canonicalCanvasWriter() {
      return {
        updateElementPosition(id) { calls.push({ event: 'CanvasWriter.updateElementPosition', id }); },
      };
    },
    SelectionEngine: {
      renderHandles() { calls.push({ event: 'SelectionEngine.renderHandles' }); },
    },
    RenderScheduler: {
      flushSync(fn, source) { calls.push({ event: 'RenderScheduler.flushSync', source }); fn(); },
    },
    PropertiesEngine: {
      updatePositionFields(el) { calls.push({ event: 'PropertiesEngine.updatePositionFields', w: el.w, h: el.h }); },
    },
    document: {
      activeElement: null,
      getElementById(id) { return id === 'sb-size' ? { style: {}, textContent: '' } : null; },
      addEventListener(type, fn) { listeners.push({ type, fn }); },
    },
    module: { exports: {} },
    exports: {},
  };

  context.globalThis = context;
  vm.createContext(context);

  const source = fs.readFileSync('engines/KeyboardEngine.js', 'utf8');
  vm.runInContext(`${source}\nglobalThis.__KeyboardEngine = KeyboardEngine;`, context, {
    filename: 'engines/KeyboardEngine.js',
  });

  return {
    engine: context.__KeyboardEngine,
    document: context.document,
    listeners,
    calls,
    els,
    fireKeydown(key, { shiftKey = false } = {}) {
      const keydown = listeners.find((item) => item.type === 'keydown');
      let prevented = false;
      keydown.fn({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey, preventDefault() { prevented = true; } });
      return prevented;
    },
    releaseArrowKey(key) {
      const keyup = listeners.find((item) => item.type === 'keyup');
      if (keyup) keyup.fn({ key });
    },
  };
}

test('Shift+ArrowRight grows width by 1, x/y unchanged', () => {
  const runtime = loadKeyboardEngineRuntime({ elements: [{ id: 'el-1', x: 10, y: 20, w: 30, h: 12, sectionId: 's1' }] });
  runtime.engine.init();
  const prevented = runtime.fireKeydown('ArrowRight', { shiftKey: true });
  assert.equal(prevented, true, 'RF must consume the shortcut');
  const el = runtime.els[0];
  assert.deepEqual({ x: el.x, y: el.y, w: el.w, h: el.h }, { x: 10, y: 20, w: 31, h: 12 });
});

test('Shift+ArrowLeft shrinks width by 1, x/y unchanged', () => {
  const runtime = loadKeyboardEngineRuntime({ elements: [{ id: 'el-1', x: 10, y: 20, w: 30, h: 12, sectionId: 's1' }] });
  runtime.engine.init();
  runtime.fireKeydown('ArrowLeft', { shiftKey: true });
  const el = runtime.els[0];
  assert.deepEqual({ x: el.x, y: el.y, w: el.w, h: el.h }, { x: 10, y: 20, w: 29, h: 12 });
});

test('Shift+ArrowDown grows height by 1, x/y unchanged', () => {
  const runtime = loadKeyboardEngineRuntime({ elements: [{ id: 'el-1', x: 10, y: 20, w: 30, h: 12, sectionId: 's1' }] });
  runtime.engine.init();
  runtime.fireKeydown('ArrowDown', { shiftKey: true });
  const el = runtime.els[0];
  assert.deepEqual({ x: el.x, y: el.y, w: el.w, h: el.h }, { x: 10, y: 20, w: 30, h: 13 });
});

test('Shift+ArrowUp shrinks height by 1, x/y unchanged', () => {
  const runtime = loadKeyboardEngineRuntime({ elements: [{ id: 'el-1', x: 10, y: 20, w: 30, h: 12, sectionId: 's1' }] });
  runtime.engine.init();
  runtime.fireKeydown('ArrowUp', { shiftKey: true });
  const el = runtime.els[0];
  assert.deepEqual({ x: el.x, y: el.y, w: el.w, h: el.h }, { x: 10, y: 20, w: 30, h: 11 });
});

test('width respects MIN_EL_W floor (8) — never goes below it', () => {
  const runtime = loadKeyboardEngineRuntime({ elements: [{ id: 'el-1', x: 10, y: 20, w: 8, h: 12, sectionId: 's1' }] });
  runtime.engine.init();
  runtime.fireKeydown('ArrowLeft', { shiftKey: true });
  assert.equal(runtime.els[0].w, 8, 'already at the floor — must not go to 7');
});

test('height respects MIN_EL_H floor (6) — never goes below it', () => {
  const runtime = loadKeyboardEngineRuntime({ elements: [{ id: 'el-1', x: 10, y: 20, w: 30, h: 6, sectionId: 's1' }] });
  runtime.engine.init();
  runtime.fireKeydown('ArrowUp', { shiftKey: true });
  assert.equal(runtime.els[0].h, 6, 'already at the floor — must not go to 5');
});

test('width respects the page-width ceiling', () => {
  const runtime = loadKeyboardEngineRuntime({
    elements: [{ id: 'el-1', x: 10, y: 20, w: 754, h: 12, sectionId: 's1' }],
    pageWidth: 754,
  });
  runtime.engine.init();
  runtime.fireKeydown('ArrowRight', { shiftKey: true });
  assert.equal(runtime.els[0].w, 754, 'already at the page-width ceiling — must not exceed it');
});

test('height respects the section-height ceiling', () => {
  const runtime = loadKeyboardEngineRuntime({
    elements: [{ id: 'el-1', x: 10, y: 20, w: 30, h: 200, sectionId: 's1' }],
    sectionHeight: 200,
  });
  runtime.engine.init();
  runtime.fireKeydown('ArrowDown', { shiftKey: true });
  assert.equal(runtime.els[0].h, 200, 'already at the section-height ceiling — must not exceed it');
});

test('multi-selection: Shift+ArrowRight grows width for every selected element', () => {
  const runtime = loadKeyboardEngineRuntime({
    elements: [
      { id: 'el-1', x: 10, y: 20, w: 30, h: 12, sectionId: 's1' },
      { id: 'el-2', x: 50, y: 60, w: 100, h: 20, sectionId: 's1' },
    ],
    selection: ['el-1', 'el-2'],
  });
  runtime.engine.init();
  runtime.fireKeydown('ArrowRight', { shiftKey: true });
  assert.equal(runtime.els[0].w, 31);
  assert.equal(runtime.els[1].w, 101);
  assert.equal(runtime.els[0].x, 10, 'el-1 x unchanged');
  assert.equal(runtime.els[1].x, 50, 'el-2 x unchanged');
});

for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) {
  test(`document.activeElement is ${tag}: Shift+ArrowRight does not resize or preventDefault`, () => {
    const runtime = loadKeyboardEngineRuntime({ elements: [{ id: 'el-1', x: 10, y: 20, w: 30, h: 12, sectionId: 's1' }] });
    runtime.engine.init();
    runtime.document.activeElement = { tagName: tag };
    const before = runtime.els[0].w;
    const prevented = runtime.fireKeydown('ArrowRight', { shiftKey: true });
    assert.equal(runtime.els[0].w, before, `${tag} focused — RF must not intercept the arrow key`);
    assert.equal(prevented, false, `${tag} focused — native key behavior (caret move) must not be blocked`);
  });
}

test('document.activeElement is contentEditable: Shift+ArrowRight does not resize', () => {
  const runtime = loadKeyboardEngineRuntime({ elements: [{ id: 'el-1', x: 10, y: 20, w: 30, h: 12, sectionId: 's1' }] });
  runtime.engine.init();
  runtime.document.activeElement = { tagName: 'DIV', isContentEditable: true };
  const before = runtime.els[0].w;
  const prevented = runtime.fireKeydown('ArrowRight', { shiftKey: true });
  assert.equal(runtime.els[0].w, before, 'contentEditable focused — RF must not intercept the arrow key');
  assert.equal(prevented, false);
});

test('no active input: Shift+ArrowRight DOES resize (sanity check the guard is scoped correctly)', () => {
  const runtime = loadKeyboardEngineRuntime({ elements: [{ id: 'el-1', x: 10, y: 20, w: 30, h: 12, sectionId: 's1' }] });
  runtime.engine.init();
  const before = runtime.els[0].w;
  const prevented = runtime.fireKeydown('ArrowRight', { shiftKey: true });
  assert.equal(runtime.els[0].w, before + 1);
  assert.equal(prevented, true);
});

test('preview mode: Shift+Arrow must not resize (design-only)', () => {
  const runtime = loadKeyboardEngineRuntime({ elements: [{ id: 'el-1', x: 10, y: 20, w: 30, h: 12, sectionId: 's1' }], previewMode: true });
  runtime.engine.init();
  const before = runtime.els[0].w;
  runtime.fireKeydown('ArrowRight', { shiftKey: true });
  assert.equal(runtime.els[0].w, before, 'Preview must never edit the model via this shortcut');
});

test('overlay/properties refresh: renderHandles and PropertiesEngine.updatePositionFields both fire', () => {
  const runtime = loadKeyboardEngineRuntime({ elements: [{ id: 'el-1', x: 10, y: 20, w: 30, h: 12, sectionId: 's1' }] });
  runtime.engine.init();
  runtime.fireKeydown('ArrowRight', { shiftKey: true });
  const events = runtime.calls.map((c) => c.event);
  assert.ok(events.includes('SelectionEngine.renderHandles'), 'overlay/guides refresh via renderHandles');
  assert.ok(events.includes('PropertiesEngine.updatePositionFields'), 'properties panel must show the new w/h');
  const propsCall = runtime.calls.find((c) => c.event === 'PropertiesEngine.updatePositionFields');
  assert.equal(propsCall.w, 31);
});

test('canonical write path: DS.updateElementLayout is called with source "KeyboardEngine.resize" and only the resized dimension', () => {
  const runtime = loadKeyboardEngineRuntime({ elements: [{ id: 'el-1', x: 10, y: 20, w: 30, h: 12, sectionId: 's1' }] });
  runtime.engine.init();
  runtime.fireKeydown('ArrowRight', { shiftKey: true });
  const call = runtime.calls.find((c) => c.event === 'DS.updateElementLayout');
  assert.ok(call, 'DS.updateElementLayout must be the write path (same one CommandRuntimeSelection.sameWidth/sameHeight use)');
  assert.equal(call.source, 'KeyboardEngine.resize');
  // Not assert.deepEqual(call.patch, {w:31}) — call.patch is an object
  // created inside the vm context (a different realm), which Node's assert
  // flags as "not reference-equal" despite identical structure. Comparing
  // via JSON avoids that cross-realm artifact.
  assert.equal(JSON.stringify(call.patch), JSON.stringify({ w: 31 }), 'only w in the patch — h/x/y untouched for a width-only key');
});

test('history: coalesced DS.saveHistory fires once on keyup, not synchronously on keydown', () => {
  const runtime = loadKeyboardEngineRuntime({ elements: [{ id: 'el-1', x: 10, y: 20, w: 30, h: 12, sectionId: 's1' }] });
  runtime.engine.init();
  runtime.fireKeydown('ArrowRight', { shiftKey: true });
  assert.equal(runtime.calls.some((c) => c.event === 'DS.saveHistory'), false, 'must not fire synchronously on keydown');
  runtime.releaseArrowKey('ArrowRight');
  assert.equal(runtime.calls.at(-1).event, 'DS.saveHistory', 'keyup must flush the coalesced commit exactly once');
});

test('plain (no-shift) arrow keys still nudge x/y by 1 — unrelated to the resize contract', () => {
  const runtime = loadKeyboardEngineRuntime({ elements: [{ id: 'el-1', x: 10, y: 20, w: 30, h: 12, sectionId: 's1' }] });
  runtime.engine.init();
  runtime.fireKeydown('ArrowRight', { shiftKey: false });
  const el = runtime.els[0];
  assert.deepEqual({ x: el.x, y: el.y, w: el.w, h: el.h }, { x: 11, y: 20, w: 30, h: 12 });
});
