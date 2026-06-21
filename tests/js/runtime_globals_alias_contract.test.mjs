import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = fs.readFileSync('engines/RuntimeGlobals.js', 'utf8');
const runtimeDataSource = fs.readFileSync('engines/RuntimeData.js', 'utf8');
const runtimeHelpersSource = fs.readFileSync('engines/RuntimeHelpers.js', 'utf8');

function createSandbox() {
  const nodes = new Map();
  const makeBox = () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 });
  const makeNode = () => ({
    textContent: '',
    scrollLeft: 0,
    scrollTop: 0,
    getBoundingClientRect: makeBox,
  });

  const sbTime = makeNode();
  nodes.set('sb-time', sbTime);
  nodes.set('canvas-layer', makeNode());
  nodes.set('workspace', makeNode());
  nodes.set('ruler-v', makeNode());

  const rfStub = {
    RuntimeConfig: {
      canvas: {
        grid: 10,
        pageW: 794,
        modelGrid: 1,
        pageMarginLeft: 0,
        pageMarginTop: 0,
        minElW: 4,
        minElH: 4,
        handleHit: 8,
        sectionMinH: 12,
        sectionMaxH: 2000,
      },
      ruler: {
        sidePx: 32,
        topPx: 24,
      },
      zoom: {
        steps: [0.5, 0.75, 1, 1.25, 1.5, 2],
      },
    },
    Geometry: {
      clientToModel: () => ({ x: 0, y: 0 }),
      toCanvasSpace: () => ({ x: 0, y: 0 }),
    },
  };

  const sandbox = {
    RF: rfStub,
    window: null,
    globalThis: null,
    console,
    setInterval: (fn) => {
      sandbox.__intervalCallback = fn;
      return 1234;
    },
    clearInterval: () => undefined,
    document: {
      getElementById: (id) => nodes.get(id) || null,
      querySelector: () => null,
      querySelectorAll: () => [],
    },
    devicePixelRatio: 1,
    __intervalCallback: null,
    __sbTime: sbTime,
  };

  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  return sandbox;
}

function loadRuntimeGlobals(sandbox) {
  vm.createContext(sandbox);
  vm.runInContext(runtimeDataSource, sandbox);
  vm.runInContext(runtimeHelpersSource, sandbox);
  vm.runInContext(source, sandbox);
}

