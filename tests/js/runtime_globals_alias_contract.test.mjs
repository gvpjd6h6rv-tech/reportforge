import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = fs.readFileSync('engines/RuntimeGlobals.js', 'utf8');

const sandbox = {
  window: {},
  console,
  setInterval: () => 0,
  document: {
    getElementById: () => ({ textContent: '' }),
  },
  RF: {
    Geometry: {
      toCanvasSpace: () => ({ x: 0, y: 0 }),
    },
  },
};

sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(source, sandbox);

const data = sandbox.window.SAMPLE_DATA;

assert.equal(
  sandbox.window.resolveField('forma_pago_descripcion', data),
  '01'
);

assert.equal(
  sandbox.window.formatValue(
    sandbox.window.resolveField('forma_pago_descripcion', data),
    'forma_pago'
  ),
  'SIN UTILIZACIÓN DEL SISTEMA FINANCIERO'
);

assert.equal(sandbox.window.resolveField('forma_pago_valor', data), 33.85);
assert.equal(sandbox.window.resolveField('totales_subtotal_15', data), 29.43);
assert.equal(sandbox.window.resolveField('totales_iva_15', data), 4.42);
assert.equal(sandbox.window.resolveField('totales_valor_total', data), 33.85);
assert.equal(sandbox.window.resolveField('cliente_email', data), 'roberto.silva@email.com');
assert.equal(sandbox.window.resolveField('cliente_direccion', data), '44 Y SEDALANA, Guayaquil');
assert.equal(sandbox.window.resolveField('empresa_agente_retencion', data), 'NO');

console.log('runtime globals alias contract: PASS');
