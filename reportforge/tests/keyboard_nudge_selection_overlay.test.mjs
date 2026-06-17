import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function loadKeyboardEngineRuntime() {
  const listeners = [];

  const element = { id: 'el-1', x: 10, y: 20, w: 30, h: 12 };
  const calls = [];

  const context = {
    console,
    KeyboardRegistry: undefined,
    DS: {
      selection: new Set(['el-1']),
      elements: [element],
      getElementById(id) {
        return this.elements.find((item) => item.id === id) || null;
      },
      saveHistory() {
        calls.push({ event: 'DS.saveHistory', x: element.x, y: element.y });
      },
    },
    ElementLayoutEngine: {
      moveElement(el, dx, dy) {
        calls.push({ event: 'ElementLayoutEngine.moveElement', dx, dy, before: { x: el.x, y: el.y } });
        el.x += dx;
        el.y += dy;
        calls.push({ event: 'ElementLayoutEngine.moveElement.after', after: { x: el.x, y: el.y } });
      },
    },
    SelectionEngine: {
      renderHandles() {
        calls.push({ event: 'SelectionEngine.renderHandles', x: element.x, y: element.y });
      },
    },
    RenderScheduler: {
      flushSync(fn, source) {
        calls.push({ event: 'RenderScheduler.flushSync', source, x: element.x, y: element.y });
        fn();
      },
    },
    HistoryEngine: {
      push(label) {
        calls.push({ event: 'HistoryEngine.push', label, x: element.x, y: element.y });
      },
    },
    document: {
      activeElement: null,
      addEventListener(type, fn) {
        listeners.push({ type, fn });
      },
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
    listeners,
    element,
    calls,
  };
}

test('KeyboardEngine arrow nudge refreshes selection overlay after moving element', () => {
  const runtime = loadKeyboardEngineRuntime();

  runtime.engine.init();

  const keydown = runtime.listeners.find((item) => item.type === 'keydown');
  assert.ok(keydown, 'KeyboardEngine should register keydown listener');

  let prevented = false;
  keydown.fn({
    key: 'ArrowRight',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    preventDefault() {
      prevented = true;
    },
  });

  assert.equal(prevented, true);
  assert.equal(runtime.element.x, 11);
  assert.equal(runtime.element.y, 20);

  const events = runtime.calls.map((call) => call.event);
  assert.deepEqual(events, [
    'HistoryEngine.push',
    'ElementLayoutEngine.moveElement',
    'ElementLayoutEngine.moveElement.after',
    'RenderScheduler.flushSync',
    'SelectionEngine.renderHandles',
    'DS.saveHistory',
  ]);

  const render = runtime.calls.find((call) => call.event === 'SelectionEngine.renderHandles');
  assert.deepEqual(
    { x: render.x, y: render.y },
    { x: 11, y: 20 },
    'selection handles must render with post-nudge coordinates',
  );

  const flush = runtime.calls.find((call) => call.event === 'RenderScheduler.flushSync');
  assert.equal(flush.source, 'KeyboardEngine.nudge.renderHandles');
});