test('RuntimeGlobals freezes global exports and legacy helpers', () => {
  const sandbox = createSandbox();
  loadRuntimeGlobals(sandbox);

  assert.ok(sandbox.RF.Geometry, 'RF.Geometry should be installed');
  assert.equal(typeof sandbox.RuntimeData.install, 'function', 'RuntimeData should be loaded before RuntimeGlobals');
  assert.equal(sandbox.CFG, sandbox.window.CFG, 'CFG should be exposed globally');
  assert.equal(sandbox.FIELD_TREE, sandbox.window.FIELD_TREE, 'FIELD_TREE should be exposed globally');
  assert.equal(sandbox.SAMPLE_DATA, sandbox.window.SAMPLE_DATA, 'SAMPLE_DATA should be exposed globally');
  assert.equal(sandbox.FORMATS, sandbox.window.FORMATS, 'FORMATS should be exposed globally');

  assert.equal(typeof sandbox.window.resolveField, 'function');
  assert.equal(typeof sandbox.window.formatValue, 'function');
  assert.equal(typeof sandbox.window.getCanvasPos, 'function');
  assert.equal(typeof sandbox.window.initClock, 'function');

  const data = sandbox.window.SAMPLE_DATA;
  assert.equal(sandbox.window.resolveField('forma_pago_descripcion', data), '01');
  assert.equal(
    sandbox.window.formatValue(
      sandbox.window.resolveField('forma_pago_descripcion', data),
      'forma_pago'
    ),
    'SIN UTILIZACIÓN DEL SISTEMA FINANCIERO'
  );

  assert.equal(sandbox.window.resolveField('forma_pago_valor', data), 33.85);
  assert.equal(sandbox.window.resolveField('forma_pago_plazo', data), '');
  assert.equal(sandbox.window.resolveField('forma_pago_tiempo', data), '');

  assert.equal(sandbox.window.resolveField('totales_subtotal_15', data), 29.43);
  assert.equal(sandbox.window.resolveField('totales_subtotal_iva_0', data), 0);
  assert.equal(sandbox.window.resolveField('totales_subtotal_no_objeto_iva', data), 0);
  assert.equal(sandbox.window.resolveField('totales_subtotal_exento_iva', data), 0);
  assert.equal(sandbox.window.resolveField('totales_subtotal_sin_impuestos', data), 29.43);
  assert.equal(sandbox.window.resolveField('totales_descuento_total', data), 0);
  assert.equal(sandbox.window.resolveField('totales_valor_ice', data), 0);
  assert.equal(sandbox.window.resolveField('totales_iva_15', data), 4.42);
  assert.equal(sandbox.window.resolveField('totales_propina', data), 0);
  assert.equal(sandbox.window.resolveField('totales_valor_total', data), 33.85);

  assert.equal(sandbox.window.resolveField('cliente_telefono', data), 'S/N');
  assert.equal(sandbox.window.resolveField('cliente_email', data), 'roberto.silva@email.com');
  assert.equal(sandbox.window.resolveField('cliente_direccion', data), '44 Y SEDALANA, Guayaquil');
  assert.equal(sandbox.window.resolveField('empresa_agente_retencion', data), 'NO');

  const modelPoint = { model: { x: 9, y: 8 }, clientX: 1, clientY: 2 };
  const directPos = sandbox.window.getCanvasPos(modelPoint);
  assert.deepEqual({ x: directPos.x, y: directPos.y }, { x: 9, y: 8 },
    'getCanvasPos should preserve direct model coordinates');

  let clientToModelCalls = 0;
  sandbox.RF.Geometry.clientToModel = (x, y) => {
    clientToModelCalls += 1;
    assert.equal(x, 17);
    assert.equal(y, 23);
    return { x: x + 1, y: y + 2 };
  };
  sandbox.RF.Geometry.toCanvasSpace = () => {
    throw new Error('getCanvasPos must use RF.Geometry.clientToModel');
  };
  const routedPos = sandbox.window.getCanvasPos({ clientX: 17, clientY: 23 });
  assert.deepEqual({ x: routedPos.x, y: routedPos.y }, { x: 18, y: 25 });
  assert.equal(clientToModelCalls, 1, 'getCanvasPos should route through RF.Geometry.clientToModel');
});

test('RuntimeGlobals initClock updates the clock node and stores the interval handle', () => {
  const sandbox = createSandbox();
  loadRuntimeGlobals(sandbox);

  sandbox.window.initClock();

  assert.equal(sandbox.window._clockInterval, 1234);
  assert.equal(typeof sandbox.__sbTime.textContent, 'string');
  assert.ok(sandbox.__sbTime.textContent.length > 0, 'initClock should write a visible clock value');
  assert.equal(typeof sandbox.__intervalCallback, 'function', 'initClock should register a periodic callback');
});

test('RuntimeGlobals second load is idempotent in the same context', () => {
  const sandbox = createSandbox();
  loadRuntimeGlobals(sandbox);

  const firstGeometry = sandbox.RF.Geometry;
  const firstResolveField = sandbox.window.resolveField;

  assert.doesNotThrow(() => vm.runInContext(source, sandbox));
  assert.strictEqual(sandbox.RF.Geometry, firstGeometry, 'RF.Geometry must survive a second load');
  assert.strictEqual(sandbox.window.resolveField, firstResolveField, 'legacy helpers must survive a second load');
  assert.equal(sandbox.window.CFG, sandbox.CFG, 'CFG must remain shared after reload');
});

test('RuntimeGlobals retries cleanly after an interrupted first load', () => {
  const sandbox = createSandbox();
  let failOnce = true;
  const originalSectionMinH = sandbox.RF.RuntimeConfig.canvas.sectionMinH;
  Object.defineProperty(sandbox.RF.RuntimeConfig.canvas, 'sectionMinH', {
    configurable: true,
    get() {
      if (failOnce) {
        failOnce = false;
        throw new Error('simulated load failure');
      }
      return originalSectionMinH;
    },
  });

  assert.throws(() => loadRuntimeGlobals(sandbox), /simulated load failure/);

  Object.defineProperty(sandbox.RF.RuntimeConfig.canvas, 'sectionMinH', {
    configurable: true,
    value: originalSectionMinH,
    writable: true,
  });

  assert.doesNotThrow(() => loadRuntimeGlobals(sandbox));
  assert.ok(sandbox.RF.Geometry, 'RF.Geometry should be available after retry');
  assert.equal(typeof sandbox.window.resolveField, 'function', 'legacy helpers should be installed after retry');
});
