import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = fs.readFileSync('engines/RuntimeGlobals.js', 'utf8');

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
    toCanvasSpace: () => ({ x: 0, y: 0 }),
  },
};

const sandbox = {
  window: {
    RF: rfStub,
    devicePixelRatio: 1,
  },
  RF: rfStub,
  console,
  setInterval: () => 0,
  clearInterval: () => undefined,
  document: {
    getElementById: () => ({
      textContent: '',
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }),
      scrollLeft: 0,
      scrollTop: 0,
    }),
  },
};

sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(source, sandbox);

// Browser compatibility for RuntimeGlobals.js:
// window.FORMATS is also reachable as global FORMATS in a real browser.
sandbox.FORMATS = sandbox.window.FORMATS;

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

console.log('runtime globals alias contract: PASS');
