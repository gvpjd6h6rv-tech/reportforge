/**
 * Contract test: Preview hit routing — target resolution
 *
 * Verifies that when clicking on a .pv-el in preview mode, the routing
 * layer resolves the selectedId from the DOM element under the cursor
 * (data-origin-id), NOT from the model-based HitTestEngine (which may
 * return a container like rh-fiscal-box instead of the specific child
 * rh-company-matriz).
 *
 * This test MUST be RED before the routing fix and GREEN after.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'engines', 'EngineCoreRoutingPointer.js'), 'utf8');

function buildContext() {
  // ── Minimal DOM mock ──────────────────────────────────────────────
  const elements = new Map();

  function createElement(tag, attrs = {}, dataset = {}) {
    const children = [];
    const style = {};
    const classSet = new Set((attrs.className || '').split(/\s+/).filter(Boolean));
    const el = {
      tagName: tag.toUpperCase(),
      className: attrs.className || '',
      dataset: { ...dataset },
      style,
      children,
      parentElement: null,
      appendChild(c) { children.push(c); c.parentElement = el; },
      querySelector(sel) { return queryAll(el, sel)[0] || null; },
      querySelectorAll(sel) { return queryAll(el, sel); },
      closest(sel) { return closestUp(el, sel); },
      matches(sel) { return matchesSel(el, sel); },
      classList: {
        add(c) { classSet.add(c); el.className = [...classSet].join(' '); },
        remove(c) { classSet.delete(c); el.className = [...classSet].join(' '); },
        contains(c) { return classSet.has(c); },
        toggle(c, force) {
          if (force === undefined) force = !classSet.has(c);
          force ? classSet.add(c) : classSet.delete(c);
          el.className = [...classSet].join(' ');
        },
      },
      getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 50, right: 100, bottom: 50 }; },
      setPointerCapture() {},
      getAttribute(name) {
        if (name === 'class') return el.className;
        if (name === 'id') return attrs.id || null;
        return null;
      },
    };
    if (attrs.id) elements.set(attrs.id, el);
    return el;
  }

  function matchesSel(el, sel) {
    // Minimal selector matcher: .class, #id, [data-x="v"], tag, combos
    return sel.split(',').some(s => matchesSingle(el, s.trim()));
  }

  function matchesSingle(el, sel) {
    const parts = sel.match(/([.#]?[\w-]+|\[[\w-]+(?:="[^"]*")?\])/g) || [];
    return parts.every(p => {
      if (p.startsWith('.')) return el.className.split(/\s+/).includes(p.slice(1));
      if (p.startsWith('#')) return (el.dataset?.id === p.slice(1) || el.getAttribute?.('id') === p.slice(1));
      if (p.startsWith('[')) {
        const m = p.match(/\[([\w-]+)(?:="([^"]*)")?\]/);
        if (!m) return false;
        const [, attr, val] = m;
        if (attr.startsWith('data-')) {
          const key = attr.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
          if (val !== undefined) return el.dataset?.[key] === val;
          return el.dataset?.[key] !== undefined;
        }
        return false;
      }
      return el.tagName === p.toUpperCase();
    });
  }

  function closestUp(el, sel) {
    let cur = el;
    while (cur) {
      if (matchesSel(cur, sel)) return cur;
      cur = cur.parentElement;
    }
    return null;
  }

  function queryAll(root, sel) {
    const results = [];
    function walk(node) {
      if (matchesSel(node, sel)) results.push(node);
      (node.children || []).forEach(walk);
    }
    (root.children || []).forEach(walk);
    return results;
  }

  // ── Preview DOM tree ──────────────────────────────────────────────
  // Structure:
  //   #workspace
  //     #preview-content
  //       .preview-hit-layer
  //         .pv-el[data-origin-id="rh-fiscal-box"]       (container)
  //           .pv-el[data-origin-id="rh-company-matriz"] (child — target)
  //         .preview-selection-layer
  //           .sel-box

  const workspace = createElement('div', { id: 'workspace', className: '' });
  const previewContent = createElement('div', { id: 'preview-content', className: '' });
  const hitLayer = createElement('div', { className: 'preview-hit-layer' });
  const pvContainer = createElement('div', { className: 'pv-el' }, { originId: 'rh-fiscal-box' });
  const pvChild = createElement('div', { className: 'pv-el' }, { originId: 'rh-company-matriz' });
  const selLayer = createElement('div', { className: 'preview-selection-layer' });
  const selBox = createElement('div', { className: 'sel-box' });

  pvContainer.appendChild(pvChild);
  hitLayer.appendChild(pvContainer);
  selLayer.appendChild(selBox);
  previewContent.appendChild(hitLayer);
  previewContent.appendChild(selLayer);
  workspace.appendChild(previewContent);

  const allElements = [];
  function collectAll(node) { allElements.push(node); (node.children || []).forEach(collectAll); }
  collectAll(workspace);

  const documentMock = {
    getElementById(id) { return elements.get(id) || null; },
    querySelector(sel) {
      for (const el of allElements) { if (matchesSel(el, sel)) return el; }
      return null;
    },
    querySelectorAll(sel) { return allElements.filter(el => matchesSel(el, sel)); },
  };

  // ── DS mock ───────────────────────────────────────────────────────
  const dsElements = [
    { id: 'rh-fiscal-box', type: 'box', x: 0, y: 0, w: 500, h: 400, zIndex: 1, sectionId: 'rh' },
    { id: 'rh-company-matriz', type: 'text', x: 16, y: 167, w: 200, h: 30, zIndex: 2, sectionId: 'rh' },
  ];
  const selection = new Set(['rh-company-matriz']);
  const DS = {
    previewMode: true,
    elements: dsElements,
    selection,
    getSelectedElements() { return dsElements.filter(e => selection.has(e.id)); },
    getElementById(id) { return dsElements.find(e => e.id === id) || null; },
  };

  // ── HitTestEngine mock — returns CONTAINER (rh-fiscal-box) by zIndex ──
  // This simulates the bug: model hit-test returns the wrong element
  const HitTestEngine = {
    elementAt(_cx, _cy) { return dsElements.find(e => e.id === 'rh-fiscal-box'); },
    sectionAt() { return { id: 'rh' }; },
    handleAt() { return null; },
  };

  // ── SelectionEngine mock — captures what ID is dispatched ─────────
  const dispatched = { elementId: null, handlePos: null };
  const SelectionEngine = {
    _drag: null,
    onElementPointerDown(_e, id) { dispatched.elementId = id; },
    onHandlePointerDown(_e, pos) { dispatched.handlePos = pos; },
    onMouseMove() {},
    onMouseUp() {},
  };

  const RF = {
    Geometry: {
      viewToModel(cx, cy) { return { x: cx, y: cy }; },
      clientToModel(cx, cy) { return { x: cx, y: cy }; },
      zoom() { return 1; },
    },
  };

  return {
    DS, RF, HitTestEngine, SelectionEngine, dispatched,
    documentMock, pvChild, pvContainer, selBox, workspace,
  };
}

describe('Preview hit routing contract', () => {

  it('pointerdown on .pv-el[rh-company-matriz] must dispatch selectedId=rh-company-matriz, NOT rh-fiscal-box', () => {
    const ctx = buildContext();

    // Build the routing factory inside a VM context with our mocks
    const sandbox = {
      RF: ctx.RF,
      DS: ctx.DS,
      document: ctx.documentMock,
      console,
      JSON,
      performance: { now: () => 0 },
      module: { exports: {} },
      globalThis: {},
    };
    vm.createContext(sandbox);
    vm.runInContext(src, sandbox);

    const factory = sandbox.module.exports.createEngineCoreRoutingPointer
      || sandbox.EngineCoreRoutingPointer?.createEngineCoreRoutingPointer;
    assert.ok(factory, 'createEngineCoreRoutingPointer must be exported');

    const router = factory({
      state: { runtime: { pipeline: { lastPointerEvent: null } } },
      getEngine(name) {
        if (name === 'HitTestEngine') return ctx.HitTestEngine;
        if (name === 'SelectionEngine') return ctx.SelectionEngine;
        return null;
      },
      traceElement() {},
      targetSummary() { return null; },
    });

    // Simulate pointerdown — target is pvChild (rh-company-matriz)
    const fakeEvent = {
      button: 0,
      buttons: 1,
      detail: 1,
      clientX: 100,
      clientY: 200,
      pointerId: 1,
      pointerType: 'mouse',
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      target: ctx.pvChild,  // user clicked on the CHILD element
    };

    router.routePointer(fakeEvent, 'down');

    // ── CONTRACT ASSERTIONS ─────────────────────────────────────────
    assert.ok(ctx.dispatched.elementId !== null,
      'routing must dispatch to onElementPointerDown (not drop the event)');

    assert.equal(ctx.dispatched.elementId, 'rh-company-matriz',
      `selectedId must be rh-company-matriz (the element under cursor), ` +
      `got "${ctx.dispatched.elementId}" — if rh-fiscal-box, routing is using ` +
      `model hit-test instead of DOM target`);

    assert.notEqual(ctx.dispatched.elementId, 'rh-fiscal-box',
      'must NOT dispatch rh-fiscal-box (the container from model hit-test)');
  });

  it('pointerdown on .sel-box in preview must dispatch the current selection, not the model hit', () => {
    const ctx = buildContext();

    const sandbox = {
      RF: ctx.RF,
      DS: ctx.DS,
      document: ctx.documentMock,
      console,
      JSON,
      performance: { now: () => 0 },
      module: { exports: {} },
      globalThis: {},
    };
    vm.createContext(sandbox);
    vm.runInContext(src, sandbox);

    const factory = sandbox.module.exports.createEngineCoreRoutingPointer
      || sandbox.EngineCoreRoutingPointer?.createEngineCoreRoutingPointer;

    const router = factory({
      state: { runtime: { pipeline: { lastPointerEvent: null } } },
      getEngine(name) {
        if (name === 'HitTestEngine') return ctx.HitTestEngine;
        if (name === 'SelectionEngine') return ctx.SelectionEngine;
        return null;
      },
      traceElement() {},
      targetSummary() { return null; },
    });

    // User clicks on sel-box (already has rh-company-matriz selected)
    const fakeEvent = {
      button: 0,
      buttons: 1,
      detail: 1,
      clientX: 100,
      clientY: 200,
      pointerId: 1,
      pointerType: 'mouse',
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      target: ctx.selBox,
    };

    router.routePointer(fakeEvent, 'down');

    assert.ok(ctx.dispatched.elementId !== null,
      'sel-box click in preview must dispatch to onElementPointerDown');

    assert.equal(ctx.dispatched.elementId, 'rh-company-matriz',
      `sel-box click must drag the currently selected element (rh-company-matriz), ` +
      `got "${ctx.dispatched.elementId}"`);
  });

  it('handle click in preview must NOT trigger resize (must dispatch as move)', () => {
    const ctx = buildContext();

    // Add a handle to the DOM
    const handle = {
      tagName: 'DIV',
      className: 'sel-handle',
      dataset: { pos: 'se' },
      style: {},
      children: [],
      parentElement: ctx.selBox, // handle is inside selection layer
      closest(sel) {
        if (sel === '.sel-handle') return this;
        if (sel === '.sel-box') return null;
        if (sel === '.cr-element') return null;
        if (sel === '.section-resize-handle') return null;
        if (sel === '#ctx-menu') return null;
        if (sel === '.menu-item') return null;
        if (sel === '.dropdown') return null;
        return null;
      },
      matches() { return false; },
      classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
      getBoundingClientRect() { return { left: 0, top: 0, width: 8, height: 8 }; },
      setPointerCapture() {},
      getAttribute() { return null; },
    };

    const sandbox = {
      RF: ctx.RF,
      DS: ctx.DS,
      document: ctx.documentMock,
      console,
      JSON,
      performance: { now: () => 0 },
      module: { exports: {} },
      globalThis: {},
    };
    vm.createContext(sandbox);
    vm.runInContext(src, sandbox);

    const factory = sandbox.module.exports.createEngineCoreRoutingPointer
      || sandbox.EngineCoreRoutingPointer?.createEngineCoreRoutingPointer;

    const router = factory({
      state: { runtime: { pipeline: { lastPointerEvent: null } } },
      getEngine(name) {
        if (name === 'HitTestEngine') return ctx.HitTestEngine;
        if (name === 'SelectionEngine') return ctx.SelectionEngine;
        return null;
      },
      traceElement() {},
      targetSummary() { return null; },
    });

    const fakeEvent = {
      button: 0, buttons: 1, detail: 1,
      clientX: 100, clientY: 200,
      pointerId: 1, pointerType: 'mouse',
      altKey: false, ctrlKey: false, metaKey: false, shiftKey: false,
      target: handle,
    };

    router.routePointer(fakeEvent, 'down');

    // In preview, handle must dispatch as element move, NOT as resize
    assert.equal(ctx.dispatched.handlePos, null,
      'handle click in preview must NOT call onHandlePointerDown (resize)');
    assert.ok(ctx.dispatched.elementId !== null,
      'handle click in preview must dispatch as onElementPointerDown (move)');
  });
});
