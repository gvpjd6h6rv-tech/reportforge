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
  let _recovering = false;

  function _flush() {
    _rafId  = null;
    _frame++;
    _locked = true;
    const frameMeta = {
      frame: _frame,
      startedAt: new Date().toISOString(),
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

    _notifyCore('beginFrame', frameMeta);
    try {
      for (let i = 0; i < _queues.length; i++) {
        const q = _queues[i];
        const tasks = [...q.entries()];
        q.clear();
        for (const [key, fn] of tasks) {
          try {
            fn();
            if (i === PRIORITY.LAYOUT) frameMeta.executed.layout += 1;
            else if (i === PRIORITY.VISUAL) frameMeta.executed.visual += 1;
            else if (i === PRIORITY.HANDLES) frameMeta.executed.handles += 1;
            else if (i === PRIORITY.POST) frameMeta.executed.post += 1;
          } catch (e) {
            if (!firstError) firstError = e;
            console.error('[RenderScheduler]', e);
            _notifyCore('enterSafeMode', 'scheduler_task_error', e, {
              frame: _frame,
              priority: i,
              key: typeof key === 'symbol' ? key.toString() : key,
            });
          }
        }

        if (i === PRIORITY.LAYOUT) {
          const layoutReport = _notifyCore('verifyRuntimeInvariants', 'post-layout', {
            frame: _frame,
            executed: frameMeta.executed.layout,
          });
          if (layoutReport && layoutReport.ok === false && !firstError) {
            firstError = new Error('Runtime invariant failure at post-layout');
          }
        }
      }

      const pipelineReport = _notifyCore('verifyRuntimeInvariants', 'post-pipeline', {
        frame: _frame,
        executed: _cloneFrameCounts(frameMeta.executed),
      });
      if (pipelineReport && pipelineReport.ok === false && !firstError) {
        firstError = new Error('Runtime invariant failure at post-pipeline');
      }
    } finally {
      _locked = false;
      frameMeta.completedAt = new Date().toISOString();
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
      _queues[p].set(k, fn);
      _kick();
    },

    layout(fn, key)  { this.schedule(fn, PRIORITY.LAYOUT,  key || 'layout_' + (fn.name || 'anon')); },
    visual(fn, key)  { this.schedule(fn, PRIORITY.VISUAL,  key || 'visual_' + (fn.name || 'anon')); },
    handles(fn, key) { this.schedule(fn, PRIORITY.HANDLES, key || 'handles_' + (fn.name || 'anon')); },
    post(fn, key)    { this.schedule(fn, PRIORITY.POST,    key || 'post_' + (fn.name || 'anon')); },

    /** Synchronous flush — ONLY for boot init, never in hot paths */
    flushSync(fn) { fn(); },

    /** Frame counter for cache invalidation */
    get frame() { return _frame; },
  };
})();

if (typeof module !== 'undefined') module.exports = RenderScheduler;
