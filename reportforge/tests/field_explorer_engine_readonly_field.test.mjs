'use strict';
/**
 * FieldExplorerEngine._buildField — contrato UDS 4.1 Fase 17:
 *  - un campo con readOnly:true nunca es draggable ni dispara insert (dblclick).
 *  - un campo SIN readOnly conserva el comportamiento existente (draggable,
 *    dragstart/dragend/dblclick wired) — no regression para tablas/campos
 *    normales ya existentes.
 */
import test   from 'node:test';
import assert from 'node:assert/strict';
import fs     from 'node:fs';
import vm     from 'node:vm';
import { resolve, dirname } from 'node:path';
import { fileURLToPath }    from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function makeElement() {
  const listeners = {};
  return {
    className: '',
    title: '',
    draggable: false,
    innerHTML: '',
    style: {},
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      toggle(c) { this._set.has(c) ? this._set.delete(c) : this._set.add(c); return this._set.has(c); },
    },
    addEventListener(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
    dispatchEvent(ev) { (listeners[ev.type] || []).forEach((fn) => fn(ev)); },
    querySelector() { return null; },
  };
}

function load() {
  const src = fs.readFileSync(resolve(ROOT, 'engines/FieldExplorerEngine.js'), 'utf8');
  const elementsById = {};
  const ctx = {
    document: {
      createElement: () => makeElement(),
      getElementById: (id) => elementsById[id] || (elementsById[id] = makeElement()),
    },
    mkEl: () => ({}),
  };
  ctx.window = ctx;
  const context = vm.createContext(ctx);
  new vm.Script(src).runInContext(context);
  return new vm.Script('FieldExplorerEngine').runInContext(context);
}

test('readOnly field is not draggable and has no dragstart/dblclick wiring', () => {
  const engine = load();
  const field = { path: 'sqlCommand.c1.X', label: 'X', vtype: 'string', readOnly: true };
  const div = engine._buildField(field);
  assert.equal(div.draggable, false);
  assert.match(div.className, /tree-field-readonly/);

  let dblclicked = false;
  engine._insertField = () => { dblclicked = true; };
  div.dispatchEvent({ type: 'dblclick' });
  assert.equal(dblclicked, false);

  let dragstarted = false;
  engine._dragField = null;
  div.dispatchEvent({ type: 'dragstart', dataTransfer: { setData() {} } });
  assert.equal(engine._dragField, null);
});

test('non-readOnly field keeps existing draggable/dblclick behavior (no regression)', () => {
  const engine = load();
  const field = { path: 'empresa.razon_social', label: 'razon_social', vtype: 'string' };
  const div = engine._buildField(field);
  assert.equal(div.draggable, true);
  assert.doesNotMatch(div.className, /tree-field-readonly/);

  let inserted = null;
  engine._insertField = (f) => { inserted = f; };
  div.dispatchEvent({ type: 'dblclick' });
  assert.equal(inserted, field);

  div.dispatchEvent({ type: 'dragstart', dataTransfer: { setData() {} } });
  assert.equal(engine._dragField, field);
});
