'use strict';

function createEngineCoreRuntime(deps = {}) {
  const state = deps.state || {};
  const getEngine = typeof deps.getEngine === 'function' ? deps.getEngine : () => null;
  const cloneSerializable = typeof deps.cloneSerializable === 'function'
    ? deps.cloneSerializable
    : (value) => JSON.parse(JSON.stringify(value));
  const emitRuntimeEvent = typeof deps.emitRuntimeEvent === 'function' ? deps.emitRuntimeEvent : () => {};
  const trace = typeof deps.trace === 'function' ? deps.trace : () => {};
  const summarizeContracts = typeof deps.summarizeContracts === 'function'
    ? deps.summarizeContracts
    : (contracts) => contracts;
  const snapshotSections = typeof deps.snapshotSections === 'function' ? deps.snapshotSections : () => [];
  const snapshotElements = typeof deps.snapshotElements === 'function' ? deps.snapshotElements : () => [];
  const snapshotContracts = typeof deps.snapshotContracts === 'function' ? deps.snapshotContracts : () => ({});
  const validateSectionContract = typeof deps.validateSectionContract === 'function'
    ? deps.validateSectionContract
    : () => {};
  const validateCanvasContract = typeof deps.validateCanvasContract === 'function'
    ? deps.validateCanvasContract
    : () => {};
  const validateScrollContract = typeof deps.validateScrollContract === 'function'
    ? deps.validateScrollContract
    : () => {};
  const validateCanonicalRuntime = typeof deps.validateCanonicalRuntime === 'function'
    ? deps.validateCanonicalRuntime
    : () => {};
  const assertSelectionState = typeof deps.assertSelectionState === 'function'
    ? deps.assertSelectionState
    : () => {};
  const assertZoomContract = typeof deps.assertZoomContract === 'function'
    ? deps.assertZoomContract
    : () => {};
  const getPointer = typeof deps.getPointer === 'function' ? deps.getPointer : () => ({ x: 0, y: 0 });
  const runtimeServices = deps.runtimeServices || null;

  function normalizeError(error) {
    if (!error) return null;
    return {
      name: error.name || 'Error',
      message: error.message || String(error),
      stack: error.stack || null,
    };
  }

  function incidentKey(reason, error, meta) {
    const normalized = normalizeError(error);
    return JSON.stringify({
      reason: reason || 'runtime_failure',
      name: normalized ? normalized.name : 'Error',
      message: normalized ? normalized.message : '',
      phase: meta && meta.phase ? meta.phase : '',
      priority: meta && typeof meta.priority !== 'undefined' ? meta.priority : '',
    });
  }

  function buildRuntimeSnapshot(reason) {
    const snapshot = {
      version: 'phase3-runtime-v1',
      reason: reason || 'runtime',
      timestamp: new Date().toISOString(),
      frame: getEngine('RenderScheduler') && typeof getEngine('RenderScheduler').frame === 'number'
        ? getEngine('RenderScheduler').frame
        : null,
      zoom: typeof RF !== 'undefined' && RF.Geometry && typeof RF.Geometry.zoom === 'function'
        ? RF.Geometry.zoom()
        : (typeof DS !== 'undefined' ? DS.zoom : 1),
      pointer: cloneSerializable(deps.getPointer ? deps.getPointer() : getPointer()),
      safeMode: cloneSerializable(state.runtime.safeMode),
      debugFlags: cloneSerializable(state.runtime.debugFlags),
      pipeline: cloneSerializable(state.runtime.pipeline),
      ds: {
        sectionCount: typeof DS !== 'undefined' && Array.isArray(DS.sections) ? DS.sections.length : 0,
        elementCount: typeof DS !== 'undefined' && Array.isArray(DS.elements) ? DS.elements.length : 0,
        selectedIds: typeof DS !== 'undefined' && DS.selection ? [...DS.selection] : [],
        sections: snapshotSections(),
        elements: snapshotElements(),
      },
      contracts: cloneSerializable(snapshotContracts()),
    };
    state.runtime.pipeline.lastSnapshotAt = snapshot.timestamp;
    return snapshot;
  }

  function recordInvariantReport(report) {
    const clonedReport = cloneSerializable(report || {});
    const normalizedIssues = Array.isArray(clonedReport.issues)
      ? clonedReport.issues.filter(Boolean)
      : [];
    const storedReport = {
      ...clonedReport,
      issues: normalizedIssues,
      ok: normalizedIssues.length === 0,
    };

    trace('EngineCore', 'invariant-report', {
      ok: storedReport.ok,
      issuesLength: normalizedIssues.length,
      issueCodes: normalizedIssues.map((issue) => issue.code),
      timestamp: storedReport.timestamp,
    }, storedReport.phase, storedReport.meta && storedReport.meta.frame);

    state.runtime.pipeline.lastInvariantReport = storedReport;
    if (storedReport.ok === false && typeof console !== 'undefined') {
      const warningReport = cloneSerializable(storedReport);
      state.runtime.pipeline.lastWarningReport = warningReport;
      const issueCodes = normalizedIssues.map((issue) => issue.code);
      const warningKey = JSON.stringify({
        frame: storedReport.meta && typeof storedReport.meta.frame !== 'undefined' ? storedReport.meta.frame : null,
        phase: storedReport.phase,
        codes: issueCodes,
      });
      if (state.runtime.lastWarningKey !== warningKey) {
        state.runtime.lastWarningKey = warningKey;
        console.warn(`[EngineCore] Runtime invariants warning at ${storedReport.phase}`, {
          source: '_recordInvariantReport',
          frame: storedReport.meta && typeof storedReport.meta.frame !== 'undefined'
            ? storedReport.meta.frame
            : null,
          phase: storedReport.phase,
          timestamp: storedReport.timestamp,
          ok: storedReport.ok,
          issuesLength: normalizedIssues.length,
          issueCodes,
          report: warningReport,
        });
      }
    }
    if (state.runtime.debugFlags.trace && typeof console !== 'undefined') {
      console.debug('[EngineCore] invariant report', storedReport);
    }
    emitRuntimeEvent('rf:runtime-invariants', storedReport);
  }

  function beginFrame(meta) {
    state.runtime.pipeline.lastFrameMeta = cloneSerializable(meta);
    if (state.runtime.debugFlags.trace && typeof console !== 'undefined') {
      console.debug('[EngineCore] frame begin', meta);
    }
  }

  function completeFrame(meta) {
    state.runtime.pipeline.lastFrameMeta = cloneSerializable(meta);
    emitRuntimeEvent('rf:runtime-frame', state.runtime.pipeline.lastFrameMeta);
    if (state.runtime.debugFlags.trace && typeof console !== 'undefined') {
      console.debug('[EngineCore] frame complete', meta);
    }
  }

  function verifyRuntimeInvariants(phase, meta = {}) {
    if (!state.runtime.debugFlags.invariants) {
      return { ok: true, skipped: true, phase, meta };
    }

    if (typeof DS !== 'undefined') {
      assertSelectionState(DS.selection, 'EngineCore.verifyRuntimeInvariants.selection');
      assertZoomContract(DS.zoom, 'EngineCore.verifyRuntimeInvariants.zoom');
      snapshotElements();
    }

    const collectedIssues = [];
    const contracts = snapshotContracts();
    trace('EngineCore', 'verify-begin', {
      contracts: summarizeContracts(contracts),
      meta: cloneSerializable(meta),
    }, phase, meta && meta.frame);
    validateSectionContract(contracts, collectedIssues);
    validateCanvasContract(contracts, collectedIssues);
    validateScrollContract(contracts, collectedIssues);
    validateCanonicalRuntime(collectedIssues);
    const actualIssues = Array.isArray(collectedIssues)
      ? collectedIssues.filter(Boolean)
      : [];
    trace('EngineCore', 'verify-issues', {
      issues: actualIssues.map((issue) => ({
        code: issue.code,
        meta: issue.meta || null,
      })),
    }, phase, meta && meta.frame);

    const report = {
      ok: actualIssues.length === 0,
      phase,
      meta: cloneSerializable(meta),
      issues: actualIssues,
      timestamp: new Date().toISOString(),
    };
    trace('EngineCore', 'verify-final', {
      ok: actualIssues.length === 0,
      issuesLength: actualIssues.length,
      issueCodes: actualIssues.map((issue) => issue.code),
    }, phase, meta && meta.frame);
    recordInvariantReport(report);
    return {
      ...report,
      ok: actualIssues.length === 0,
      issues: actualIssues,
    };
  }

  function setDebugFlags(nextFlags = {}) {
    state.runtime.debugFlags = { ...state.runtime.debugFlags, ...nextFlags };
    runtimeServices?.setDebugFlags(cloneSerializable(state.runtime.debugFlags));
    return getDebugFlags();
  }

  function getDebugFlags() {
    return cloneSerializable(state.runtime.debugFlags);
  }

  function enterSafeMode(reason, error, meta = {}) {
    if (!state.runtime.debugFlags.safeMode) return getSafeMode();
    const key = incidentKey(reason, error, meta);
    if (state.runtime.safeMode.active && state.runtime.safeMode.incidentKey === key) {
      return getSafeMode();
    }
    state.runtime.safeMode.active = true;
    state.runtime.safeMode.reason = reason || 'runtime_failure';
    state.runtime.safeMode.incidentKey = key;
    state.runtime.safeMode.recoveryAttempted = false;
    state.runtime.safeMode.lastError = normalizeError(error);
    state.runtime.safeMode.lastRecoveryAt = new Date().toISOString();
    state.runtime.pipeline.lastFailure = {
      reason: state.runtime.safeMode.reason,
      incidentKey: key,
      error: state.runtime.safeMode.lastError,
      meta: cloneSerializable(meta),
      timestamp: state.runtime.safeMode.lastRecoveryAt,
    };
    emitRuntimeEvent('rf:safe-mode', getSafeMode());
    console.error('[EngineCore] Entering safe mode', state.runtime.pipeline.lastFailure);
    return getSafeMode();
  }

  function clearSafeMode() {
    state.runtime.safeMode.active = false;
    state.runtime.safeMode.reason = null;
    state.runtime.safeMode.incidentKey = null;
    state.runtime.safeMode.recoveryAttempted = false;
    state.runtime.safeMode.lastError = null;
    return getSafeMode();
  }

  function getSafeMode() {
    return cloneSerializable(state.runtime.safeMode);
  }

  function exportRuntimeState(reason = 'manual') {
    return buildRuntimeSnapshot(reason);
  }

  function recoverFromPipelineFailure(reason, error, meta = {}) {
    const key = incidentKey(reason, error, meta);
    if (state.runtime.safeMode.active &&
        state.runtime.safeMode.incidentKey === key &&
        state.runtime.safeMode.recoveryAttempted) {
      return {
        recovered: false,
        skipped: true,
        safeMode: getSafeMode(),
        snapshot: null,
      };
    }

    enterSafeMode(reason, error, meta);
    state.runtime.safeMode.recoveryAttempted = true;
    const scheduler = getEngine('RenderScheduler');
    let recovered = false;
    try {
      if (scheduler && typeof scheduler.runLayoutPipelineSync === 'function') {
        scheduler.runLayoutPipelineSync();
        recovered = true;
      }
    } catch (recoveryError) {
      state.runtime.safeMode.lastError = normalizeError(recoveryError);
      console.error('[EngineCore] Safe mode recovery failed', recoveryError);
    }
    if (recovered) {
      state.runtime.safeMode.recoveryCount += 1;
      const postRecovery = verifyRuntimeInvariants('post-recovery', meta);
      emitRuntimeEvent('rf:runtime-recovery', {
        recovered: postRecovery.ok,
        report: postRecovery,
        safeMode: getSafeMode(),
      });
    }
    return {
      recovered,
      safeMode: getSafeMode(),
      snapshot: state.runtime.debugFlags.snapshots ? exportRuntimeState('recovery') : null,
    };
  }

  return {
    beginFrame,
    completeFrame,
    verifyRuntimeInvariants,
    setDebugFlags,
    getDebugFlags,
    enterSafeMode,
    clearSafeMode,
    getSafeMode,
    exportRuntimeState,
    recoverFromPipelineFailure,
  };
}

if (typeof module !== 'undefined') {
  module.exports = { createEngineCoreRuntime };
}

if (typeof globalThis !== 'undefined') {
  globalThis.EngineCoreRuntimeFactory = createEngineCoreRuntime;
}
