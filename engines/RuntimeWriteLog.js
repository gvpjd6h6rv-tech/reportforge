'use strict';

/**
 * engines/RuntimeWriteLog.js
 *
 * Runtime write-log for centralized state mutations.
 * Records every write to a named field with its source, value, timestamp,
 * render phase, and optional stack trace.
 *
 * Design invariants:
 *   - recordWrite() throws HARD on missing source or source === 'UNKNOWN'.
 *     There is no silent downgrade. A write without attribution is a bug.
 *   - No logs at module-load time.  Only real runtime writes are recorded.
 *   - getLastWriter() returns null when a field has never been written.
 *     It NEVER invents a reader/writer — UNKNOWN is a throw, not a return value.
 *   - Phase guard is opt-in (off by default).  Enable with setPhaseGuard('warn')
 *     for observability or setPhaseGuard('throw') for strict enforcement.
 *
 * Critical fields (writes without source = immediate hard throw):
 *   zoom, zoomDesign, zoomPreview, tool, previewMode,
 *   sections, elements, selection, pageMarginLeft, pageMarginTop
 *
 * Phase guard: each critical field has an allowed-phase set.  A write that
 * arrives in a disallowed phase is a reentrance or ordering bug.
 *
 * Usage in DocumentActions (browser):
 *   RuntimeWriteLog.recordWrite({ field: 'zoom', value: z, source: 'ZoomEngine.set' });
 *
 * Usage in tests (Node.js):
 *   const { RuntimeWriteLog } = require('./engines/RuntimeWriteLog.js');
 *   RuntimeWriteLog.clearWrites();
 *   RuntimeWriteLog.recordWrite({ field: 'zoom', value: 1.5, source: 'test' });
 */

