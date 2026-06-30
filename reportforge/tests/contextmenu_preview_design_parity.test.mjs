/**
 * contextmenu_preview_design_parity.test.mjs
 *
 * Verifica que el contextmenu funciona correctamente en preview mode
 * (GlobalEventHandlers.js) y mantiene paridad contractual con design mode
 * (SelectionInteractionPointer.attachElementEvents).
 *
 * §1  Preview: contextmenu en .pv-el → preventDefault
 * §2  Preview: contextmenu en .pv-el → show('element')
 * §3  Preview: contextmenu en .pv-el → selectOnly(id) llamado
 * §4  Preview: contextmenu en .pv-el → renderHandles llamado
 * §5  Preview: contextmenu en .pv-el ya seleccionado → selectOnly NO se llama otra vez
 * §6  Preview: contextmenu en canvas background → preventDefault
 * §7  Preview: contextmenu en canvas background → show('canvas')
 * §8  Preview: contextmenu en canvas background → clearSelection llamado
 * §9  Design:  contextmenu en background (regresión) → preventDefault + clearSelection + show('canvas')
 * §10 Design:  contextmenu en target con .cr-element → menú NO se muestra (guard activo)
 * MT1 Metamórfico: canvas background design vs preview → mismas llamadas (preventDefault+clearSelection+show)
 * MT2 Metamórfico: elemento preview vs diseño → mismo contrato (selectOnly+renderHandles+show element)
 * MT3 Metamórfico: contextmenu repetido 3x en mismo .pv-el → selectOnly llamado solo 1 vez (idempotente)
 * MT4 Metamórfico: align-tops/align-bottoms presentes en MenuAdapters items Y en toolbar HTML
 * MT5 Metamórfico: MenuAdapters usa una única lista de items (sin bifurcación por modo)
 * MT6 Metamórfico: preventDefault se llama ANTES del branch de modo (incondicional, diseño y preview)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const GEH_SRC  = fs.readFileSync(path.resolve(ROOT, 'engines/GlobalEventHandlers.js'), 'utf8');
const MENU_SRC  = fs.readFileSync(path.resolve(ROOT, 'engines/MenuAdapters.js'), 'utf8');
const HTML_SRC  = fs.readFileSync(path.resolve(ROOT, 'designer/crystal-reports-designer-v4.html'), 'utf8');
const SIP_SRC   = fs.readFileSync(path.resolve(ROOT, 'engines/SelectionInteractionPointer.js'), 'utf8');

// ---------- helpers DOM fake ----------

function makePvEl(originId) {
  return {
    dataset: { originId },
    closest(selector) {
      if (selector === '.pv-el[data-origin-id]') return this;
      return null;
    },
  };
}

function makeCanvasBg() {
  return { closest() { return null; } };
}

function makeCrEl() {
  // target that appears to have a .cr-element ancestor (design mode element)
  return {
    closest(selector) {
      if (selector === '.cr-element') return this;
      if (selector === '.pv-el[data-origin-id]') return null;
      return null;
    },
  };
}

function makeCtxEvent(target, { clientX = 10, clientY = 20 } = {}) {
  let prevented = false;
  const evt = {
    target,
    clientX,
    clientY,
    preventDefault() { prevented = true; },
    stopPropagation() {},
  };
  Object.defineProperty(evt, '_prevented', { get: () => prevented });
  return evt;
}

// ---------- GEH loader ----------

function loadGEH({ previewMode = false, selectedIds = new Set() } = {}) {
  const calls = {
    show: [],
    clearSelection: [],
    renderHandles: [],
    selectOnly: [],
    isSelected: [],
  };

  const workspaceListeners = {};
  const workspace = {
    addEventListener(ev, fn) {
      if (!workspaceListeners[ev]) workspaceListeners[ev] = [];
      workspaceListeners[ev].push(fn);
    },
    scrollTop: 0,
    scrollLeft: 0,
    removeEventListener() {},
  };

  const ctx = {
    RF: null,                         // RuntimeServices = null → useEngineCoreInteraction = true
    DS: { previewMode, zoom: 1, previewZoom: 1 },
    SelectionState: {
      isSelected(id) {
        calls.isSelected.push(id);
        return selectedIds.has(id);
      },
      selectOnly(id) {
        calls.selectOnly.push(id);
        selectedIds.clear();
        selectedIds.add(id);
      },
      clearSelectionState() {},
    },
    SelectionEngine: {
      clearSelection() {
        calls.clearSelection.push(null);
        selectedIds.clear();
      },
      renderHandles() { calls.renderHandles.push(null); },
      handleDoubleClick() {},
      onMouseMove() {},
      onMouseUp() {},
    },
    ContextMenuEngine: {
      show(x, y, type) { calls.show.push({ x, y, type }); },
      hide() {},
    },
    document: {
      getElementById(id) {
        if (id === 'workspace') return workspace;
        return null;
      },
      addEventListener() {},
    },
    window: {},
    ZoomWidget: { init() {} },
    DesignZoomEngine: { set() {}, setFree() {} },
    PreviewZoomEngine: { set() {} },
    OverlayEngine: { render() {} },
    applyLayout() {},
    requestAnimationFrame(fn) { fn(); },
    SectionResizeEngine: { _drag: false, onMouseMove() {}, onMouseUp() {} },
    InsertEngine: { onCanvasMouseDown() {} },
    MenuEngine: { closeAll() {} },
    addEventListener() {},   // window.addEventListener('resize', ...)
  };
  ctx.window = ctx;

  vm.createContext(ctx);
  vm.runInContext(GEH_SRC, ctx, { filename: 'GlobalEventHandlers.js' });
  ctx.registerGlobalEventHandlers();

  function fire(target, opts) {
    const e = makeCtxEvent(target, opts);
    (workspaceListeners['contextmenu'] || []).forEach(h => h(e));
    return e;
  }

  return { calls, fire };
}

// ---------- design-element contextmenu via SelectionInteractionPointer ----------

function runDesignElementContextmenu({ id = 'el-99', alreadySelected = false } = {}) {
  const calls = {
    show: [],
    renderHandles: [],
    selectOnly: [],
    isSelected: [],
  };
  const selectedIds = new Set(alreadySelected ? [id] : []);

  const divListeners = {};
  const mockDiv = {
    addEventListener(ev, fn) {
      if (!divListeners[ev]) divListeners[ev] = [];
      divListeners[ev].push(fn);
    },
    setPointerCapture() {},
  };

  const ctx = {
    window: { RF: { RuntimeServices: { isEngineCoreInteractionEnabled: () => true } } },
    SelectionState: {
      isSelected(i) { calls.isSelected.push(i); return selectedIds.has(i); },
      selectOnly(i) { calls.selectOnly.push(i); selectedIds.clear(); selectedIds.add(i); },
      clearSelectionState() {},
      addSelection() {},
      removeSelection() {},
      getElementById() { return null; },
    },
    SelectionHitTest: {
      resolveElementDiv() { return null; },
      resolvePointerId() { return 0; },
      isShiftSelection() { return false; },
    },
    ContextMenuEngine: {
      show(x, y, type) { calls.show.push({ x, y, type }); },
    },
    DS: { getSelectedElements: () => [] },
    PropertiesEngine: { render() {} },
    FormatEngine: { updateToolbar() {} },
  };
  ctx.window.window = ctx.window;
  // expose globals used by SIP
  Object.assign(ctx, ctx.window);
  ctx.window = ctx;

  vm.createContext(ctx);
  // const-declared top-level vars don't land on the context object in Node vm;
  // append an explicit export so we can access it.
  vm.runInContext(
    SIP_SRC + '\nwindow.SelectionInteractionPointer = SelectionInteractionPointer;',
    ctx,
    { filename: 'SelectionInteractionPointer.js' },
  );

  const engine = {
    renderHandles() { calls.renderHandles.push(null); },
    enableSelectionOverlay() {},
    _drag: null,
  };

  ctx.SelectionInteractionPointer.attachElementEvents(engine, mockDiv, id);

  // fire contextmenu
  let prevented = false;
  let stoppedPropagation = false;
  const e = {
    target: mockDiv,
    clientX: 50, clientY: 60,
    preventDefault() { prevented = true; },
    stopPropagation() { stoppedPropagation = true; },
  };
  (divListeners['contextmenu'] || []).forEach(h => h(e));

  return { calls, prevented, stoppedPropagation };
}

// =================== TESTS ===================

// §1
test('§1  Preview: contextmenu en .pv-el previene el evento por defecto del navegador', () => {
  const { fire } = loadGEH({ previewMode: true });
  const e = fire(makePvEl('el-1'));
  assert.ok(e._prevented, 'e.preventDefault() debe haberse llamado');
});

// §2
test('§2  Preview: contextmenu en .pv-el abre menú de tipo element', () => {
  const { calls, fire } = loadGEH({ previewMode: true });
  fire(makePvEl('el-7'));
  assert.equal(calls.show.length, 1, 'ContextMenuEngine.show debe llamarse una vez');
  assert.equal(calls.show[0].type, 'element');
});

// §3
test('§3  Preview: contextmenu en .pv-el llama selectOnly con el origin-id correcto', () => {
  const { calls, fire } = loadGEH({ previewMode: true });
  fire(makePvEl('el-42'));
  assert.ok(calls.selectOnly.includes('el-42'), 'selectOnly debe recibir el id del elemento');
});

// §4
test('§4  Preview: contextmenu en .pv-el llama renderHandles después de selectOnly', () => {
  const { calls, fire } = loadGEH({ previewMode: true });
  fire(makePvEl('el-5'));
  assert.equal(calls.renderHandles.length, 1, 'renderHandles debe llamarse');
  assert.ok(
    calls.selectOnly.length > 0 && calls.renderHandles.length > 0,
    'selectOnly y renderHandles deben llamarse ambos',
  );
});

// §5
test('§5  Preview: contextmenu en .pv-el ya seleccionado → selectOnly NO se llama de nuevo', () => {
  const selected = new Set(['el-3']);
  const { calls, fire } = loadGEH({ previewMode: true, selectedIds: selected });
  fire(makePvEl('el-3'));
  assert.equal(calls.selectOnly.length, 0, 'selectOnly no debe llamarse si el elemento ya está seleccionado');
  assert.equal(calls.show.length, 1, 'el menú sí debe mostrarse');
  assert.equal(calls.show[0].type, 'element');
});

// §6
test('§6  Preview: contextmenu en canvas background previene evento por defecto', () => {
  const { fire } = loadGEH({ previewMode: true });
  const e = fire(makeCanvasBg());
  assert.ok(e._prevented);
});

// §7
test('§7  Preview: contextmenu en canvas background muestra menú de tipo canvas', () => {
  const { calls, fire } = loadGEH({ previewMode: true });
  fire(makeCanvasBg());
  assert.equal(calls.show.length, 1);
  assert.equal(calls.show[0].type, 'canvas');
});

// §8
test('§8  Preview: contextmenu en canvas background llama clearSelection', () => {
  const { calls, fire } = loadGEH({ previewMode: true });
  fire(makeCanvasBg());
  assert.equal(calls.clearSelection.length, 1);
});

// §9
test('§9  Design (regresión): contextmenu en background → preventDefault + clearSelection + show(canvas)', () => {
  const { calls, fire } = loadGEH({ previewMode: false });
  const e = fire(makeCanvasBg());
  assert.ok(e._prevented, 'preventDefault debe llamarse');
  assert.equal(calls.clearSelection.length, 1, 'clearSelection debe llamarse');
  assert.equal(calls.show.length, 1);
  assert.equal(calls.show[0].type, 'canvas');
});

// §10
test('§10 Design: contextmenu con target .cr-element → menú NO se muestra (guard activo)', () => {
  const { calls, fire } = loadGEH({ previewMode: false });
  // In design mode the workspace handler guards: if (!e.target.closest('.cr-element')) { ... }
  // A .cr-element target reaches the workspace handler only if stopPropagation was skipped,
  // but the guard inside prevents showing the menu.
  fire(makeCrEl());
  assert.equal(calls.show.length, 0, 'show NO debe llamarse para target .cr-element en design');
  assert.equal(calls.clearSelection.length, 0, 'clearSelection NO debe llamarse');
});

// MT1
test('MT1 Metamórfico: canvas background en design y en preview → mismas llamadas', () => {
  const design  = loadGEH({ previewMode: false });
  const preview = loadGEH({ previewMode: true });

  const eD = design.fire(makeCanvasBg(),  { clientX: 5, clientY: 5 });
  const eP = preview.fire(makeCanvasBg(), { clientX: 5, clientY: 5 });

  assert.ok(eD._prevented, 'design: preventDefault');
  assert.ok(eP._prevented, 'preview: preventDefault');
  assert.equal(design.calls.clearSelection.length,  1, 'design: clearSelection');
  assert.equal(preview.calls.clearSelection.length, 1, 'preview: clearSelection');
  assert.equal(design.calls.show.length,  1, 'design: show llamado');
  assert.equal(preview.calls.show.length, 1, 'preview: show llamado');
  assert.equal(design.calls.show[0].type,  'canvas', 'design: tipo canvas');
  assert.equal(preview.calls.show[0].type, 'canvas', 'preview: tipo canvas');
});

// MT2
test('MT2 Metamórfico: elemento en preview vs diseño → mismo contrato (selectOnly + renderHandles + show element)', () => {
  // Preview path: via GlobalEventHandlers.js
  const preview = loadGEH({ previewMode: true });
  preview.fire(makePvEl('el-X'), { clientX: 50, clientY: 60 });

  // Design path: via SelectionInteractionPointer.attachElementEvents
  const { calls: dCalls, prevented: dPrevented } = runDesignElementContextmenu({ id: 'el-X' });

  // Both paths must: preventDefault
  assert.ok(preview.calls.show.length > 0, 'preview: show debe haberse llamado');
  assert.ok(dPrevented, 'design: preventDefault debe haberse llamado');

  // Both paths must: selectOnly(id)
  assert.ok(preview.calls.selectOnly.includes('el-X'), 'preview: selectOnly(el-X)');
  assert.ok(dCalls.selectOnly.includes('el-X'), 'design: selectOnly(el-X)');

  // Both paths must: renderHandles
  assert.ok(preview.calls.renderHandles.length > 0, 'preview: renderHandles');
  assert.ok(dCalls.renderHandles.length > 0, 'design: renderHandles');

  // Both paths must: show(..., 'element')
  assert.equal(preview.calls.show[0].type, 'element', 'preview: tipo element');
  assert.equal(dCalls.show[0].type, 'element', 'design: tipo element');
});

// MT3
test('MT3 Metamórfico: contextmenu repetido 3x en mismo .pv-el → selectOnly llamado 1 sola vez (idempotente)', () => {
  const selected = new Set();
  const { calls, fire } = loadGEH({ previewMode: true, selectedIds: selected });

  // First fire → not selected, selectOnly called
  fire(makePvEl('el-R'));
  // After first fire 'el-R' is in selectedIds (selectOnly added it)
  // Second and third fires → already selected, selectOnly skipped
  fire(makePvEl('el-R'));
  fire(makePvEl('el-R'));

  assert.equal(calls.selectOnly.length, 1, 'selectOnly debe llamarse exactamente una vez');
  assert.equal(calls.show.length, 3, 'show debe llamarse en cada event (menú siempre abre)');
  assert.ok(calls.show.every(s => s.type === 'element'), 'todas las llamadas son tipo element');
});

// MT4
test('MT4 Metamórfico: align-tops y align-bottoms presentes en MenuAdapters Y en HTML toolbar', () => {
  // MenuAdapters: source must contain the action strings
  assert.ok(
    MENU_SRC.includes("action: 'align-tops'"),
    "MenuAdapters debe incluir action: 'align-tops'",
  );
  assert.ok(
    MENU_SRC.includes("action: 'align-bottoms'"),
    "MenuAdapters debe incluir action: 'align-bottoms'",
  );

  // HTML toolbar: both toolbar buttons must have data-action
  const topRe    = /data-action="align-tops"/g;
  const bottomRe = /data-action="align-bottoms"/g;
  const topMatches    = [...HTML_SRC.matchAll(topRe)];
  const bottomMatches = [...HTML_SRC.matchAll(bottomRe)];

  assert.ok(topMatches.length >= 1, 'HTML debe tener al menos un botón data-action="align-tops"');
  assert.ok(bottomMatches.length >= 1, 'HTML debe tener al menos un botón data-action="align-bottoms"');
});

// MT5
test('MT5 Metamórfico: MenuAdapters tiene una sola lista de items (sin bifurcación por modo)', () => {
  // ContextMenuEngine.show builds items based on context param ('element' | 'canvas')
  // but does NOT branch on design vs preview mode — same items in both modes.
  // We verify by checking there is no reference to DS.previewMode inside MenuAdapters.
  assert.ok(
    !MENU_SRC.includes('previewMode'),
    'MenuAdapters NO debe referenciar previewMode (lista de items es independiente del modo)',
  );
  // And that the element context items include both format-field and open-properties
  assert.ok(MENU_SRC.includes("action: 'format-field'"),  "MenuAdapters incluye format-field");
  assert.ok(MENU_SRC.includes("action: 'open-properties'"), "MenuAdapters incluye open-properties");
});

// MT6
test('MT6 Metamórfico: e.preventDefault() se llama antes de cualquier branch de modo (design y preview)', () => {
  // Verify the source: preventDefault must appear before the `if (DS.previewMode)` check.
  // We inspect the source code ordering of these tokens.
  const prevIdx    = GEH_SRC.indexOf('e.preventDefault()');
  const previewIdx = GEH_SRC.indexOf('DS.previewMode');
  assert.ok(prevIdx !== -1, 'GlobalEventHandlers debe contener e.preventDefault()');
  assert.ok(previewIdx !== -1, 'GlobalEventHandlers debe contener DS.previewMode');
  assert.ok(
    prevIdx < previewIdx,
    `e.preventDefault() (pos ${prevIdx}) debe aparecer ANTES de DS.previewMode (pos ${previewIdx}) en el source`,
  );

  // Also verify empirically: both modes call preventDefault
  const design  = loadGEH({ previewMode: false });
  const preview = loadGEH({ previewMode: true });
  const eD = design.fire(makeCanvasBg());
  const eP = preview.fire(makePvEl('el-99'));
  assert.ok(eD._prevented, 'design: preventDefault llamado');
  assert.ok(eP._prevented, 'preview: preventDefault llamado');
});
