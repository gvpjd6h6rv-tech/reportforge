'use strict';

(function initRenderSchedulerQueue(global) {
  const S = global.RenderSchedulerState;

  function schedule(fn, priority = S.PRIORITY.VISUAL, key) {
    const p = Math.max(0, Math.min(3, priority | 0));
    const k = key || Symbol();
    S.lastStableInvariantSignature = null;
    S.stableInvariantToken += 1;
    if (S.stableInvariantRafId !== null) {
      cancelAnimationFrame(S.stableInvariantRafId);
      S.stableInvariantRafId = null;
    }
    S.queues[p].set(k, fn);
    global.RenderSchedulerFrame.kick();
  }

  function invalidateLayer(layer, reason) {
    if (!S.invalidations[layer]) return;
    S.invalidations[layer] = {
      dirty: true,
      reason: reason || null,
      frame: S.frame,
      count: (S.invalidations[layer].count || 0) + 1,
    };
  }

  function getInvalidationState() {
    return JSON.parse(JSON.stringify(S.invalidations));
  }

  function layout(fn, key) {
    invalidateLayer('layout', key || fn.name || 'anon');
    schedule(fn, S.PRIORITY.LAYOUT, key || 'layout_' + (fn.name || 'anon'));
  }
  function visual(fn, key) {
    invalidateLayer('overlay', key || fn.name || 'anon');
    schedule(fn, S.PRIORITY.VISUAL, key || 'visual_' + (fn.name || 'anon'));
  }
  function handles(fn, key) {
    invalidateLayer('handles', key || fn.name || 'anon');
    schedule(fn, S.PRIORITY.HANDLES, key || 'handles_' + (fn.name || 'anon'));
  }
  function post(fn, key) {
    invalidateLayer('scroll', key || fn.name || 'anon');
    schedule(fn, S.PRIORITY.POST, key || 'post_' + (fn.name || 'anon'));
  }

  global.RenderSchedulerQueue = { schedule, invalidateLayer, getInvalidationState, layout, visual, handles, post };
})(window);
