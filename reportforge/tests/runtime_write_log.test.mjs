'use strict';
/**
 * runtime_write_log.test.mjs
 *
 * Adversarial unit tests for engines/RuntimeWriteLog.js.
 * No browser — loads the module directly in Node.js.
 *
 * Covers:
 *   - Missing source → hard throw
 *   - source "UNKNOWN" → hard throw
 *   - Missing field → hard throw
 *   - Valid write is recorded with all fields
 *   - Multiple writers are ordered (oldest first, last = last writer)
 *   - getLastWriter returns the last real writer, never invents one
 *   - getLastWriter returns null (not UNKNOWN) when field has no writes
 *   - summary() readers are always 'UNKNOWN', never invented
 *   - clearWrites() resets state between tests
 *   - Phase guard: 'off' records phase but never blocks
 *   - Phase guard: 'warn' records violation, does not throw
 *   - Phase guard: 'throw' throws on disallowed phase
 *   - Phase guard: invalid mode throws
 *   - assertComplete() throws when critical field has no owner
 *   - assertComplete() throws when phase violations recorded
 *   - assertComplete() passes when all critical fields have writers
 *   - getPhaseViolations() returns copy (not live reference)
 *   - Phase not in FIELD_PHASE_ALLOW triggers violation
 *   - Phase that IS in FIELD_PHASE_ALLOW does NOT trigger violation
 *   - summary() fields block lists isCritical correctly
 *   - summary() unownedCritical lists exactly the fields with no writes
 *   - CRITICAL_FIELDS export matches module enforcement
 */

import test   from 'node:test';
import assert from 'node:assert/strict';
import path   from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { RuntimeWriteLog: RWL } = await import(`${ROOT}/engines/RuntimeWriteLog.js`);

// ── Helper: always start from clean state ───────────────────────────────────
function fresh() {
  RWL.clearWrites();
  RWL.setPhaseGuard('off');
}

// ═══════════════════════════════════════════════════════════════════════════════
// Hard failures on bad input
// ═══════════════════════════════════════════════════════════════════════════════

test('missing source → throws immediately (not a silent pass)', () => {
  fresh();
  assert.throws(
    () => RWL.recordWrite({ field: 'zoom', value: 1.5 }),
    (err) => err instanceof Error && err.message.includes('MISSING SOURCE') && err.message.includes('"zoom"'),
  );
  assert.equal(RWL.getWrites().length, 0, 'no write must be recorded on throw');
});

test('source "UNKNOWN" → throws immediately', () => {
  fresh();
  assert.throws(
    () => RWL.recordWrite({ field: 'zoom', value: 1.5, source: 'UNKNOWN' }),
    (err) => err instanceof Error && err.message.includes('FORBIDDEN SOURCE') && err.message.includes('"zoom"'),
  );
});

test('empty string source → throws (falsy)', () => {
  fresh();
  assert.throws(
    () => RWL.recordWrite({ field: 'zoom', value: 1.5, source: '' }),
    (err) => err instanceof Error && err.message.includes('MISSING SOURCE'),
  );
});

