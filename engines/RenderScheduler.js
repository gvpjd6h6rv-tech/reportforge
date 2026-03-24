/**
 * RenderScheduler — ReportForge v19.4
 * ─────────────────────────────────────────────────────────────────
 * Strictly requestAnimationFrame-based.
 * NO engine may write to the DOM outside of a scheduled callback.
 *
 * Priority tiers (executed in order within one rAF frame):
 *   LAYOUT  (0) — geometry, positions, section heights
 *   VISUAL  (1) — rulers, grid, overlays
 *   HANDLES (2) — selection handles, guides, snap lines
 *   POST    (3) — status bar, external notifications
 *
 * Usage:
 *   RenderScheduler.layout(() => SectionLayoutEngine.updateSync());
 *   RenderScheduler.visual(() => RulerEngine.renderSync());
 *   RenderScheduler.handles(() => HandlesEngine.update());
 */
'use strict';

const RenderScheduler = (() => {
  const PRIORITY = { LAYOUT: 0, VISUAL: 1, HANDLES: 2, POST: 3 };
  // Each priority has a Map (key → fn) to deduplicate same-key tasks
  const _queues = [new Map(), new Map(), new Map(), new Map()];
  let _rafId  = null;
  let _frame  = 0;
  let _locked = false;  // prevents re-entrant scheduling during flush
  let _writeScope = null;
  let _writeScopeDepth = 0;
  let _recovering = false;
  let _stableInvariantRafId = null;
  let _stableInvariantToken = 0;
  let _lastStableInvariantSignature = null;
  const _invalidations = {
    layout: { dirty: false, reason: null, frame: 0, count: 0 },
    canvas: { dirty: false, reason: null, frame: 0, count: 0 },
    overlay: { dirty: false, reason: null, frame: 0, count: 0 },
    handles: { dirty: false, reason: null, frame: 0, count: 0 },
    scroll: { dirty: false, reason: null, frame: 0, count: 0 },
  };

  function _trace(source, event, payload, phase, frame) {
    if (typeof window === 'undefined' || typeof window.rfTrace !== 'function') return;
    if (!window.DebugTrace?.isEnabled('scheduler')) return;
    window.rfTrace('scheduler', event, {
      frame: typeof frame === 'number' ? frame : _frame,
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
    if (_recovering) return null;
    _recovering = true;
    try {
      return _notifyCore('recoverFromPipelineFailure', reason, error, meta);
    } finally {
      _recovering = false;
    }
  }

  function _hasPendingWork() {
    return _queues.some(queue => queue.size > 0) || _rafId !== null || _stableInvariantRafId !== null;
  }

  function _isStableFrame(meta) {
    const hasError = !!(meta && meta.error);
    return !hasError && !_hasPendingWork();
  }

  function _runStableFrameInvariants(meta) {
    if (_stableInvariantRafId !== null) {
      cancelAnimationFrame(_stableInvariantRafId);
      _stableInvariantRafId = null;
    }

    if (!_isStableFrame(meta)) {
      _trace('RenderScheduler', 'skip-invariants', {
        reason: 'frame-not-stable',
        executed: meta && meta.executed ? _cloneFrameCounts(meta.executed) : null,
        hasPendingWork: _hasPendingWork(),
      }, 'stable-frame', _frame);
      return null;
    }

    const snapshot = {
      frame: _frame,
      phase: 'stable-frame',
      executed: meta && meta.executed ? _cloneFrameCounts(meta.executed) : null,
      queued: meta && meta.queued ? _cloneFrameCounts(meta.queued) : null,
      completedAt: meta && meta.completedAt ? meta.completedAt : null,
      error: meta && meta.error ? meta.error : null,
    };
    const signature = JSON.stringify({
      frame: snapshot.frame,
      executed: snapshot.executed,
      queued: snapshot.queued,
      completedAt: snapshot.completedAt,
    });
    const token = ++_stableInvariantToken;
    _stableInvariantRafId = requestAnimationFrame(() => {
      _stableInvariantRafId = null;
      if (token !== _stableInvariantToken) return;

      const stableMeta = {
        frame: snapshot.frame,
        phase: 'stable-frame',
        executed: snapshot.executed,
        queued: snapshot.queued,
        completedAt: snapshot.completedAt,
        error: snapshot.error,
      };

      if (!_isStableFrame(stableMeta)) {
        _trace('RenderScheduler', 'skip-invariants', {
          reason: 'post-flush-work-detected',
          executed: stableMeta.executed,
          hasPendingWork: _hasPendingWork(),
        }, 'stable-frame', snapshot.frame);
        return;
      }

      if (_lastStableInvariantSignature === signature) {
        _trace('RenderScheduler', 'skip-invariants', {
          reason: 'stable-frame-duplicate',
          executed: stableMeta.executed,
        }, 'stable-frame', snapshot.frame);
        return;
      }
      _lastStableInvariantSignature = signature;

      _trace('RenderScheduler', 'verify-invariants', {
        executed: stableMeta.executed,
        queued: stableMeta.queued,
      }, 'stable-frame', snapshot.frame);
      _notifyCore('verifyRuntimeInvariants', 'stable-frame', stableMeta);
    });
    return null;
  }

  function _flush() {
    _rafId  = null;
    _frame++;
    _locked = true;
    const frameMeta = {
      frame: _frame,
      startedAt: new Date().toISOString(),
      invalidations: this && this.getInvalidationState ? this.getInvalidationState() : JSON.parse(JSON.stringify(_invalidations)),
      queued: {
        layout: _queues[PRIORITY.LAYOUT].size,
        visual: _queues[PRIORITY.VISUAL].size,
        handles: _queues[PRIORITY.HANDLES].size,
        post: _queues[PRIORITY.POST].size,
      },
      executed: {
        layout: 0,
        visual: 0,
        handles: 0,
        post: 0,
      },
    };
    let firstError = null;

    _trace('RenderScheduler', 'flush-begin', {
      queued: frameMeta.queued,
    }, 'flush', _frame);
    _notifyCore('beginFrame', frameMeta);
    try {
      for (let i = 0; i < _queues.length; i++) {
        const q = _queues[i];
        const tasks = [...q.entries()];
        const priorityName = i === PRIORITY.LAYOUT ? 'layout'
          : i === PRIORITY.VISUAL ? 'visual'
          : i === PRIORITY.HANDLES ? 'handles'
          : 'post';
        _trace('RenderScheduler', 'priority-begin', {
          priority: priorityName,
          queued: tasks.length,
        }, priorityName, _frame);
        q.clear();
        for (const [key, fn] of tasks) {
          try {
            _writeScope = priorityName;
            _writeScopeDepth += 1;
            fn();
            _writeScopeDepth -= 1;
            if (_writeScopeDepth === 0) _writeScope = null;
            if (i === PRIORITY.LAYOUT) frameMeta.executed.layout += 1;
            else if (i === PRIORITY.VISUAL) frameMeta.executed.visual += 1;
            else if (i === PRIORITY.HANDLES) frameMeta.executed.handles += 1;
            else if (i === PRIORITY.POST) frameMeta.executed.post += 1;
          } catch (e) {
            if (_writeScopeDepth > 0) _writeScopeDepth -= 1;
            if (_writeScopeDepth === 0) _writeScope = null;
            if (!firstError) firstError = e;
            console.error('[RenderScheduler]', e);
            _trace('RenderScheduler', 'task-error', {
              priority: priorityName,
              key: typeof key === 'symbol' ? key.toString() : key,
              message: e && e.message ? e.message : String(e),
            }, priorityName, _frame);
          }
        }
        _trace('RenderScheduler', 'priority-complete', {
          priority: priorityName,
          executed: frameMeta.executed[priorityName],
        }, priorityName, _frame);
        if (priorityName === 'layout') _invalidations.layout.dirty = false;
        if (priorityName === 'visual') {
          _invalidations.canvas.dirty = false;
          _invalidations.overlay.dirty = false;
        }
        if (priorityName === 'handles') _invalidations.handles.dirty = false;
        if (priorityName === 'post') _invalidations.scroll.dirty = false;

      }
    } finally {
      _locked = false;
      frameMeta.completedAt = new Date().toISOString();
      frameMeta.pendingWork = _hasPendingWork();
      frameMeta.stable = _isStableFrame({
        ...frameMeta,
        error: firstError,
      });
      _runStableFrameInvariants({
        ...frameMeta,
        error: firstError,
      });
      _trace('RenderScheduler', 'flush-complete', {
        executed: _cloneFrameCounts(frameMeta.executed),
        queued: frameMeta.queued,
        pendingWork: frameMeta.pendingWork,
        stable: frameMeta.stable,
      }, 'flush', _frame);
      _notifyCore('completeFrame', frameMeta);
    }

    if (firstError) {
      _attemptRecovery('render_scheduler_flush_failure', firstError, {
        frame: _frame,
        frameMeta,
      });
    }
  }

  function _cloneFrameCounts(counts) {
    return {
      layout: counts.layout,
      visual: counts.visual,
      handles: counts.handles,
      post: counts.post,
    };
  }

  function _kick() {
    if (!_rafId) _rafId = requestAnimationFrame(_flush);
  }

  return {
    PRIORITY,

    /**
     * Schedule fn for next rAF frame.
     * @param {Function} fn
     * @param {number}   priority  — PRIORITY.*
     * @param {string}   [key]     — deduplication key (same key replaces prev)
     */
    schedule(fn, priority = PRIORITY.VISUAL, key) {
      const p = Math.max(0, Math.min(3, priority | 0));
      const k = key || Symbol();
      _lastStableInvariantSignature = null;
      _stableInvariantToken += 1;
      if (_stableInvariantRafId !== null) {
        cancelAnimationFrame(_stableInvariantRafId);
        _stableInvariantRafId = null;
      }
      _queues[p].set(k, fn);
      _kick();
    },

    invalidateLayer(layer, reason) {
      if (!_invalidations[layer]) return;
      _invalidations[layer] = {
        dirty: true,
        reason: reason || null,
        frame: _frame,
        count: (_invalidations[layer].count || 0) + 1,
      };
    },

    getInvalidationState() {
      return JSON.parse(JSON.stringify(_invalidations));
    },

    layout(fn, key)  {
      this.invalidateLayer('layout', key || fn.name || 'anon');
      this.schedule(fn, PRIORITY.LAYOUT,  key || 'layout_' + (fn.name || 'anon'));
    },
    visual(fn, key)  {
      this.invalidateLayer('overlay', key || fn.name || 'anon');
      this.schedule(fn, PRIORITY.VISUAL,  key || 'visual_' + (fn.name || 'anon'));
    },
    handles(fn, key) {
      this.invalidateLayer('handles', key || fn.name || 'anon');
      this.schedule(fn, PRIORITY.HANDLES, key || 'handles_' + (fn.name || 'anon'));
    },
    post(fn, key)    {
      this.invalidateLayer('scroll', key || fn.name || 'anon');
      this.schedule(fn, PRIORITY.POST,    key || 'post_' + (fn.name || 'anon'));
    },

    /** Synchronous flush — ONLY for boot init, never in hot paths */
    flushSync(fn, source = 'sync') {
      _writeScope = source;
      _writeScopeDepth += 1;
      try {
        fn();
      } finally {
        _writeScopeDepth -= 1;
        if (_writeScopeDepth === 0) _writeScope = null;
      }
    },

    allowsDomWrite() {
      return _writeScopeDepth > 0;
    },

    currentWriteScope() {
      return _writeScope;
    },

    assertDomWriteAllowed(source = 'unknown') {
      if (this.allowsDomWrite()) return true;
      const message = `DOM WRITE OUTSIDE RENDER SCHEDULER IS FORBIDDEN IN CANONICAL RUNTIME (${source})`;
      console.error(message);
      throw new Error(message);
    },

    /** Frame counter for cache invalidation */
    get frame() { return _frame; },
  };
})();

if (typeof module !== 'undefined') module.exports = RenderScheduler;
