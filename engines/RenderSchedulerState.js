'use strict';

(function initRenderSchedulerState(global) {
  const PRIORITY = { LAYOUT: 0, VISUAL: 1, HANDLES: 2, POST: 3 };
  const RenderSchedulerState = {
    PRIORITY,
    queues: [new Map(), new Map(), new Map(), new Map()],
    rafId: null,
    frame: 0,
    locked: false,
    writeScope: null,
    writeScopeDepth: 0,
    recovering: false,
    stableInvariantRafId: null,
    stableInvariantToken: 0,
    lastStableInvariantSignature: null,
    invalidations: {
      layout: { dirty: false, reason: null, frame: 0, count: 0 },
      canvas: { dirty: false, reason: null, frame: 0, count: 0 },
      overlay: { dirty: false, reason: null, frame: 0, count: 0 },
      handles: { dirty: false, reason: null, frame: 0, count: 0 },
      scroll: { dirty: false, reason: null, frame: 0, count: 0 },
    },
  };

  function _trace(source, event, payload, phase, frame) {
    if (typeof window === 'undefined' || typeof window.rfTrace !== 'function') return;
    if (!window.DebugTrace?.isEnabled('scheduler')) return;
    window.rfTrace('scheduler', event, {
      frame: typeof frame === 'number' ? frame : RenderSchedulerState.frame,
      source,
      phase: phase || null,
      payload: payload || null,
    });
  }

  function _getEngine(name) {
    if (typeof EngineRegistry !== 'undefined' && EngineRegistry && EngineRegistry.get) {
      return EngineRegistry.get(name) || null;
    }
    if (typeof window !== 'undefined' && window[name]) return window[name];
    return null;
  }

  function _notifyCore(method, ...args) {
    const core = _getEngine('EngineCore');
    if (!core || typeof core[method] !== 'function') return null;
    try {
      return core[method](...args);
    } catch (error) {
      console.error(`[RenderScheduler] EngineCore.${method} failed`, error);
      return null;
    }
  }

  function _attemptRecovery(reason, error, meta) {
    if (RenderSchedulerState.recovering) return null;
    RenderSchedulerState.recovering = true;
    try {
      return _notifyCore('recoverFromPipelineFailure', reason, error, meta);
    } finally {
      RenderSchedulerState.recovering = false;
    }
  }

  function _hasPendingWork() {
    return RenderSchedulerState.queues.some((queue) => queue.size > 0)
      || RenderSchedulerState.rafId !== null
      || RenderSchedulerState.stableInvariantRafId !== null;
  }

  function _isStableFrame(meta) {
    const hasError = !!(meta && meta.error);
    return !hasError && !_hasPendingWork();
  }

  function _cloneFrameCounts(counts) {
    return {
      layout: counts.layout,
      visual: counts.visual,
      handles: counts.handles,
      post: counts.post,
    };
  }

  global.RenderSchedulerState = RenderSchedulerState;
  global.RenderSchedulerHelpers = {
    trace: _trace,
    getEngine: _getEngine,
    notifyCore: _notifyCore,
    attemptRecovery: _attemptRecovery,
    hasPendingWork: _hasPendingWork,
    isStableFrame: _isStableFrame,
    cloneFrameCounts: _cloneFrameCounts,
  };
})(window);