const RuntimeWriteLog = (() => {

  // ── Critical fields ─────────────────────────────────────────────────────────
  // A write to any of these without a declared source is a hard failure.
  // A CI gate checks that every critical field has at least one recorded writer.
  const CRITICAL_FIELDS = Object.freeze(new Set([
    'zoom', 'zoomDesign', 'zoomPreview',
    'tool', 'previewMode',
    'sections', 'elements', 'selection',
    'pageMarginLeft', 'pageMarginTop',
  ]));

  // ── Valid render phases ─────────────────────────────────────────────────────
  const VALID_PHASES = Object.freeze(new Set([
    'layout', 'visual', 'handles', 'post',
    'flushSync', 'init', 'command',
    'undo', 'redo', 'test',
  ]));

  // ── Per-field allowed-phase sets ────────────────────────────────────────────
  // A write to a critical field from an unlisted phase is a potential reentrance
  // or ordering bug.  Omitting a field means any phase is accepted.
  const FIELD_PHASE_ALLOW = Object.freeze({
    zoom:           new Set(['layout', 'command', 'init', 'test', 'undo', 'redo', 'flushSync']),
    zoomDesign:     new Set(['layout', 'command', 'init', 'test', 'undo', 'redo', 'flushSync']),
    zoomPreview:    new Set(['layout', 'command', 'init', 'test', 'undo', 'redo', 'flushSync']),
    tool:           new Set(['command', 'init', 'test', 'flushSync']),
    previewMode:    new Set(['command', 'init', 'test', 'flushSync']),
    sections:       new Set(['layout', 'command', 'init', 'test', 'undo', 'redo', 'flushSync']),
    elements:       new Set(['layout', 'command', 'init', 'test', 'undo', 'redo', 'flushSync']),
    selection:      new Set(['layout', 'visual', 'command', 'init', 'test', 'flushSync']),
    pageMarginLeft: new Set(['layout', 'command', 'init', 'test', 'flushSync']),
    pageMarginTop:  new Set(['layout', 'command', 'init', 'test', 'flushSync']),
  });

  // ── Internal state ──────────────────────────────────────────────────────────
  let _writes          = [];    // Array<WriteEntry>
  let _phaseViolations = [];    // Array<PhaseViolation>
  let _phaseGuardMode  = 'off'; // 'off' | 'warn' | 'throw'

  // ── Timestamp helper ────────────────────────────────────────────────────────
  function _now() {
    return (typeof performance !== 'undefined' && typeof performance.now === 'function')
      ? performance.now()
      : Date.now();
  }

  // ── recordWrite ─────────────────────────────────────────────────────────────
  /**
   * recordWrite({ field, value, source, timestamp?, phase?, stack? })
   *
   * Throws immediately if:
   *   - source is missing / falsy
   *   - source === 'UNKNOWN'
   *   - field is missing
   *   - phaseGuard is 'throw' and phase is not in FIELD_PHASE_ALLOW[field]
   */
  function recordWrite({ field, value, source, timestamp, phase, stack } = {}) {
    if (!field) {
      throw new Error('[RuntimeWriteLog] MISSING FIELD — recordWrite requires a field name');
    }
    if (!source) {
      throw new Error(
        `[RuntimeWriteLog] MISSING SOURCE for field="${field}" — every write must declare its owner.\n` +
        `  Pass source as the module/function that owns this mutation (e.g. "ZoomEngine.set").`
      );
    }
    if (source === 'UNKNOWN') {
      throw new Error(
        `[RuntimeWriteLog] FORBIDDEN SOURCE "UNKNOWN" for field="${field}" — resolve the real writer.\n` +
        `  Do not use "UNKNOWN" as a source: find the actual caller and name it.`
      );
    }

    // Phase guard
    if (_phaseGuardMode !== 'off' && phase != null) {
      const allowed = FIELD_PHASE_ALLOW[field];
      if (allowed && !allowed.has(phase)) {
        const violation = {
          field,
          source,
          phase,
          timestamp: typeof timestamp === 'number' ? timestamp : _now(),
          detail: `"${field}" written by "${source}" during phase "${phase}" — allowed: [${[...allowed].join(', ')}]`,
        };
        _phaseViolations.push(violation);
        if (_phaseGuardMode === 'throw') {
          throw new Error(`[RuntimeWriteLog] PHASE VIOLATION — ${violation.detail}`);
        }
        // 'warn' mode: record and continue
      }
    }

    _writes.push({
      field:     String(field),
      value,
      source:    String(source),
      timestamp: typeof timestamp === 'number' ? timestamp : _now(),
      phase:     phase ?? null,
      stack:     stack ?? null,
    });
  }

  // ── getWrites ────────────────────────────────────────────────────────────────
  /** Returns all recorded writes, optionally filtered by field. */
  function getWrites(field) {
    if (field === undefined || field === null) return _writes.slice();
    return _writes.filter(w => w.field === String(field));
  }

  // ── getLastWriter ────────────────────────────────────────────────────────────
  /**
   * Returns the last WriteEntry for field, or null if no writes recorded.
   * NEVER invents a writer — returns null when data is absent.
   */
  function getLastWriter(field) {
    const writes = getWrites(field);
    return writes.length > 0 ? writes[writes.length - 1] : null;
  }

  // ── getPhaseViolations ───────────────────────────────────────────────────────
  function getPhaseViolations() {
    return _phaseViolations.slice();
  }

  // ── clearWrites ──────────────────────────────────────────────────────────────
  /** Reset all recorded writes and phase violations. Use between tests. */
  function clearWrites() {
    _writes          = [];
    _phaseViolations = [];
  }

  // ── setPhaseGuard ────────────────────────────────────────────────────────────
  /**
   * Enable or disable phase enforcement.
   *   'off'   — phase is recorded but never checked (default)
   *   'warn'  — phase violations are recorded in getPhaseViolations()
   *   'throw' — phase violations throw immediately
   */
  function setPhaseGuard(mode) {
    if (mode !== 'off' && mode !== 'warn' && mode !== 'throw') {
      throw new Error(`[RuntimeWriteLog] invalid phaseGuard mode: "${mode}" — expected 'off' | 'warn' | 'throw'`);
    }
    _phaseGuardMode = mode;
  }

  // ── summary ──────────────────────────────────────────────────────────────────
  /**
   * Returns a structured debug summary for each field, plus unowned critical
   * fields and any phase violations.  Suitable for JSON export or the CI gate.
   *
   * Per-field output:
   *   writeCount, lastWriter, sources[], phases[], isCritical, lastWrite
   *   readers: always 'UNKNOWN' — readers are not instrumented; never invented.
   */
  function summary() {
    const byField = {};
    for (const w of _writes) {
      if (!byField[w.field]) byField[w.field] = [];
      byField[w.field].push(w);
    }

    const fields = {};
    for (const [f, writes] of Object.entries(byField)) {
      fields[f] = {
        writeCount:  writes.length,
        lastWriter:  writes[writes.length - 1].source,
        sources:     [...new Set(writes.map(w => w.source))],
        phases:      [...new Set(writes.map(w => w.phase).filter(Boolean))],
        isCritical:  CRITICAL_FIELDS.has(f),
        // Readers are never instrumented in this system — never invent them.
        readers:     'UNKNOWN — no reader instrumentation',
        lastWrite:   writes[writes.length - 1],
      };
    }

    // Critical fields with zero writes = no recorded owner
    const unownedCritical = [...CRITICAL_FIELDS]
      .filter(f => !byField[f])
      .map(f => ({
        field:  f,
        issue:  'no-owner',
        detail: `critical field "${f}" has no recorded writes — owner unknown`,
      }));

    return {
      totalWrites:     _writes.length,
      phaseGuardMode:  _phaseGuardMode,
      fields,
      unownedCritical,
      phaseViolations: _phaseViolations.slice(),
    };
  }

  // ── assertComplete ────────────────────────────────────────────────────────────
  /**
   * Throws if:
   *   - any critical field has no recorded owner
   *   - any phase violations were recorded
   *
   * Use in CI or in the finalizer of a test suite to enforce full traceability.
   */
  function assertComplete() {
    const s = summary();
    const errors = [];

    for (const u of s.unownedCritical) {
      errors.push(`UNOWNED CRITICAL FIELD: ${u.detail}`);
    }
    for (const v of s.phaseViolations) {
      errors.push(`PHASE VIOLATION: ${v.detail}`);
    }

    if (errors.length > 0) {
      throw new Error(
        `[RuntimeWriteLog] completeness check FAILED:\n` +
        errors.map(e => `  · ${e}`).join('\n')
      );
    }
    return true;
  }

  // ── Public API ───────────────────────────────────────────────────────────────
  return {
    recordWrite,
    getWrites,
    getLastWriter,
    getPhaseViolations,
    clearWrites,
    setPhaseGuard,
    summary,
    assertComplete,
    // Exported for audit tooling and tests
    CRITICAL_FIELDS,
    VALID_PHASES,
    FIELD_PHASE_ALLOW,
  };
})();

if (typeof module !== 'undefined') module.exports = { RuntimeWriteLog };
if (typeof globalThis !== 'undefined') globalThis.RuntimeWriteLog = RuntimeWriteLog;