test('missing field → throws', () => {
  fresh();
  assert.throws(
    () => RWL.recordWrite({ value: 1.5, source: 'ZoomEngine' }),
    (err) => err instanceof Error && err.message.includes('MISSING FIELD'),
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// Successful writes are recorded correctly
// ═══════════════════════════════════════════════════════════════════════════════

test('valid write is recorded with field, value, source, timestamp', () => {
  fresh();
  const before = Date.now();
  RWL.recordWrite({ field: 'zoom', value: 1.5, source: 'ZoomEngine.set' });
  const writes = RWL.getWrites('zoom');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].field,  'zoom');
  assert.equal(writes[0].value,  1.5);
  assert.equal(writes[0].source, 'ZoomEngine.set');
  assert.ok(typeof writes[0].timestamp === 'number', 'timestamp must be a number');
  assert.ok(writes[0].timestamp >= 0, 'timestamp must be non-negative');
});

test('write records phase when provided', () => {
  fresh();
  RWL.recordWrite({ field: 'zoom', value: 1.0, source: 'ZoomEngine', phase: 'layout' });
  assert.equal(RWL.getWrites('zoom')[0].phase, 'layout');
});

test('write records null phase when omitted', () => {
  fresh();
  RWL.recordWrite({ field: 'tool', value: 'pointer', source: 'InsertEngine.select' });
  assert.equal(RWL.getWrites('tool')[0].phase, null);
});

test('explicit timestamp is preserved', () => {
  fresh();
  RWL.recordWrite({ field: 'zoom', value: 2.0, source: 'ZoomEngine', timestamp: 999.5 });
  assert.equal(RWL.getWrites('zoom')[0].timestamp, 999.5);
});

// ═══════════════════════════════════════════════════════════════════════════════
// Multiple writers are ordered correctly
// ═══════════════════════════════════════════════════════════════════════════════

test('multiple writers are recorded in order (oldest first)', () => {
  fresh();
  RWL.recordWrite({ field: 'zoom', value: 1.0, source: 'ZoomEngine.init', timestamp: 1 });
  RWL.recordWrite({ field: 'zoom', value: 1.5, source: 'ZoomEngine.set',  timestamp: 2 });
  RWL.recordWrite({ field: 'zoom', value: 2.0, source: 'CommandRuntime',  timestamp: 3 });
  const writes = RWL.getWrites('zoom');
  assert.equal(writes.length, 3);
  assert.equal(writes[0].source, 'ZoomEngine.init');
  assert.equal(writes[1].source, 'ZoomEngine.set');
  assert.equal(writes[2].source, 'CommandRuntime');
});

test('getLastWriter returns the most recent write entry', () => {
  fresh();
  RWL.recordWrite({ field: 'zoom', value: 1.0, source: 'ZoomEngine.init', timestamp: 1 });
  RWL.recordWrite({ field: 'zoom', value: 2.0, source: 'CommandRuntime',  timestamp: 2 });
  const last = RWL.getLastWriter('zoom');
  assert.equal(last.source, 'CommandRuntime');
  assert.equal(last.value,  2.0);
});

// ═══════════════════════════════════════════════════════════════════════════════
// getLastWriter never invents a writer
// ═══════════════════════════════════════════════════════════════════════════════

test('getLastWriter returns null (not UNKNOWN) when field has no writes', () => {
  fresh();
  const result = RWL.getLastWriter('zoom');
  assert.equal(result, null, 'must return null, not a string "UNKNOWN" or any invented value');
});

test('getLastWriter returns null for a field that was never written', () => {
  fresh();
  RWL.recordWrite({ field: 'tool', value: 'pointer', source: 'InsertEngine' });
  // zoom was never written
  assert.equal(RWL.getLastWriter('zoom'), null);
});

// ═══════════════════════════════════════════════════════════════════════════════
// summary() readers are always UNKNOWN — never invented
// ═══════════════════════════════════════════════════════════════════════════════

test('summary readers field is always "UNKNOWN" string — never invented data', () => {
  fresh();
  RWL.recordWrite({ field: 'zoom', value: 1.0, source: 'ZoomEngine' });
  const s = summary();
  assert.ok(
    typeof s.fields.zoom.readers === 'string' && s.fields.zoom.readers.includes('UNKNOWN'),
    `readers must be the UNKNOWN sentinel string, got: ${JSON.stringify(s.fields.zoom.readers)}`,
  );
});

test('summary reports all sources for a field that had multiple writers', () => {
  fresh();
  RWL.recordWrite({ field: 'zoom', value: 1.0, source: 'ZoomEngine.init' });
  RWL.recordWrite({ field: 'zoom', value: 1.5, source: 'CommandRuntime.zoom' });
  RWL.recordWrite({ field: 'zoom', value: 2.0, source: 'ZoomEngine.init' }); // duplicate source
  const s = summary();
  // sources are deduplicated
  assert.deepEqual(s.fields.zoom.sources.sort(), ['CommandRuntime.zoom', 'ZoomEngine.init'].sort());
  assert.equal(s.fields.zoom.writeCount, 3);
});

// ═══════════════════════════════════════════════════════════════════════════════
// clearWrites resets state cleanly between tests
// ═══════════════════════════════════════════════════════════════════════════════

test('clearWrites removes all recorded writes', () => {
  fresh();
  RWL.recordWrite({ field: 'zoom', value: 1.5, source: 'ZoomEngine' });
  RWL.recordWrite({ field: 'tool', value: 'pointer', source: 'InsertEngine' });
  RWL.clearWrites();
  assert.equal(RWL.getWrites().length,     0);
  assert.equal(RWL.getLastWriter('zoom'),  null);
  assert.equal(RWL.getLastWriter('tool'),  null);
});

test('clearWrites also clears phase violations', () => {
  fresh();
  RWL.setPhaseGuard('warn');
  // 'tool' is not allowed in 'visual' phase
  RWL.recordWrite({ field: 'tool', value: 'pointer', source: 'InsertEngine', phase: 'visual' });
  assert.equal(RWL.getPhaseViolations().length, 1);
  RWL.clearWrites();
  assert.equal(RWL.getPhaseViolations().length, 0);
});

// ═══════════════════════════════════════════════════════════════════════════════
// Phase guard: 'off' mode
// ═══════════════════════════════════════════════════════════════════════════════

test('phaseGuard off — records write even for disallowed phase, no violation', () => {
  fresh();
  RWL.setPhaseGuard('off');
  // 'tool' is only allowed in command/init/test/flushSync, not 'visual'
  RWL.recordWrite({ field: 'tool', value: 'pointer', source: 'InsertEngine', phase: 'visual' });
  assert.equal(RWL.getWrites('tool').length, 1);
  assert.equal(RWL.getPhaseViolations().length, 0);
});

// ═══════════════════════════════════════════════════════════════════════════════
// Phase guard: 'warn' mode
// ═══════════════════════════════════════════════════════════════════════════════

test('phaseGuard warn — records violation but does NOT throw', () => {
  fresh();
  RWL.setPhaseGuard('warn');
  assert.doesNotThrow(() => {
    RWL.recordWrite({ field: 'tool', value: 'pointer', source: 'InsertEngine', phase: 'visual' });
  });
  const violations = RWL.getPhaseViolations();
  assert.equal(violations.length, 1);
  assert.equal(violations[0].field,  'tool');
  assert.equal(violations[0].source, 'InsertEngine');
  assert.equal(violations[0].phase,  'visual');
  assert.ok(violations[0].detail.includes('"tool"'));
  // Write was still recorded
  assert.equal(RWL.getWrites('tool').length, 1);
});

test('phaseGuard warn — allowed phase does NOT produce violation', () => {
  fresh();
  RWL.setPhaseGuard('warn');
  // 'command' is allowed for 'tool'
  RWL.recordWrite({ field: 'tool', value: 'text', source: 'InsertEngine', phase: 'command' });
  assert.equal(RWL.getPhaseViolations().length, 0);
});

// ═══════════════════════════════════════════════════════════════════════════════
// Phase guard: 'throw' mode
// ═══════════════════════════════════════════════════════════════════════════════

test('phaseGuard throw — throws on disallowed phase', () => {
  fresh();
  RWL.setPhaseGuard('throw');
  assert.throws(
    () => RWL.recordWrite({ field: 'tool', value: 'pointer', source: 'InsertEngine', phase: 'visual' }),
    (err) => err instanceof Error && err.message.includes('PHASE VIOLATION') && err.message.includes('"tool"'),
  );
});

test('phaseGuard throw — does NOT throw on allowed phase', () => {
  fresh();
  RWL.setPhaseGuard('throw');
  assert.doesNotThrow(() => {
    RWL.recordWrite({ field: 'sections', value: [], source: 'HistoryEngine.restore', phase: 'undo' });
  });
});

test('phaseGuard throw — zoom allowed in layout phase', () => {
  fresh();
  RWL.setPhaseGuard('throw');
  assert.doesNotThrow(() => {
    RWL.recordWrite({ field: 'zoom', value: 1.5, source: 'ZoomEngine', phase: 'layout' });
  });
});

test('phaseGuard throw — zoom NOT allowed in visual phase', () => {
  fresh();
  RWL.setPhaseGuard('throw');
  assert.throws(
    () => RWL.recordWrite({ field: 'zoom', value: 1.5, source: 'ZoomEngine', phase: 'visual' }),
    (err) => err.message.includes('PHASE VIOLATION'),
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// Phase guard: invalid mode
// ═══════════════════════════════════════════════════════════════════════════════

test('setPhaseGuard with invalid mode throws', () => {
  fresh();
  assert.throws(
    () => RWL.setPhaseGuard('aggressive'),
    (err) => err instanceof Error && err.message.includes('invalid phaseGuard mode'),
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// Phase guard: null/undefined phase bypasses phase check entirely
// ═══════════════════════════════════════════════════════════════════════════════

test('phaseGuard throw — null phase is not checked (phase-unaware path)', () => {
  fresh();
  RWL.setPhaseGuard('throw');
  assert.doesNotThrow(() => {
    RWL.recordWrite({ field: 'tool', value: 'pointer', source: 'InsertEngine', phase: null });
  });
});

test('phaseGuard throw — undefined phase is not checked', () => {
  fresh();
  RWL.setPhaseGuard('throw');
  assert.doesNotThrow(() => {
    RWL.recordWrite({ field: 'tool', value: 'pointer', source: 'InsertEngine' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// assertComplete
// ═══════════════════════════════════════════════════════════════════════════════

test('assertComplete throws when a critical field has no recorded writes', () => {
  fresh();
  // Only write to one critical field, leave others unowned
  RWL.recordWrite({ field: 'zoom', value: 1.0, source: 'ZoomEngine' });
  assert.throws(
    () => RWL.assertComplete(),
    (err) => err instanceof Error && err.message.includes('UNOWNED CRITICAL FIELD'),
  );
});

test('assertComplete throws with phase violations present', () => {
  fresh();
  // Write all critical fields
  const source = 'test-setup';
  for (const f of RWL.CRITICAL_FIELDS) {
    RWL.recordWrite({ field: f, value: null, source });
  }
  // Inject a phase violation manually via warn mode
  RWL.setPhaseGuard('warn');
  RWL.recordWrite({ field: 'tool', value: 'x', source: 'test', phase: 'visual' });
  assert.throws(
    () => RWL.assertComplete(),
    (err) => err instanceof Error && err.message.includes('PHASE VIOLATION'),
  );
});

test('assertComplete passes when all critical fields have at least one writer', () => {
  fresh();
  for (const f of RWL.CRITICAL_FIELDS) {
    RWL.recordWrite({ field: f, value: null, source: `test-owner-${f}` });
  }
  assert.doesNotThrow(() => RWL.assertComplete());
});

// ═══════════════════════════════════════════════════════════════════════════════
// summary() structure
// ═══════════════════════════════════════════════════════════════════════════════

test('summary unownedCritical lists exactly the fields with no writes', () => {
  fresh();
  RWL.recordWrite({ field: 'zoom', value: 1.0, source: 'ZoomEngine' });
  const s = summary();
  const unownedIds = s.unownedCritical.map(u => u.field);
  // zoom was written, all others were not
  assert.ok(!unownedIds.includes('zoom'), 'zoom should NOT be unowned');
  for (const f of RWL.CRITICAL_FIELDS) {
    if (f !== 'zoom') {
      assert.ok(unownedIds.includes(f), `${f} should be in unownedCritical`);
    }
  }
});

test('summary marks isCritical correctly', () => {
  fresh();
  RWL.recordWrite({ field: 'zoom',       value: 1.0, source: 'ZoomEngine' });
  RWL.recordWrite({ field: 'gridVisible', value: true, source: 'GridEngine' });
  const s = summary();
  assert.equal(s.fields.zoom.isCritical,        true);
  assert.equal(s.fields.gridVisible.isCritical, false);
});

test('summary totalWrites reflects actual count', () => {
  fresh();
  RWL.recordWrite({ field: 'zoom', value: 1.0, source: 'A' });
  RWL.recordWrite({ field: 'zoom', value: 1.5, source: 'B' });
  RWL.recordWrite({ field: 'tool', value: 'x', source: 'C' });
  assert.equal(summary().totalWrites, 3);
});

// ═══════════════════════════════════════════════════════════════════════════════
// getPhaseViolations returns a copy (mutations don't affect internal state)
// ═══════════════════════════════════════════════════════════════════════════════

test('getPhaseViolations returns a copy — mutating it does not affect internal state', () => {
  fresh();
  RWL.setPhaseGuard('warn');
  RWL.recordWrite({ field: 'tool', value: 'x', source: 'I', phase: 'visual' });
  const v1 = RWL.getPhaseViolations();
  v1.push({ injected: true });
  const v2 = RWL.getPhaseViolations();
  assert.equal(v2.length, 1, 'internal state must not be affected by mutating the returned copy');
});

// ═══════════════════════════════════════════════════════════════════════════════
// CRITICAL_FIELDS export matches enforcement
// ═══════════════════════════════════════════════════════════════════════════════

test('CRITICAL_FIELDS export contains the expected fields', () => {
  const expected = [
    'zoom', 'zoomDesign', 'zoomPreview',
    'tool', 'previewMode',
    'sections', 'elements', 'selection',
    'pageMarginLeft', 'pageMarginTop',
  ];
  for (const f of expected) {
    assert.ok(RWL.CRITICAL_FIELDS.has(f), `expected CRITICAL_FIELDS to contain "${f}"`);
  }
});

test('CRITICAL_FIELDS is a Set (not an array or plain object)', () => {
  // Object.freeze on a Set prevents property reassignment but not .add() calls
  // (JS limitation).  The meaningful guarantee is that it is a real Set with the
  // expected members — tested in the previous test.
  assert.ok(RWL.CRITICAL_FIELDS instanceof Set, 'CRITICAL_FIELDS must be a Set');
});

// ═══════════════════════════════════════════════════════════════════════════════
// getWrites without argument returns all writes
// ═══════════════════════════════════════════════════════════════════════════════

test('getWrites() with no argument returns all writes across all fields', () => {
  fresh();
  RWL.recordWrite({ field: 'zoom', value: 1.0, source: 'A' });
  RWL.recordWrite({ field: 'tool', value: 'x', source: 'B' });
  assert.equal(RWL.getWrites().length, 2);
});

test('getWrites(field) returns only writes for that field', () => {
  fresh();
  RWL.recordWrite({ field: 'zoom', value: 1.0, source: 'A' });
  RWL.recordWrite({ field: 'tool', value: 'x', source: 'B' });
  RWL.recordWrite({ field: 'zoom', value: 2.0, source: 'C' });
  assert.equal(RWL.getWrites('zoom').length, 2);
  assert.equal(RWL.getWrites('tool').length, 1);
});

// ── helper: avoid re-typing every time ─────────────────────────────────────
function summary() { return RWL.summary(); }
