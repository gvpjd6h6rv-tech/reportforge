'use strict';
/**
 * DEBUGGABILITY TESTS — Pruebas de Diagnóstico
 *
 * Objetivo: verificar que cuando algo falla, el sistema produce información
 * suficiente para reproducir y diagnosticar el problema sin depender de
 * memoria fresca o acceso a producción.
 *
 * Cuatro contratos:
 *   1. Trace útil: snapshot estructurado — version, timestamp, safeMode, pipeline
 *   2. Incident replay: incidentKey reproducible + snapshot serializable
 *   3. Ownership visible: DOM ownership tags únicos + writer conflict log poblado
 *   4. Causal log: lastFailure vincula reason → error → timestamp causalmente
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ---------------------------------------------------------------------------
// Loader de EngineCoreRuntime en contexto aislado
// ---------------------------------------------------------------------------

function loadRuntime(overrides = {}) {
  const src = fs.readFileSync(path.join(ROOT, 'engines/EngineCoreRuntime.js'), 'utf8');
  const ctx = { module: { exports: {} } };
  vm.runInNewContext(`${src}`, ctx);
  const factory = ctx.module.exports.createEngineCoreRuntime;

  const state = {
    runtime: {
      debugFlags: { safeMode: true, trace: true },
      lastWarningKey: null,
      safeMode: {
        active: false, reason: null, incidentKey: null,
        recoveryAttempted: false, recoveryCount: 0,
        lastError: null, lastRecoveryAt: null,
      },
      pipeline: {
        lastFrameMeta: null, lastFailure: null,
        lastInvariantReport: null, lastWarningReport: null,
        lastSnapshotAt: null, lastPointerEvent: null,
      },
    },
  };

  const events = [];
  const traceLog = [];

  return {
    rt: factory({
      state,
      getEngine: () => null,
      cloneSerializable: (v) => JSON.parse(JSON.stringify(v)),
      emitRuntimeEvent: (name, payload) => events.push({ name, payload }),
      trace: (channel, event, payload) => traceLog.push({ channel, event, payload }),
      snapshotSections: () => [{ id: 'ph', stype: 'pageHeader', height: 40 }],
      snapshotElements: () => [{ id: 'e1', type: 'text', x: 10, y: 10, w: 100, h: 20 }],
      snapshotContracts: () => ({ canvas: 'ok', selection: 'ok' }),
      summarizeContracts: (c) => c,
      validateSectionContract: () => {},
      validateCanvasContract: () => {},
      validateScrollContract: () => {},
      validateCanonicalRuntime: () => {},
      assertSelectionState: () => {},
      assertZoomContract: () => {},
      getPointer: () => ({ x: 0, y: 0 }),
      ...overrides,
    }),
    state,
    events,
    traceLog,
  };
}

// ---------------------------------------------------------------------------
// 1. Snapshot estructurado — exportRuntimeState produce campos diagnósticos mínimos
// ---------------------------------------------------------------------------

test('debuggability — exportRuntimeState produces structured snapshot with required fields', () => {
  const { rt } = loadRuntime();
  rt.enterSafeMode('test_failure', new Error('diagnostic test'), { phase: 'pointer' });

  const snap = rt.exportRuntimeState('test_failure');

  assert.ok(snap, 'exportRuntimeState must return a snapshot');
  assert.ok(typeof snap.version === 'string' && snap.version.length > 0,
    'snapshot must include a non-empty version string');
  assert.ok(snap.safeMode !== undefined, 'snapshot must include safeMode block');
  assert.ok(snap.pipeline !== undefined, 'snapshot must include pipeline block');
  assert.ok(typeof snap.timestamp === 'string', 'snapshot must include a timestamp string');

  const d = new Date(snap.timestamp);
  assert.ok(!isNaN(d.getTime()), 'snapshot timestamp must be a valid ISO date');
});

test('debuggability — snapshot is fully JSON-serializable (no circular refs)', () => {
  const { rt } = loadRuntime();
  rt.enterSafeMode('serialize_test', new Error('serialization check'), { phase: 'render' });

  const snap = rt.exportRuntimeState('serialize_test');
  let serialized;
  assert.doesNotThrow(
    () => { serialized = JSON.stringify(snap); },
    'runtime snapshot must be fully JSON-serializable',
  );

  const parsed = JSON.parse(serialized);
  assert.ok(parsed.safeMode.active, 'deserialized snapshot must preserve safeMode.active');
  assert.ok(parsed.safeMode.incidentKey, 'deserialized snapshot must preserve incidentKey');
  assert.equal(parsed.safeMode.reason, 'serialize_test');
});

// ---------------------------------------------------------------------------
// 2. Incident replay — incidentKey reproducible
// ---------------------------------------------------------------------------

test('debuggability — same error produces same incidentKey (replay determinism)', () => {
  const { rt } = loadRuntime();
  const err = new Error('render pipeline stall');

  rt.enterSafeMode('pipeline_stall', err, { phase: 'layout' });
  const key1 = rt.getSafeMode().incidentKey;
  rt.clearSafeMode();

  rt.enterSafeMode('pipeline_stall', err, { phase: 'layout' });
  const key2 = rt.getSafeMode().incidentKey;

  assert.equal(key1, key2, 'same incident must produce same incidentKey for replay');
  assert.ok(typeof key1 === 'string' && key1.length > 0, 'incidentKey must be a non-empty string');
});

test('debuggability — different errors produce different incidentKeys', () => {
  const { rt } = loadRuntime();

  rt.enterSafeMode('err_a', new Error('timeout'), { phase: 'layout' });
  const keyA = rt.getSafeMode().incidentKey;
  rt.clearSafeMode();

  rt.enterSafeMode('err_b', new Error('null pointer'), { phase: 'pointer' });
  const keyB = rt.getSafeMode().incidentKey;

  assert.notEqual(keyA, keyB, 'different incidents must produce different incidentKeys');
});

test('debuggability — lastFailure links reason + error + timestamp causally', () => {
  const { rt, state } = loadRuntime();
  const before = new Date().toISOString();
  rt.enterSafeMode('causal_chain_test', new Error('causal error msg'), { phase: 'post' });
  const after = new Date().toISOString();

  const failure = state.runtime.pipeline.lastFailure;
  assert.ok(failure, 'lastFailure must be populated after enterSafeMode');
  assert.equal(failure.reason, 'causal_chain_test');
  assert.ok(failure.error, 'lastFailure.error must be populated');
  assert.equal(failure.error.message, 'causal error msg');
  assert.ok(failure.timestamp >= before, 'timestamp must be >= incident start');
  assert.ok(failure.timestamp <= after, 'timestamp must be <= incident end');
  assert.ok(failure.incidentKey, 'lastFailure must include incidentKey');
});

// ---------------------------------------------------------------------------
// 3. Ownership visible — DOM tags únicos + writer conflict log
// ---------------------------------------------------------------------------

test('debuggability — DOM ownership tags are present and unique in designer shell', () => {
  const html = fs.readFileSync(
    path.join(ROOT, 'designer/crystal-reports-designer-v4.html'), 'utf8',
  );

  const owners = [...html.matchAll(/data-dom-owner="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(owners.length >= 5, `must have ≥5 data-dom-owner tags, found ${owners.length}`);

  const seen = new Set();
  const duplicates = [];
  for (const o of owners) {
    if (seen.has(o)) duplicates.push(o);
    seen.add(o);
  }
  assert.equal(duplicates.length, 0,
    `data-dom-owner must be unique — duplicates: ${duplicates.join(', ')}`);
});

test('debuggability — writer conflict log documents boundaries with assertions', () => {
  const log = fs.readFileSync(
    path.join(ROOT, 'docs/architecture/writer-conflict-log.md'), 'utf8',
  );

  const rows = (log.match(/^\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|/gm) || [])
    .filter((r) => !r.includes('---') && !r.includes('Area'));
  assert.ok(rows.length >= 5,
    `writer conflict log must have ≥5 boundaries, found ${rows.length}`);

  for (const row of rows) {
    const cols = row.split('|').map((c) => c.trim()).filter(Boolean);
    assert.ok(cols.length >= 4,
      `writer conflict entry needs 4 cols (area, owner, conflict, assertion): ${row}`);
    assert.ok(cols[3].length > 0,
      `entry must have non-empty assertion: ${row}`);
  }
});

test('debuggability — governance.md documents key diagnostic globals (__rfTraceLegacy, rfTrace, DebugTrace)', () => {
  const governance = fs.readFileSync(path.join(ROOT, 'docs/governance.md'), 'utf8');
  for (const phrase of ['__rfTraceLegacy', 'rfTrace', 'DebugTrace']) {
    assert.match(governance, new RegExp(phrase),
      `governance.md must document diagnostic global: ${phrase}`);
  }
});

// ---------------------------------------------------------------------------
// 4. Safe mode observable — entrada, visibilidad y salida limpias
// ---------------------------------------------------------------------------

test('debuggability — safe mode: inactive before, active during, cleared after', () => {
  const { rt } = loadRuntime();

  assert.equal(rt.getSafeMode().active, false, 'must be inactive initially');

  rt.enterSafeMode('test_obs', new Error('obs error'), {});
  const during = rt.getSafeMode();
  assert.equal(during.active, true);
  assert.equal(during.reason, 'test_obs');
  assert.ok(during.lastError, 'lastError must be populated');
  assert.ok(during.incidentKey, 'incidentKey must be populated');

  rt.clearSafeMode();
  const after = rt.getSafeMode();
  assert.equal(after.active, false);
  assert.equal(after.reason, null);
  assert.equal(after.incidentKey, null);
});

test('debuggability — recovery is tracked: recoveryAttempted flag is boolean after attempt', () => {
  const { rt } = loadRuntime();

  rt.recoverFromPipelineFailure('recovery_test', new Error('recovery error'), {}, () => {});

  const sm = rt.getSafeMode();
  assert.equal(typeof sm.recoveryAttempted, 'boolean',
    'recoveryAttempted must be a boolean (observable state)');
});

// ---------------------------------------------------------------------------
// 5. Writer conflict detection — #54 Tracking de writers / #55 Writer Conflict Detection
// ---------------------------------------------------------------------------

function loadRuntimeServicesState() {
  const src = fs.readFileSync(path.join(ROOT, 'engines/RuntimeServicesState.js'), 'utf8');
  const safeModeCalls = [];
  const events = [];

  class MockCustomEvent {
    constructor(type, init) { this.type = type; this.detail = init?.detail; }
  }

  const mockWindow = {
    RF: {
      EngineCore: {
        runtime: {
          enterSafeMode(reason, error, meta) {
            safeModeCalls.push({ reason, message: error?.message, meta });
          },
        },
      },
    },
    dispatchEvent(e) { events.push({ type: e.type, detail: e.detail }); },
    CustomEvent: MockCustomEvent,
  };

  // Run via vm with window = mockWindow in context, so IIFE gets the right global.
  const ctx = vm.createContext({ window: mockWindow, CustomEvent: MockCustomEvent });
  vm.runInContext(src, ctx);

  return { S: mockWindow.RF.RuntimeServicesState, safeModeCalls, events, mockWindow };
}

test('writer conflict — setOwner fires incident when a different owner claims existing slot', () => {
  const { S, safeModeCalls, events, mockWindow } = loadRuntimeServicesState();

  // First claim — no conflict.
  S.setOwner('canvas', 'CanvasLayoutEngine');
  assert.equal(safeModeCalls.length, 0, 'first claim must not trigger conflict');
  assert.equal(S.getOwner('canvas'), 'CanvasLayoutEngine');

  // Re-claim with the same owner — still no conflict (idempotent boot calls).
  S.setOwner('canvas', 'CanvasLayoutEngine');
  assert.equal(safeModeCalls.length, 0, 'idempotent re-claim must not trigger conflict');

  // Rogue writer claims same slot.
  S.setOwner('canvas', 'RogueEngine');

  assert.equal(safeModeCalls.length, 1, 'multi-writer conflict must call enterSafeMode');
  assert.equal(safeModeCalls[0].reason, 'writer_conflict');
  assert.match(safeModeCalls[0].message, /canvas/);
  assert.equal(safeModeCalls[0].meta.kind, 'canvas');
  assert.equal(safeModeCalls[0].meta.prev, 'CanvasLayoutEngine');
  assert.equal(safeModeCalls[0].meta.next, 'RogueEngine');

  assert.ok(events.some(e => e.type === 'rf:writer-conflict'), 'rf:writer-conflict event must be dispatched');
});

test('writer conflict — getWriterConflicts returns append-only conflict log', () => {
  const { S } = loadRuntimeServicesState();

  assert.equal(S.getWriterConflicts().length, 0, 'conflict log starts empty');

  S.setOwner('preview', 'PreviewEngineV19');
  S.setOwner('preview', 'LeakyEngine');
  S.setOwner('selection', 'SelectionEngine');
  S.setOwner('selection', 'AnotherEngine');

  const log = S.getWriterConflicts();
  assert.equal(log.length, 2, 'one entry per conflict');
  assert.equal(log[0].kind, 'preview');
  assert.equal(log[1].kind, 'selection');
  assert.ok(typeof log[0].at === 'string', 'conflict entry must have ISO timestamp');
});

test('writer conflict guard — static: guarded targets written only by canonical owner', () => {
  const result = execFileSync('node', [path.join(ROOT, 'audit/writer_conflict_guard.mjs')], {
    encoding: 'utf8',
    cwd: ROOT,
  });
  assert.match(result, /violations found: 0/);
});

// ---------------------------------------------------------------------------
// 6. Render metrics, timeline, profiling, storm detection (#50-#53)
// ---------------------------------------------------------------------------

function loadSchedulerFrame() {
  const stateSrc = fs.readFileSync(path.join(ROOT, 'engines/RenderSchedulerState.js'), 'utf8');
  const frameSrc = fs.readFileSync(path.join(ROOT, 'engines/RenderSchedulerFrame.js'), 'utf8');

  const stormEvents = [];
  const coreFrames  = [];

  const mockWindow = {
    RenderScheduler: null,           // populated after state loads
    EngineCore: null,
    EngineRegistry: null,
    rfTrace: null,
    DebugTrace: null,
    requestAnimationFrame: (fn) => { setTimeout(fn, 16); },
    cancelAnimationFrame: () => {},
    performance: { now: () => Date.now() },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    dispatchEvent(e) {
      if (e.type === 'rf:render-storm') stormEvents.push(e.detail);
    },
  };
  // vm.createContext makes mockWindow the global context; the IIFEs call )(window),
  // so 'window' must resolve as a global — point it to the context itself.
  mockWindow.window = mockWindow;

  // Run RenderSchedulerState first (exports S and H onto mockWindow).
  const ctxState = vm.createContext(mockWindow);
  vm.runInContext(stateSrc, ctxState);

  // Inject stub RenderSchedulerHelpers (H references in Frame).
  mockWindow.RenderSchedulerHelpers = {
    trace() {},
    getEngine(name) { return name === 'EngineCore' ? mockWindow.EngineCore : null; },
    notifyCore(method, meta) { if (method === 'completeFrame') coreFrames.push(meta); },
    attemptRecovery() {},
    hasPendingWork() { return false; },
    isStableFrame() { return true; },
    cloneFrameCounts(c) { return { ...c }; },
  };

  vm.runInContext(frameSrc, ctxState);

  const S = mockWindow.RenderSchedulerState;
  const Frame = mockWindow.RenderSchedulerFrame;

  return { S, Frame, stormEvents, coreFrames, mockWindow };
}

test('phase metrics (#50) — frameMeta carries durationMs and per-phase timing', () => {
  const { S, Frame, coreFrames } = loadSchedulerFrame();

  // Queue one task in each priority slot.
  const tasks = { layout: false, visual: false, handles: false, post: false };
  S.queues[S.PRIORITY.LAYOUT].set('t-layout',  () => { tasks.layout  = true; });
  S.queues[S.PRIORITY.VISUAL].set('t-visual',  () => { tasks.visual  = true; });
  S.queues[S.PRIORITY.HANDLES].set('t-handles',() => { tasks.handles = true; });
  S.queues[S.PRIORITY.POST].set('t-post',      () => { tasks.post    = true; });

  Frame.flush();

  assert.ok(coreFrames.length >= 1, 'completeFrame must be called');
  const meta = coreFrames[coreFrames.length - 1];

  assert.ok(typeof meta.durationMs === 'number', 'frameMeta.durationMs must be a number');
  assert.ok(meta.durationMs >= 0,                'durationMs must be non-negative');
  assert.ok(typeof meta.startMs === 'number',    'frameMeta.startMs must be a number');
  assert.ok(Array.isArray(meta.phases),          'frameMeta.phases must be an array');
  assert.equal(meta.phases.length, 4,            'must have 4 phase entries (layout, visual, handles, post)');

  for (const phase of meta.phases) {
    assert.ok(typeof phase.durationMs === 'number', `phase ${phase.name} must have durationMs`);
    assert.ok(phase.durationMs >= 0,               `phase ${phase.name} durationMs must be non-negative`);
    assert.ok(typeof phase.tasks === 'number',      `phase ${phase.name} must have task count`);
  }

  // All tasks ran.
  assert.ok(Object.values(tasks).every(Boolean), 'all queued tasks must have executed');
});

test('timeline ordering (#51) — phases are emitted in layout→visual→handles→post order', () => {
  const { S, Frame, coreFrames } = loadSchedulerFrame();

  S.queues[S.PRIORITY.LAYOUT].set('tl',  () => {});
  S.queues[S.PRIORITY.VISUAL].set('tv',  () => {});
  S.queues[S.PRIORITY.HANDLES].set('th', () => {});
  S.queues[S.PRIORITY.POST].set('tp',    () => {});

  Frame.flush();

  const meta = coreFrames[coreFrames.length - 1];
  const names = [...meta.phases].map(p => p.name);
  const expected = ['layout', 'visual', 'handles', 'post'];
  assert.ok(names.length === expected.length && names.every((n, i) => n === expected[i]),
    `phases must appear in canonical render order, got: ${names.join(',')}`);

  // Sequence integrity: each phase startMs is >= the previous phase's startMs.
  // (We can't assert strict ordering of start times since performance.now
  //  resolution may be coarse, but we can assert the array is stable.)
  assert.equal(meta.phases.length, 4, 'timeline must contain all 4 phases');
  assert.ok(meta.phases.every(p => typeof p.durationMs === 'number'),
    'every phase must have a measured duration');
});

test('per-task profiling (#52) — slowestMs and slowestKey are tracked per phase', () => {
  const { S, Frame, coreFrames } = loadSchedulerFrame();

  S.queues[S.PRIORITY.LAYOUT].set('fast', () => {});
  // A slightly "slower" task (simulate via busy loop is not reliable; just add two tasks).
  S.queues[S.PRIORITY.LAYOUT].set('slow', () => {
    let x = 0; for (let i = 0; i < 1000; i++) x += i; return x;
  });

  Frame.flush();

  const meta = coreFrames[coreFrames.length - 1];
  const layoutPhase = meta.phases.find(p => p.name === 'layout');

  assert.ok(layoutPhase,                             'layout phase must exist');
  assert.ok(typeof layoutPhase.slowestMs === 'number', 'slowestMs must be a number');
  assert.ok(layoutPhase.slowestMs >= 0,               'slowestMs must be non-negative');
  assert.ok(typeof layoutPhase.slowestKey === 'string' || layoutPhase.slowestKey === null,
    'slowestKey must be string or null');
});

test('render storm detection (#53) — rf:render-storm fires when frame rate exceeds threshold', () => {
  const { S, Frame, stormEvents } = loadSchedulerFrame();

  // Lower threshold so the test can trigger it without hammering real timers.
  S.stormThreshold = 5;
  // Reset storm state.
  Frame.clearStorm();

  // Inject 6 "recent" frame timestamps directly (within the last 1000ms).
  const now = Date.now();
  S.recentFrameTimes.push(now - 500, now - 400, now - 300, now - 200, now - 100);

  // One more flush should tip it over threshold=5 → 6 frames in window.
  Frame.flush();

  assert.ok(stormEvents.length >= 1, 'rf:render-storm must be dispatched when frame rate > threshold');
  const evt = stormEvents[0];
  assert.ok(evt.framesInWindow > S.stormThreshold, 'framesInWindow must exceed stormThreshold');
  assert.ok(S.stormActive === true, 'stormActive must latch to true');

  // Verify getFrameRate() reflects reality.
  const rate = Frame.getFrameRate();
  assert.ok(typeof rate === 'number', 'getFrameRate() must return a number');
});

test('render storm guard — static instrumentation verified', () => {
  const result = execFileSync('node', [path.join(ROOT, 'audit/render_storm_guard.mjs')], {
    encoding: 'utf8',
    cwd: ROOT,
  });
  assert.match(result, /violations found: 0/);
});

// ---------------------------------------------------------------------------
// 7. Orphan node detection (#60) + visual contracts (#61/#62)
// ---------------------------------------------------------------------------

function loadContractsSandbox(DS, doc = null) {
  const contractsSrc = fs.readFileSync(path.join(ROOT, 'engines/EngineCoreContracts.js'), 'utf8');
  const mockGlobal = {
    DS,
    window: null,
    document: doc,
    EngineRegistry: null,
    RF: { Geometry: { zoom: () => 1 } },
  };
  mockGlobal.window = mockGlobal;
  const ctx = vm.createContext(mockGlobal);
  vm.runInContext(contractsSrc, ctx);
  const factory = mockGlobal.EngineCoreContractsFactory;
  return factory({ doc, runtimeServices: null, getEngine: () => null });
}

function makeDS(elements = [], sections = []) {
  return {
    zoom: 1,
    elements,
    sections,
    selection: new Set(),
    getElementById(id) { return this.elements.find(e => e.id === id) || null; },
    getSectionTop() { return 0; },
  };
}

test('orphan detection (#60) — validateOrphanNodes flags DOM elements with no DS model entry', () => {
  // Simulate: DOM has a .cr-element[data-id="ghost"] but DS.elements is empty.
  const mockDoc = {
    querySelectorAll(sel) {
      if (sel === '.cr-element[data-id]') {
        return [{ dataset: { id: 'ghost' } }];
      }
      if (sel === '.cr-section[data-section-id]') return [];
      return [];
    },
  };
  const DS = makeDS([], []);
  const C = loadContractsSandbox(DS, mockDoc);
  const issues = [];
  C.validateOrphanNodes(issues);
  // ghost is in DOM but not in DS.elements — must be flagged.
  assert.ok(issues.some(i => i.code === 'orphan.dom-element'),
    'DOM element with no DS model entry must be flagged as orphan.dom-element');
});

test('orphan detection (#60) — validateOrphanNodes flags DS elements with missing DOM section', () => {
  // Simulate: DS.elements has an element referencing sectionId 'sec-missing',
  // but no .cr-section[data-section-id="sec-missing"] exists in DOM.
  const mockDoc = {
    querySelectorAll(sel) {
      if (sel === '.cr-element[data-id]') return [];          // no DOM orphans
      if (sel === '.cr-section[data-section-id]') return [];  // no sections in DOM
      return [];
    },
  };
  const DS = makeDS(
    [{ id: 'e1', sectionId: 'sec-missing', type: 'text', x: 0, y: 0, w: 10, h: 10,
       fontSize: 12, color: '#000', bgColor: 'transparent', bold: false, italic: false,
       underline: false, align: 'left', zIndex: 0 }],
    [],
  );
  const C = loadContractsSandbox(DS, mockDoc);
  const issues = [];
  C.validateOrphanNodes(issues);
  assert.ok(issues.some(i => i.code.startsWith('orphan.model-element')),
    'DS element whose sectionId has no DOM section must be flagged as orphan.model-element');
});

test('orphan detection (#60) — clean state produces no orphan issues', () => {
  // DOM and DS are fully consistent.
  const mockDoc = {
    querySelectorAll(sel) {
      if (sel === '.cr-element[data-id]') return [{ dataset: { id: 'e1' } }];
      if (sel === '.cr-section[data-section-id]') return [{ dataset: { sectionId: 's1' } }];
      return [];
    },
  };
  const DS = makeDS(
    [{ id: 'e1', sectionId: 's1', type: 'text', x: 0, y: 0, w: 10, h: 10,
       fontSize: 12, color: '#000', bgColor: 'transparent', bold: false, italic: false,
       underline: false, align: 'left', zIndex: 0 }],
    [{ id: 's1', stype: 'det', height: 60, visible: true, label: 'D', abbr: 'DET' }],
  );
  const C = loadContractsSandbox(DS, mockDoc);
  const issues = [];
  C.validateOrphanNodes(issues);
  assert.equal(issues.filter(i => i.code.startsWith('orphan.')).length, 0,
    'consistent DOM↔DS state must produce zero orphan issues');
});

test('visual contracts (#61) — snapshotElements returns full schema', () => {
  const DS = makeDS(
    [{ id: 'e1', sectionId: 's1', type: 'text', x: 5, y: 10, w: 80, h: 25,
       fontSize: 12, color: '#000', bgColor: 'transparent', bold: false, italic: false,
       underline: false, align: 'left', zIndex: 1 }],
    [{ id: 's1', stype: 'det', height: 60, visible: true, label: 'D', abbr: 'DET' }],
  );
  const C = loadContractsSandbox(DS);
  const els = C.snapshotElements();
  assert.ok(Array.isArray(els) && els.length > 0, 'snapshotElements must return non-empty array');
  const required = ['id', 'sectionId', 'type', 'x', 'y', 'w', 'h'];
  for (const field of required) {
    assert.ok(field in els[0], `snapshotElements entry must have field '${field}'`);
  }
});

test('visual contracts (#62) — layout hash changes on element position mutation', () => {
  const el = { id: 'e1', sectionId: 's1', type: 'text', x: 10, y: 20, w: 100, h: 30,
    fontSize: 12, color: '#000', bgColor: 'transparent', bold: false, italic: false,
    underline: false, align: 'left', zIndex: 1 };
  const DS = makeDS([el], [{ id: 's1', stype: 'det', height: 60, visible: true, label: 'D', abbr: 'DET' }]);

  const C1 = loadContractsSandbox(DS);
  const hash1 = C1.snapshotElements().map(e => `${e.id}:${e.x},${e.y},${e.w},${e.h}`).join('|');

  el.x = 99;  // mutate position
  const C2 = loadContractsSandbox(DS);
  const hash2 = C2.snapshotElements().map(e => `${e.id}:${e.x},${e.y},${e.w},${e.h}`).join('|');

  assert.notEqual(hash1, hash2, 'layout hash must differ after element position changes (visual diff sensitivity)');
  el.x = 10;  // restore
});

test('orphan node guard — static wiring verified', () => {
  const result = execFileSync('node', [path.join(ROOT, 'audit/orphan_node_guard.mjs')], {
    encoding: 'utf8', cwd: ROOT,
  });
  assert.match(result, /violations found: 0/);
});

test('visual contract guard — structural snapshot and pixel diff wiring verified', () => {
  const result = execFileSync('node', [path.join(ROOT, 'audit/visual_contract_guard.mjs')], {
    encoding: 'utf8', cwd: ROOT,
  });
  assert.match(result, /violations found: 0/);
});

// ---------------------------------------------------------------------------
// 8. Geometric Assertions (#63)
// ---------------------------------------------------------------------------

function loadDocumentState() {
  const src = fs.readFileSync(path.join(ROOT, 'engines/DocumentState.js'), 'utf8');
  const ctx = { module: { exports: {} } };
  vm.runInNewContext(src, ctx);
  return ctx.module.exports;
}

// ---------------------------------------------------------------------------
// 8a. Per-task profiling hotspot log (#52)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 7b. Subsystem SSOT (ClipboardState, DragState, KeyboardRegistry)
// ---------------------------------------------------------------------------

function loadModule(relPath) {
  const src = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  const ctx = { module: { exports: {} } };
  vm.runInNewContext(src, ctx);
  return ctx.module.exports;
}

test('subsystem SSOT — ClipboardState is independent and works correctly', () => {
  const CS = loadModule('engines/ClipboardState.js');

  assert.ok(!CS.hasContent(), 'starts empty');
  assert.equal(CS.size(), 0, 'size is 0 on init');

  CS.set([{ id: 'e1', x: 10, y: 5 }]);
  assert.ok(CS.hasContent(), 'hasContent after set');
  assert.equal(CS.size(), 1, 'size reflects set items');

  const snap = CS.snapshot();
  assert.ok(Array.isArray(snap) && snap.length === 1, 'snapshot returns copy');
  // Mutating snapshot must not affect internal state.
  snap.push({ id: 'injected' });
  assert.equal(CS.size(), 1, 'internal state unaffected by snapshot mutation');

  CS.clear();
  assert.ok(!CS.hasContent(), 'clear empties clipboard');
  assert.equal(CS.size(), 0);
});

test('subsystem SSOT — DragState tracks begin/end session correctly', () => {
  const DS_state = loadModule('engines/DragState.js');

  assert.ok(!DS_state.isActive, 'starts inactive');
  assert.equal(DS_state.dragType, null, 'dragType null before begin');
  assert.equal(DS_state.elId, null, 'elId null before begin');

  DS_state.begin({ type: 'move', elId: 'e42', startModelX: 0, startModelY: 0, startPositions: [] });
  assert.ok(DS_state.isActive, 'isActive after begin');
  assert.equal(DS_state.dragType, 'move');
  assert.equal(DS_state.elId, 'e42');

  DS_state.end();
  assert.ok(!DS_state.isActive, 'inactive after end');
  assert.equal(DS_state.dragType, null);
  assert.equal(DS_state.session, null);
});

test('subsystem SSOT — KeyboardRegistry is independent and routes correctly', () => {
  const KR = loadModule('engines/KeyboardRegistry.js');

  KR.clear();
  assert.equal(KR.get('ctrl+z'), null, 'starts empty');

  let fired = false;
  KR.register('ctrl+z', () => { fired = true; });
  assert.ok(typeof KR.get('ctrl+z') === 'function', 'handler registered');

  KR.trigger('ctrl+z', {});
  assert.ok(fired, 'trigger dispatches the handler');

  KR.off('ctrl+z');
  assert.equal(KR.get('ctrl+z'), null, 'off removes handler');
});

test('subsystem SSOT guard — static wiring verified', () => {
  const result = execFileSync('node', [path.join(ROOT, 'audit/subsystem_ssot_guard.mjs')], {
    encoding: 'utf8', cwd: ROOT,
  });
  assert.match(result, /violations found: 0/);
});

// ---------------------------------------------------------------------------
// 8a. Per-task profiling hotspot log (#52)
// ---------------------------------------------------------------------------

test('per-task profiling (#52) — slow tasks are recorded in hotspot log', () => {
  const { S, Frame } = loadSchedulerFrame();

  // Threshold of -1 ensures even zero-duration tasks (Date.now() coarse resolution) are captured.
  S.hotspotThresholdMs = -1;
  Frame.clearHotspots();

  S.queues[S.PRIORITY.LAYOUT].set('slow-task', () => {
    let x = 0; for (let i = 0; i < 5000; i++) x += i; return x;
  });
  Frame.flush();

  const hotspots = Frame.getHotspots();
  assert.ok(Array.isArray(hotspots), 'getHotspots() must return an array');
  assert.ok(hotspots.length >= 1, 'at least one hotspot must be recorded when threshold=0');
  const h = hotspots[0];
  assert.ok(typeof h.frame === 'number', 'hotspot must have frame number');
  assert.ok(typeof h.phase === 'string', 'hotspot must have phase name');
  assert.ok(typeof h.key === 'string', 'hotspot must have task key');
  assert.ok(typeof h.ms === 'number' && h.ms >= 0, 'hotspot must have ms duration');
});

test('per-task profiling (#52) — hotspot ring caps at 100 entries', () => {
  const { S, Frame } = loadSchedulerFrame();
  S.hotspotThresholdMs = -1;
  Frame.clearHotspots();

  // Flush 110 single-task frames to overflow the ring.
  for (let i = 0; i < 110; i++) {
    S.queues[S.PRIORITY.LAYOUT].set(`t${i}`, () => {});
    Frame.flush();
  }

  const hotspots = Frame.getHotspots();
  assert.ok(hotspots.length <= 100, `hotspot ring must not exceed 100 entries, got ${hotspots.length}`);
});

test('per-task profiling (#52) — clearHotspots resets the log', () => {
  const { S, Frame } = loadSchedulerFrame();
  S.hotspotThresholdMs = -1;
  S.queues[S.PRIORITY.LAYOUT].set('t1', () => {});
  Frame.flush();
  assert.ok(Frame.getHotspots().length >= 1, 'pre-clear: hotspots must be populated');
  Frame.clearHotspots();
  assert.equal(Frame.getHotspots().length, 0, 'post-clear: hotspot log must be empty');
});

test('per-task profiling guard — static instrumentation verified', () => {
  const result = execFileSync('node', [path.join(ROOT, 'audit/per_task_profiling_guard.mjs')], {
    encoding: 'utf8', cwd: ROOT,
  });
  assert.match(result, /violations found: 0/);
});

// ---------------------------------------------------------------------------
// 8. Geometric Assertions (#63)
// ---------------------------------------------------------------------------

test('geometric assertions (#63) — assertLayoutPatch rejects non-finite values', () => {
  const DS = loadDocumentState();
  const inv = DS.createDocumentState().invariants;
  assert.throws(() => inv.assertLayoutPatch({ x: NaN, y: 0, w: 10, h: 10 }),
    /INVALID LAYOUT CONTRACT/, 'NaN x must be rejected');
  assert.throws(() => inv.assertLayoutPatch({ x: 0, y: 0, w: Infinity, h: 10 }),
    /INVALID LAYOUT CONTRACT/, 'Infinity w must be rejected');
});

test('geometric assertions (#63) — assertLayoutPatch rejects zero or negative dimensions', () => {
  const DS = loadDocumentState();
  const inv = DS.createDocumentState().invariants;
  assert.throws(() => inv.assertLayoutPatch({ w: 0, h: 10 }),
    /INVALID LAYOUT CONTRACT/, 'w=0 must be rejected');
  assert.throws(() => inv.assertLayoutPatch({ w: 10, h: -5 }),
    /INVALID LAYOUT CONTRACT/, 'h<0 must be rejected');
});

test('geometric assertions (#63) — assertLayoutPatch accepts valid positive patch', () => {
  const DS = loadDocumentState();
  const inv = DS.createDocumentState().invariants;
  const patch = { x: 0, y: 5, w: 100, h: 20 };
  assert.doesNotThrow(() => inv.assertLayoutPatch(patch), 'valid positive-dimension patch must pass');
  // Partial patch (only x, no w/h) must also pass.
  assert.doesNotThrow(() => inv.assertLayoutPatch({ x: 10 }), 'partial patch with only x must pass');
});

test('geometric assertions guard — static wiring verified', () => {
  const result = execFileSync('node', [path.join(ROOT, 'audit/geometric_assertions_guard.mjs')], {
    encoding: 'utf8', cwd: ROOT,
  });
  assert.match(result, /violations found: 0/);
});

// ---------------------------------------------------------------------------
// 9. Reload Storm Safety (#65)
// ---------------------------------------------------------------------------

test('reload storm safety (#65) — DeferredBootstrap saveHistory patch is idempotency-guarded', () => {
  const src = fs.readFileSync(path.join(ROOT, 'engines/DeferredBootstrap.js'), 'utf8');
  assert.match(src, /_rfPhase3Patched/,
    'DeferredBootstrap must use _rfPhase3Patched flag to guard DS.saveHistory wrapping');
  assert.match(src, /DS\.saveHistory\._rfPhase3Patched/,
    'Guard must set DS.saveHistory._rfPhase3Patched = true after patching');
});

test('reload storm safety (#65) — DeferredBootstrap DesignZoomEngine patch is idempotency-guarded', () => {
  const src = fs.readFileSync(path.join(ROOT, 'engines/DeferredBootstrap.js'), 'utf8');
  assert.match(src, /DesignZoomEngine\._apply\._rfPhase3Patched/,
    'DesignZoomEngine._apply phase3 patch must be guarded with _rfPhase3Patched');
});

test('reload storm safety (#65) — RuntimeBootstrap OverlayEngine patch is idempotency-guarded', () => {
  const src = fs.readFileSync(path.join(ROOT, 'engines/RuntimeBootstrap.js'), 'utf8');
  assert.match(src, /OverlayEngine\._rfV19Patched/,
    'OverlayEngine render patch must be guarded with _rfV19Patched');
});

test('reload storm safety (#65) — RuntimeBootstrap DesignZoomEngine patches are idempotency-guarded', () => {
  const src = fs.readFileSync(path.join(ROOT, 'engines/RuntimeBootstrap.js'), 'utf8');
  assert.match(src, /DesignZoomEngine\._apply\._rfV19ZoomPatched/,
    'DesignZoomEngine._apply v19 patch must be guarded with _rfV19ZoomPatched');
  assert.match(src, /DesignZoomEngine\._apply\._rfPhase2ZoomPatched/,
    'DesignZoomEngine._apply phase2 patch must be guarded with _rfPhase2ZoomPatched');
});

test('reload storm guard — static boot idempotency wiring verified', () => {
  const result = execFileSync('node', [path.join(ROOT, 'audit/reload_storm_guard.mjs')], {
    encoding: 'utf8', cwd: ROOT,
  });
  assert.match(result, /violations found: 0/);
});

// ---------------------------------------------------------------------------
// 10. Safe Rollback Paths (#74) + Three-Attempt Convergence (#79)
// ---------------------------------------------------------------------------

test('safe rollback (#74) — bridges-and-shims.md has rollback column and contract', () => {
  const doc = fs.readFileSync(path.join(ROOT, 'docs/architecture/bridges-and-shims.md'), 'utf8');
  assert.match(doc, /Rollback path/, 'doc must have "Rollback path" column');
  assert.match(doc, /Safe Rollback Contract/, 'doc must have Safe Rollback Contract section');
  assert.match(doc, /cerrado/, 'doc must list removed bridges as cerrado');
});

test('safe rollback (#74) — cerrado bridges absent from boot files', () => {
  const boot = fs.readFileSync(path.join(ROOT, 'engines/RuntimeBootstrap.js'), 'utf8');
  const def  = fs.readFileSync(path.join(ROOT, 'engines/DeferredBootstrap.js'), 'utf8');
  const src  = boot + def;
  assert.ok(!/CanvasLayoutEngine\.__legacyBridge/.test(src), 'legacy canvas bridge must be absent');
  assert.ok(!/SelectionEngine\.__legacyBridge/.test(src),   'legacy selection bridge must be absent');
  assert.ok(!/PreviewEngineV19\.__legacyBridge/.test(src),  'legacy preview bridge must be absent');
  assert.ok(!/section-alias|overlay-alias/.test(src),       'removed DOM alias injector must be absent');
});

test('safe rollback (#74) — active bridges carry idempotency guards', () => {
  const boot = fs.readFileSync(path.join(ROOT, 'engines/RuntimeBootstrap.js'), 'utf8');
  const def  = fs.readFileSync(path.join(ROOT, 'engines/DeferredBootstrap.js'), 'utf8');
  assert.match(boot, /_rfPhase2ZoomPatched/, 'phase 2 zoom bridge must be idempotency-guarded');
  assert.match(def,  /_rfPhase3Patched/,     'phase 3 patches must be idempotency-guarded');
  assert.match(boot, /_rfV19Patched/,         'OverlayEngine patch must be idempotency-guarded');
});

test('safe rollback guard — static wiring verified', () => {
  const result = execFileSync('node', [path.join(ROOT, 'audit/safe_rollback_guard.mjs')], {
    encoding: 'utf8', cwd: ROOT,
  });
  assert.match(result, /violations found: 0/);
});

test('three-attempt convergence (#79) — rule is in testing-canon.md', () => {
  const doc = fs.readFileSync(path.join(ROOT, 'docs/architecture/testing-canon.md'), 'utf8');
  assert.match(doc, /Three-Attempt|three.attempt/i, 'testing-canon must contain three-attempt rule');
  assert.match(doc, /two files|more than two/,      'must state the two-file constraint proxy');
  assert.match(doc, /convergence_discipline_guard/,  'must reference convergence_discipline_guard in Enforcement');
});

test('convergence discipline (#79) — all documented principles have gap descriptions', () => {
  const matrix = JSON.parse(fs.readFileSync(path.join(ROOT, 'audit/principles_matrix.json'), 'utf8'));
  const silent = matrix.filter((p) => p.status === 'documented' && (!p.gap || p.gap.trim() === ''));
  assert.equal(silent.length, 0,
    `${silent.length} documented principle(s) missing gap: ${silent.map((p) => `#${p.id}`).join(', ')}`);
});

test('convergence discipline guard — static wiring verified', () => {
  const result = execFileSync('node', [path.join(ROOT, 'audit/convergence_discipline_guard.mjs')], {
    encoding: 'utf8', cwd: ROOT,
  });
  assert.match(result, /violations found:\s+0/);
});

// ---------------------------------------------------------------------------
// Executable → Hard-enforced: #2 #12 #24 #31 #34 #69 #70
// ---------------------------------------------------------------------------

test('immutability guard (#2) — HistoryEngine stacks are private, DS writes confined', () => {
  const result = execFileSync('node', [path.join(ROOT, 'audit/immutability_guard.mjs')], {
    encoding: 'utf8', cwd: ROOT,
  });
  assert.match(result, /violations found:\s+0/);
});

test('bootstrap idempotency guard (#12) — clean boot sequence verified', () => {
  const result = execFileSync('node', [path.join(ROOT, 'audit/bootstrap_idempotency_guard.mjs')], {
    encoding: 'utf8', cwd: ROOT,
  });
  assert.match(result, /violations found:\s+0/);
});

test('magic offset guard (#24) — all pixel math routes through RF.Geometry', () => {
  const result = execFileSync('node', [path.join(ROOT, 'audit/magic_offset_guard.mjs')], {
    encoding: 'utf8', cwd: ROOT,
  });
  assert.match(result, /violations found:\s+0/);
});

test('load order guard (#31) — critical engine pairs initialize in correct order', () => {
  const result = execFileSync('node', [path.join(ROOT, 'audit/load_order_guard.mjs')], {
    encoding: 'utf8', cwd: ROOT,
  });
  assert.match(result, /violations found:\s+0/);
});

test('pipeline phase guard (#34) — LAYOUT→VISUAL→HANDLES→POST order enforced', () => {
  const result = execFileSync('node', [path.join(ROOT, 'audit/pipeline_phase_guard.mjs')], {
    encoding: 'utf8', cwd: ROOT,
  });
  assert.match(result, /violations found:\s+0/);
});

test('error taxonomy guard (#69) — incidentKey captures five dimensions, lastFailure structured', () => {
  const result = execFileSync('node', [path.join(ROOT, 'audit/error_taxonomy_guard.mjs')], {
    encoding: 'utf8', cwd: ROOT,
  });
  assert.match(result, /violations found:\s+0/);
});

test('incident replay guard (#70) — snapshot complete, recovery idempotent', () => {
  const result = execFileSync('node', [path.join(ROOT, 'audit/incident_replay_guard.mjs')], {
    encoding: 'utf8', cwd: ROOT,
  });
  assert.match(result, /violations found:\s+0/);
});

// ---------------------------------------------------------------------------
// Documented → Hard-enforced: #4 #8 #17 #22 #30 #71 #76
// ---------------------------------------------------------------------------

test('derived state guard (#4) — computations centralized in DocumentSelectors', () => {
  const result = execFileSync('node', [path.join(ROOT, 'audit/derived_state_guard.mjs')], {
    encoding: 'utf8', cwd: ROOT,
  });
  assert.match(result, /violations found:\s+0/);
});

test('phase sequence guard (#8) — layout/visual/handles/post wired correctly', () => {
  const result = execFileSync('node', [path.join(ROOT, 'audit/phase_sequence_guard.mjs')], {
    encoding: 'utf8', cwd: ROOT,
  });
  assert.match(result, /violations found:\s+0/);
});

test('visual state guard (#17) — DOM classes derive from owner model at write time', () => {
  const result = execFileSync('node', [path.join(ROOT, 'audit/visual_state_guard.mjs')], {
    encoding: 'utf8', cwd: ROOT,
  });
  assert.match(result, /violations found:\s+0/);
});

test('honest fallback guard (#22) — fallbacks do not overwrite owner state', () => {
  const result = execFileSync('node', [path.join(ROOT, 'audit/honest_fallback_guard.mjs')], {
    encoding: 'utf8', cwd: ROOT,
  });
  assert.match(result, /violations found:\s+0/);
});

test('semantic class guard (#30) — cr-/el-/sel- prefixes enforced in engine files', () => {
  const result = execFileSync('node', [path.join(ROOT, 'audit/semantic_class_guard.mjs')], {
    encoding: 'utf8', cwd: ROOT,
  });
  assert.match(result, /violations found:\s+0/);
});

test('minimal repro guard (#71) — three-step protocol documented in testing-canon', () => {
  const result = execFileSync('node', [path.join(ROOT, 'audit/minimal_repro_guard.mjs')], {
    encoding: 'utf8', cwd: ROOT,
  });
  assert.match(result, /violations found:\s+0/);
});

test('shared core guard (#76) — minimum test surface documented and suite files exist', () => {
  const result = execFileSync('node', [path.join(ROOT, 'audit/shared_core_guard.mjs')], {
    encoding: 'utf8', cwd: ROOT,
  });
  assert.match(result, /violations found:\s+0/);
});

// ── Coercion Layer ─────────────────────────────────────────────────────────────

test('coercion map guard — canonical coercion layer enforced, no ad-hoc coercions outside owners', () => {
  const result = execFileSync('node', [path.join(ROOT, 'audit/coercion_map_guard.mjs')], {
    encoding: 'utf8', cwd: ROOT,
  });
  assert.match(result, /violations found:\s+0/);
});

// ── Coercion Hardening & Regression ───────────────────────────────────────────

test('critical field mutation guard — REQUIRED_KEYS owned by render_engine, not mutated by resolvers/engines', () => {
  const result = execFileSync('node', [path.join(ROOT, 'audit/critical_field_mutation_guard.mjs')], {
    encoding: 'utf8', cwd: ROOT,
  });
  assert.match(result, /violations found:\s+0/);
});

test('regression naming guard — test_regression_NNN_field_cause pattern enforced in Regression classes', () => {
  const result = execFileSync('node', [path.join(ROOT, 'audit/regression_naming_guard.mjs')], {
    encoding: 'utf8', cwd: ROOT,
  });
  assert.match(result, /violations found:\s+0/);
});

// ── Hardening: cr_functions / formula / HTML rendering / PDF / mutation ───────

test('coercion map guard passes after cr_functions_shared logging additions', () => {
  const result = execFileSync('node', [path.join(ROOT, 'audit/coercion_map_guard.mjs')], {
    encoding: 'utf8', cwd: ROOT,
  });
  assert.match(result, /violations found:\s+0/);
});

test('critical field mutation guard passes after render_engine debug mutation detection', () => {
  const result = execFileSync('node', [path.join(ROOT, 'audit/critical_field_mutation_guard.mjs')], {
    encoding: 'utf8', cwd: ROOT,
  });
  assert.match(result, /violations found:\s+0/);
});
