'use strict';
/**
 * command_runtime_format_properties.test.mjs
 *
 * Tests for format-field and open-properties actions in CommandRuntimeHandlersFormat.js,
 * and MenuAdapters.js action string verification.
 *
 * §1  format-field with selection → render + props-body to 9999 (format section at bottom)
 * §2  open-properties with selection → render + props-body to 0 (properties section at top)
 * §3  format-field without selection → no-op (no render, no scroll)
 * §4  open-properties without selection → no-op (no render, no scroll)
 * §5  format-field in preview mode → same behavior as design mode
 * §6  open-properties in preview mode → same behavior as design mode
 * §7  format-field with field element → no crash
 * §8  open-properties with text element → no crash
 * §9  format-field with non-textual element (line) → no crash
 * §10 open-properties with non-textual element (rect) → no crash
 * §11 format-field with multiple selection → renders once
 * §12 open-properties with multiple selection → renders once
 * §13 format-field with locked element → renders (locked does not block panel)
 * §14 format-field with invisible element → renders
 * §15 open-properties called twice rapidly → renders twice, no error
 * §16 unknown action → not handled by format handler (returns false)
 * §17 MenuAdapters: "Dar formato al campo..." uses action format-field
 * §18 MenuAdapters: "Propiedades..." uses action open-properties
 * §19 Regression: format-field and open-properties have distinct scroll behavior
 * §20 Regression: align-lefts NOT handled by format handler (different dispatch family)
 * §21 Regression: color-font IS handled by format handler (handled but no render call)
 * §22 Regression: same-size NOT handled by format handler (selection dispatch family)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const FORMAT_SRC = fs.readFileSync(path.resolve(ROOT, 'engines/CommandRuntimeHandlersFormat.js'), 'utf8');
const MENU_SRC   = fs.readFileSync(path.resolve(ROOT, 'engines/MenuAdapters.js'), 'utf8');

function makeEl(overrides = {}) {
  return {
    id: 'el-1', type: 'field',
    x: 10, y: 10, w: 100, h: 20,
    color: '#000', bgColor: 'transparent',
    fontFamily: 'Arial', fontSize: 10,
    bold: false, italic: false, underline: false,
    align: 'left', borderColor: '#000', borderWidth: 0,
    ...overrides,
  };
}

function load({ elements = [makeEl()], previewMode = false, selectionSize = null } = {}) {
  const renderCalls      = [];
  const applyFormatCalls = [];
  const panelRight       = { scrollTop: 0 };
  const propsBody        = { scrollTop: 0 };
  const noop             = () => {};

  const size = selectionSize !== null ? selectionSize : elements.length;

  const ctx = {
    CommandRuntimeShared: {
      dispatchActionMap(action, handlers) {
        const fn = handlers[action];
        if (!fn) return false;
        fn();
        return true;
      },
    },
    DS: {
      selection: { size },
      previewMode,
      getSelectedElements() { return elements; },
    },
    PropertiesEngine: {
      render(...args) { renderCalls.push(args); },
    },
    FormatEngine: {
      applyFormat(...args) { applyFormatCalls.push(args); },
      toggleFormat: noop,
    },
    document: {
      getElementById(id) {
        if (id === 'panel-right')       return panelRight;
        if (id === 'props-body')        return propsBody;
        if (id === 'color-picker-font') return { value: '', click: noop, oninput: null };
        if (id === 'color-picker-bg')   return { value: '', click: noop, oninput: null };
        if (id === 'color-picker-border') return { value: '', click: noop, oninput: null };
        return null;
      },
      documentElement: { style: { setProperty: noop } },
    },
    window: {},
  };
  ctx.window = ctx;

  vm.createContext(ctx);
  vm.runInContext(FORMAT_SRC, ctx, { filename: 'CommandRuntimeHandlersFormat.js' });

  const { handleFormatCommands } = ctx.CommandRuntimeHandlersFormat;

  return { dispatch: handleFormatCommands, renderCalls, applyFormatCalls, panelRight, propsBody };
}

// §1
test('§1  format-field with selection: renders PropertiesEngine, scrolls panel-right=9999, props-body=9999', () => {
  const { dispatch, renderCalls, panelRight, propsBody } = load();
  dispatch('format-field');
  assert.equal(renderCalls.length, 1);
  assert.equal(panelRight.scrollTop, 9999);
  assert.equal(propsBody.scrollTop, 9999);
});

// §2
test('§2  open-properties with selection: renders PropertiesEngine, scrolls panel-right=9999, props-body=0', () => {
  const { dispatch, renderCalls, panelRight, propsBody } = load();
  dispatch('open-properties');
  assert.equal(renderCalls.length, 1);
  assert.equal(panelRight.scrollTop, 9999);
  assert.equal(propsBody.scrollTop, 0);
});

// §3
test('§3  format-field without selection: no-op — no render, no scroll', () => {
  const { dispatch, renderCalls, panelRight, propsBody } = load({ elements: [], selectionSize: 0 });
  dispatch('format-field');
  assert.equal(renderCalls.length, 0);
  assert.equal(panelRight.scrollTop, 0);
  assert.equal(propsBody.scrollTop, 0);
});

// §4
test('§4  open-properties without selection: no-op — no render, no scroll', () => {
  const { dispatch, renderCalls, panelRight, propsBody } = load({ elements: [], selectionSize: 0 });
  dispatch('open-properties');
  assert.equal(renderCalls.length, 0);
  assert.equal(panelRight.scrollTop, 0);
  assert.equal(propsBody.scrollTop, 0);
});

// §5
test('§5  format-field in preview mode: renders same as design mode', () => {
  const { dispatch, renderCalls, panelRight, propsBody } = load({ previewMode: true });
  dispatch('format-field');
  assert.equal(renderCalls.length, 1);
  assert.equal(panelRight.scrollTop, 9999);
  assert.equal(propsBody.scrollTop, 9999);
});

// §6
test('§6  open-properties in preview mode: renders same as design mode', () => {
  const { dispatch, renderCalls, panelRight, propsBody } = load({ previewMode: true });
  dispatch('open-properties');
  assert.equal(renderCalls.length, 1);
  assert.equal(panelRight.scrollTop, 9999);
  assert.equal(propsBody.scrollTop, 0);
});

// §7
test('§7  format-field with field element: renders without crash', () => {
  const { dispatch, renderCalls } = load({ elements: [makeEl({ type: 'field', fieldPath: 'A.B' })] });
  assert.doesNotThrow(() => dispatch('format-field'));
  assert.equal(renderCalls.length, 1);
});

// §8
test('§8  open-properties with text element: renders without crash', () => {
  const { dispatch, renderCalls } = load({ elements: [makeEl({ type: 'text', content: 'hello' })] });
  assert.doesNotThrow(() => dispatch('open-properties'));
  assert.equal(renderCalls.length, 1);
});

// §9
test('§9  format-field with non-textual element (line): renders without crash', () => {
  const { dispatch, renderCalls } = load({ elements: [makeEl({ type: 'line' })] });
  assert.doesNotThrow(() => dispatch('format-field'));
  assert.equal(renderCalls.length, 1);
});

// §10
test('§10 open-properties with non-textual element (rect): renders without crash', () => {
  const { dispatch, renderCalls } = load({ elements: [makeEl({ type: 'rect' })] });
  assert.doesNotThrow(() => dispatch('open-properties'));
  assert.equal(renderCalls.length, 1);
});

// §11
test('§11 format-field with multiple selection: renders once', () => {
  const els = [makeEl({ id: 'e1' }), makeEl({ id: 'e2' }), makeEl({ id: 'e3' })];
  const { dispatch, renderCalls } = load({ elements: els, selectionSize: 3 });
  dispatch('format-field');
  assert.equal(renderCalls.length, 1);
});

// §12
test('§12 open-properties with multiple selection: renders once', () => {
  const els = [makeEl({ id: 'e1' }), makeEl({ id: 'e2' })];
  const { dispatch, renderCalls } = load({ elements: els, selectionSize: 2 });
  dispatch('open-properties');
  assert.equal(renderCalls.length, 1);
});

// §13
test('§13 format-field with locked element: renders (locked does not block panel)', () => {
  const { dispatch, renderCalls } = load({ elements: [makeEl({ locked: true })] });
  dispatch('format-field');
  assert.equal(renderCalls.length, 1);
});

// §14
test('§14 format-field with invisible element: renders', () => {
  const { dispatch, renderCalls } = load({ elements: [makeEl({ visible: false })] });
  dispatch('format-field');
  assert.equal(renderCalls.length, 1);
});

// §15
test('§15 open-properties called twice rapidly: renders twice, no error', () => {
  const { dispatch, renderCalls } = load();
  assert.doesNotThrow(() => {
    dispatch('open-properties');
    dispatch('open-properties');
  });
  assert.equal(renderCalls.length, 2);
});

// §16
test('§16 unknown action: not handled by format handler (returns false)', () => {
  const { dispatch, renderCalls } = load();
  const result = dispatch('__unknown__');
  assert.equal(result, false);
  assert.equal(renderCalls.length, 0);
});

// §17
test('§17 MenuAdapters: "Dar formato al campo..." item uses action format-field', () => {
  assert.ok(
    MENU_SRC.includes("label: 'Formatear campo...', action: 'format-field'"),
    "Expected Formatear campo... to have action 'format-field' in MenuAdapters.js"
  );
});

// §18
test('§18 MenuAdapters: "Propiedades..." item uses action open-properties', () => {
  assert.ok(
    MENU_SRC.includes("label: 'Propiedades...', action: 'open-properties'"),
    "Expected Propiedades... to have action 'open-properties' in MenuAdapters.js"
  );
});

// §19
test('§19 Regression: format-field and open-properties produce distinct scroll behavior', () => {
  const ff = load();
  ff.dispatch('format-field');

  const op = load();
  op.dispatch('open-properties');

  assert.equal(ff.propsBody.scrollTop, 9999, 'format-field scrolls props-body to 9999');
  assert.equal(op.propsBody.scrollTop, 0,    'open-properties resets props-body to 0');
  assert.notEqual(ff.propsBody.scrollTop, op.propsBody.scrollTop);
});

// §20
test('§20 Regression: align-lefts is NOT handled by format handler (belongs to selection dispatch)', () => {
  const { dispatch, renderCalls } = load();
  const result = dispatch('align-lefts');
  assert.equal(result, false, 'align-lefts must NOT be in the format dispatch map');
  assert.equal(renderCalls.length, 0);
});

// §21
test('§21 Regression: color-font IS handled by format handler (no render, but handled)', () => {
  const { dispatch, renderCalls } = load();
  const result = dispatch('color-font');
  assert.equal(result, true,  'color-font must be in the format dispatch map');
  assert.equal(renderCalls.length, 0, 'color-font opens color picker — does not call PropertiesEngine.render');
});

// §22
test('§22 Regression: same-size is NOT handled by format handler (selection dispatch family)', () => {
  const { dispatch, renderCalls } = load();
  const result = dispatch('same-size');
  assert.equal(result, false, 'same-size must NOT be in the format dispatch map');
  assert.equal(renderCalls.length, 0);
});
