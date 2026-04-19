'use strict';

const RenderScheduler = (() => {
  const S = window.RenderSchedulerState;
  const Q = window.RenderSchedulerQueue;
  const P = window.RenderSchedulerScope;

  return {
    PRIORITY: S.PRIORITY,
    schedule: Q.schedule,
    invalidateLayer: Q.invalidateLayer,
    getInvalidationState: Q.getInvalidationState,
    layout: Q.layout,
    visual: Q.visual,
    handles: Q.handles,
    post: Q.post,
    flushSync: P.flushSync,
    allowsDomWrite: P.allowsDomWrite,
    currentWriteScope: P.currentWriteScope,
    assertDomWriteAllowed: P.assertDomWriteAllowed,
    get frame() { return S.frame; },
  };
})();

if (typeof module !== 'undefined') module.exports = RenderScheduler;
