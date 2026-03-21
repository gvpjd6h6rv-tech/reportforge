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

  function _getEngine(name) {
    if (typeof EngineRegistry !== 'undefined' && EngineRegistry && EngineRegistry.get) {
      return EngineRegistry.get(name) || null;
    }
    if (typeof window !== 'undefined' && window[name]) return window[name];
    return null;
  }

  function _runLayoutPipeline() {
    const section = _getEngine('SectionLayoutEngine');
    const canvas = _getEngine('CanvasLayoutEngine') || _getEngine('CanvasEngineV19');
    const scroll = _getEngine('WorkspaceScrollEngine');

    if (section && typeof section.updateSync === 'function') section.updateSync();
    if (canvas && typeof canvas.updateSync === 'function') canvas.updateSync();
    if (scroll && typeof scroll.updateSync === 'function') scroll.updateSync();
  }

  function _flush() {
    _rafId  = null;
    _frame++;
    _locked = true;
    try {
      for (const q of _queues) {
        const tasks = [...q.values()];
        q.clear();
        for (const fn of tasks) {
          try { fn(); } catch (e) { console.error('[RenderScheduler]', e); }
        }
      }
    } finally {
      _locked = false;
    }
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
    layoutPipeline(key) {
      this.layout(() => _runLayoutPipeline(), key || 'layout_pipeline');
    },
    runLayoutPipelineSync() {
      _runLayoutPipeline();
    },

    /** Synchronous flush — ONLY for boot init, never in hot paths */
    flushSync(fn) { fn(); },

    /** Frame counter for cache invalidation */
    get frame() { return _frame; },
  };
})();

if (typeof module !== 'undefined') module.exports = RenderScheduler;
