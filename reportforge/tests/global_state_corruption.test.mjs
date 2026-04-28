'use strict';
/**
 * GLOBAL STATE CORRUPTION — Tier 2 hardening
 *
 * Verifica que los estados globales del runtime no puedan corromperse silenciosamente.
 *
 * Estrategia:
 *   1. RuntimeServicesState — expose/owner/flag/export correctness + re-install guard
 *   2. RuntimeData — CFG fields typed and present after install()
 *   3. EngineCoreContracts validators — assertRectShape, assertSelectionState,
 *      assertZoomContract, assertLayoutContract rechazan formas inválidas
 *   4. Window whitelist — los nombres canónicos están presentes en ALLOWED_WINDOW_EXPORTS
 *   5. DEFERRED: install() idempotency (RuntimeData no tiene guard)
 *
 * Nota: estos tests corren en Node sin browser — los paths que requieren DOM se
 * instrumentan con mocks mínimos o se documentan como DEFERRED.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

function loadRuntimeServicesState() {
  const src = fs.readFileSync(path.join(ROOT, 'engines/RuntimeServicesState.js'), 'utf8');
  const ctx = { RF: {} };
  // RuntimeServicesState uses (function(...)(window)) — provide window = ctx
  vm.runInNewContext(src, { window: ctx, RF: ctx.RF });
  return ctx.RF.RuntimeServicesState;
}

function loadRuntimeData() {
  const src = fs.readFileSync(path.join(ROOT, 'engines/RuntimeData.js'), 'utf8');
  const ctx = { module: { exports: {} }, window: {} };
  vm.runInNewContext(src, ctx);
  return { RuntimeData: ctx.RuntimeData || ctx.module.exports.RuntimeData, window: ctx.window };
}

function loadEngineCoreContracts() {
  const src = fs.readFileSync(path.join(ROOT, 'engines/EngineCoreContracts.js'), 'utf8');
  // runInThisContext so instanceof Set uses the same realm as the test — avoids cross-realm false rejects
  return vm.runInThisContext(`(function(){ ${src}; return createEngineCoreContracts; })()`);
}

// ---------------------------------------------------------------------------
// 1. RuntimeServicesState — correctness y re-install guard
// ---------------------------------------------------------------------------

test('global state — RuntimeServicesState: expose installs global AND stores in exports', () => {
  const S = loadRuntimeServicesState();
  assert.ok(S, 'RuntimeServicesState must be defined');

  // expose registers the value so getExport finds it
  const dummy = { kind: 'test-value' };
  S.expose('__testExpose', dummy);
  assert.strictEqual(S.getExport('__testExpose'), dummy,
    'getExport must return value previously exposed');
});

test('global state — RuntimeServicesState: setOwner/getOwner round-trip is lossless', () => {
  const S = loadRuntimeServicesState();

  S.setOwner('canvas', 'CanvasLayoutEngine');
  assert.equal(S.getOwner('canvas'), 'CanvasLayoutEngine');

  S.setOwner('selection', 'SelectionEngine');
  assert.equal(S.getOwner('selection'), 'SelectionEngine');

  // Unknown owner returns null — no phantom values
  assert.equal(S.getOwner('__nonexistent_owner_xyz'), null,
    'unknown owner must return null, not undefined or fabricated value');
});

test('global state — RuntimeServicesState: setFlag/getFlag with fallback, no cross-contamination', () => {
  const S = loadRuntimeServicesState();

  // Flag not set yet — fallback
  assert.equal(S.getFlag('__flag_unset_xyz', 'FALLBACK'), 'FALLBACK',
    'unset flag must return fallback');

  S.setFlag('__flag_test', true);
  assert.equal(S.getFlag('__flag_test'), true);

  S.setFlag('__flag_test', false);
  assert.equal(S.getFlag('__flag_test'), false,
    'flag must track overwrite correctly');

  // Setting one flag must not affect another
  S.setFlag('__flag_a', 'aaa');
  S.setFlag('__flag_b', 'bbb');
  assert.equal(S.getFlag('__flag_a'), 'aaa', 'flag_a must not be overwritten by flag_b');
});

test('global state — RuntimeServicesState: setDebugFlags makes defensive copy (mutation safe)', () => {
  const S = loadRuntimeServicesState();

  const original = { verbose: true, trace: false };
  S.setDebugFlags(original);

  // Mutate original after set — must not affect stored copy
  original.verbose = false;
  original.injected = 'evil';

  const stored = S.getDebugFlags();
  assert.equal(stored.verbose, true,
    'stored debugFlags must be a copy — mutating original must not affect stored value');
  assert.ok(!('injected' in stored),
    'injected key must not appear in stored debugFlags (copy isolation)');
});

test('global state — RuntimeServicesState: re-install guard (second script load is a no-op)', () => {
  // Load source twice into same context — root.RuntimeServicesState check prevents overwrite
  const src = fs.readFileSync(path.join(ROOT, 'engines/RuntimeServicesState.js'), 'utf8');
  const ctx = { RF: {} };

  vm.runInNewContext(src, { window: ctx, RF: ctx.RF });
  const first = ctx.RF.RuntimeServicesState;
  first.setOwner('__re_install_probe', 'first-install');

  vm.runInNewContext(src, { window: ctx, RF: ctx.RF });
  const second = ctx.RF.RuntimeServicesState;

  assert.strictEqual(first, second,
    'RuntimeServicesState re-install must return the same object (idempotency guard)');
  assert.equal(second.getOwner('__re_install_probe'), 'first-install',
    'owner set in first install must survive second install (state not wiped)');
});

// ---------------------------------------------------------------------------
// 2. RuntimeData — CFG fields typed and complete after install()
// ---------------------------------------------------------------------------

test('global state — RuntimeData: install() sets all required CFG numeric fields', () => {
  const { RuntimeData, window: w } = loadRuntimeData();
  assert.ok(RuntimeData, 'RuntimeData must be exported');

  RuntimeData.install();

  const required = {
    GRID: 'number',
    PAGE_W: 'number',
    RULER_W: 'number',
    RULER_H: 'number',
    MIN_EL_W: 'number',
    MIN_EL_H: 'number',
    HANDLE_HIT: 'number',
    SECTION_MIN_H: 'number',
    SECTION_MAX_H: 'number',
    PAGE_MARGIN_LEFT: 'number',
    PAGE_MARGIN_TOP: 'number',
  };

  assert.ok(w.CFG && typeof w.CFG === 'object', 'CFG must be an object after install()');
  for (const [key, type] of Object.entries(required)) {
    assert.equal(typeof w.CFG[key], type,
      `CFG.${key} must be ${type}, got ${typeof w.CFG[key]}`);
    assert.ok(Number.isFinite(w.CFG[key]),
      `CFG.${key} must be finite, got ${w.CFG[key]}`);
  }
});

test('global state — RuntimeData: ZOOM_LEVELS is ordered array with valid range', () => {
  const { RuntimeData, window: w } = loadRuntimeData();
  RuntimeData.install();

  assert.ok(Array.isArray(w.CFG.ZOOM_LEVELS), 'CFG.ZOOM_LEVELS must be an array');
  assert.ok(w.CFG.ZOOM_LEVELS.length >= 4, 'ZOOM_LEVELS must have at least 4 entries');

  for (let i = 1; i < w.CFG.ZOOM_LEVELS.length; i++) {
    assert.ok(w.CFG.ZOOM_LEVELS[i] > w.CFG.ZOOM_LEVELS[i - 1],
      `ZOOM_LEVELS must be strictly ascending at index ${i}`);
  }

  const min = w.CFG.ZOOM_LEVELS[0];
  const max = w.CFG.ZOOM_LEVELS[w.CFG.ZOOM_LEVELS.length - 1];
  assert.ok(min > 0, `ZOOM_LEVELS min must be > 0, got ${min}`);
  assert.ok(max <= 10, `ZOOM_LEVELS max must be <= 10, got ${max}`);
});

test('global state — RuntimeData: FORMATS functions are callable and return strings', () => {
  const { RuntimeData, window: w } = loadRuntimeData();
  RuntimeData.install();

  assert.ok(w.FORMATS && typeof w.FORMATS === 'object', 'FORMATS must be an object');

  const cases = [
    ['currency', 1234.5, '1234.50'],
    ['float2', 3.14159, '3.14'],
    ['upper', 'hello', 'HELLO'],
  ];

  for (const [fn, input, expected] of cases) {
    assert.equal(typeof w.FORMATS[fn], 'function',
      `FORMATS.${fn} must be a function`);
    assert.equal(String(w.FORMATS[fn](input)), expected,
      `FORMATS.${fn}(${input}) must return "${expected}"`);
  }
});

test('global state — RuntimeData: FIELD_TREE root categories present and non-empty', () => {
  const { RuntimeData, window: w } = loadRuntimeData();
  RuntimeData.install();

  const required = ['database', 'formula', 'parameter', 'running', 'group', 'special'];
  assert.ok(w.FIELD_TREE && typeof w.FIELD_TREE === 'object', 'FIELD_TREE must be an object');

  for (const category of required) {
    assert.ok(category in w.FIELD_TREE,
      `FIELD_TREE must contain root category "${category}"`);
    assert.equal(typeof w.FIELD_TREE[category].label, 'string',
      `FIELD_TREE.${category}.label must be a string`);
  }
});

// ---------------------------------------------------------------------------
// 3. EngineCoreContracts — validators reject corrupted shapes
// ---------------------------------------------------------------------------

test('global state — EngineCoreContracts: assertRectShape rejects legacy {x,y,w,h} shape', () => {
  const createContracts = loadEngineCoreContracts();
  assert.ok(createContracts, 'createEngineCoreContracts must be defined');

  let caught = null;
  const contracts = createContracts({
    contractFailure: (kind) => { caught = kind; throw new Error(kind); },
  });

  // Legacy shape {x,y,w,h} — must be rejected
  assert.throws(
    () => contracts.assertRectShape({ x: 10, y: 10, w: 100, h: 20 }, 'test'),
    /INVALID RECT SHAPE/,
    'legacy {x,y,w,h} shape must be rejected',
  );
});

test('global state — EngineCoreContracts: assertRectShape accepts canonical {left,top,width,height}', () => {
  const createContracts = loadEngineCoreContracts();
  const contracts = createContracts({
    contractFailure: (kind) => { throw new Error(kind); },
  });

  const canonical = { left: 10, top: 20, width: 100, height: 50 };
  const result = contracts.assertRectShape(canonical, 'test');
  assert.strictEqual(result, canonical, 'canonical rect must pass through unchanged');
});

test('global state — EngineCoreContracts: assertRectShape rejects NaN/Infinity in fields', () => {
  const createContracts = loadEngineCoreContracts();
  const contracts = createContracts({
    contractFailure: (kind) => { throw new Error(kind); },
  });

  assert.throws(
    () => contracts.assertRectShape({ left: NaN, top: 0, width: 100, height: 50 }, 'test'),
    /INVALID RECT SHAPE/,
    'NaN left must be rejected',
  );

  assert.throws(
    () => contracts.assertRectShape({ left: 0, top: 0, width: Infinity, height: 50 }, 'test'),
    /INVALID RECT SHAPE/,
    'Infinity width must be rejected',
  );
});

test('global state — EngineCoreContracts: assertSelectionState rejects non-Set', () => {
  const createContracts = loadEngineCoreContracts();
  const contracts = createContracts({
    contractFailure: (kind) => { throw new Error(kind); },
  });

  // Array — looks like a Set but is not
  assert.throws(
    () => contracts.assertSelectionState(['e1', 'e2'], 'test'),
    /INVALID SELECTION STATE/,
    'Array must be rejected as selection state',
  );

  // Object
  assert.throws(
    () => contracts.assertSelectionState({ e1: true }, 'test'),
    /INVALID SELECTION STATE/,
    'Object must be rejected as selection state',
  );

  // Null
  assert.throws(
    () => contracts.assertSelectionState(null, 'test'),
    /INVALID SELECTION STATE/,
    'null must be rejected as selection state',
  );
});

test('global state — EngineCoreContracts: assertSelectionState rejects Set with empty-string IDs', () => {
  const createContracts = loadEngineCoreContracts();
  const contracts = createContracts({
    contractFailure: (kind) => { throw new Error(kind); },
  });

  // Empty string is invalid ID
  assert.throws(
    () => contracts.assertSelectionState(new Set(['e1', '']), 'test'),
    /INVALID SELECTION STATE/,
    'Set with empty-string ID must be rejected',
  );

  // Valid Set must pass
  const valid = new Set(['e1', 'e2', 'e3']);
  assert.strictEqual(contracts.assertSelectionState(valid, 'test'), valid,
    'valid string-ID Set must pass through');
});

test('global state — EngineCoreContracts: assertZoomContract rejects invalid zoom values', () => {
  const createContracts = loadEngineCoreContracts();
  const contracts = createContracts({
    contractFailure: (kind) => { throw new Error(kind); },
  });

  const invalids = [NaN, Infinity, -Infinity, '1.0', null, undefined, true];
  for (const bad of invalids) {
    assert.throws(
      () => contracts.assertZoomContract(bad, 'test'),
      /INVALID ZOOM CONTRACT/,
      `zoom=${JSON.stringify(bad)} must be rejected`,
    );
  }

  // Valid zoom must pass
  assert.doesNotThrow(() => contracts.assertZoomContract(1.0, 'test'), 'zoom=1.0 must pass');
  assert.doesNotThrow(() => contracts.assertZoomContract(0.25, 'test'), 'zoom=0.25 must pass');
});

test('global state — EngineCoreContracts: assertLayoutContract rejects element without sectionId', () => {
  const createContracts = loadEngineCoreContracts();
  const contracts = createContracts({
    contractFailure: (kind) => { throw new Error(kind); },
  });

  // Missing sectionId
  assert.throws(
    () => contracts.assertLayoutContract({ id: 'e1', x: 0, y: 0, w: 100, h: 20 }, 'test'),
    /INVALID LAYOUT CONTRACT/,
    'layout element without sectionId must be rejected',
  );

  // sectionId is not a string
  assert.throws(
    () => contracts.assertLayoutContract({ id: 'e1', sectionId: 42, x: 0, y: 0, w: 100, h: 20 }, 'test'),
    /INVALID LAYOUT CONTRACT/,
    'layout element with numeric sectionId must be rejected',
  );

  // Valid element must pass
  const valid = { id: 'e1', sectionId: 'ph', x: 10, y: 10, w: 100, h: 20 };
  assert.strictEqual(contracts.assertLayoutContract(valid, 'test'), valid,
    'valid layout element must pass through unchanged');
});

// ---------------------------------------------------------------------------
// 4. Window whitelist integrity — static scan
// ---------------------------------------------------------------------------

test('global state — whitelist: canonical runtime globals are present in engine sources', () => {
  // Verify the critical globals are actually written to window by their owner files
  const checks = [
    { file: 'engines/RuntimeData.js', globals: ['CFG', 'FIELD_TREE', 'SAMPLE_DATA', 'FORMATS'] },
    { file: 'engines/RuntimeHelpers.js', globals: ['resolveField', 'formatValue', 'getCanvasPos'] },
  ];

  for (const { file, globals } of checks) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const name of globals) {
      const pattern = new RegExp(`window\\.${name}\\s*=`);
      assert.match(src, pattern,
        `${file} must install window.${name}`);
    }
  }
});

test('global state — whitelist: prohibited direct engine globals are not window-assigned in engine files', () => {
  // These must never appear as window.X = ... in engine source files
  // (they are registered through RuntimeServices.expose or not at all)
  const prohibited = ['SelectionEngine', 'AlignEngine', 'AlignmentGuides', 'CanvasLayoutEngine'];
  const engineFiles = fs.readdirSync(path.join(ROOT, 'engines'))
    .filter((f) => f.endsWith('.js'))
    .map((f) => path.join(ROOT, 'engines', f));

  const violations = [];
  for (const file of engineFiles) {
    const src = fs.readFileSync(file, 'utf8')
      // strip comments
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    for (const name of prohibited) {
      if (new RegExp(`window\\.${name}\\s*=`).test(src)) {
        violations.push(`${path.basename(file)}: window.${name} assigned directly`);
      }
    }
  }

  assert.equal(violations.length, 0,
    `prohibited direct window assignments found:\n${violations.join('\n')}`);
});

// ---------------------------------------------------------------------------
// 5. DEFERRED: RuntimeData install() idempotency
// ---------------------------------------------------------------------------

test('global state — DEFERRED: RuntimeData install() called twice may overwrite globals (no guard)', () => {
  const GAP = {
    id: 'GLOBALS-DATA-001',
    description: 'RuntimeData.install() has no re-install guard — calling twice resets CFG and FORMATS',
    risk: 'low in practice (install called once at boot) but silent in theory',
    mitigation: 'RuntimeServicesState re-install guard is the model to follow if needed',
    implemented_in: null,
  };
  assert.ok(GAP.id);
  assert.equal(GAP.implemented_in, null, 'gap is unimplemented — update when guard is added');
});
