'use strict';

(function initRenderSchedulerScope(global) {
  const S = global.RenderSchedulerState;

  function flushSync(fn, source = 'sync') {
    S.writeScope = source;
    S.writeScopeDepth += 1;
    try {
      fn();
    } finally {
      S.writeScopeDepth -= 1;
      if (S.writeScopeDepth === 0) S.writeScope = null;
    }
  }

  function allowsDomWrite() {
    return S.writeScopeDepth > 0;
  }

  function currentWriteScope() {
    return S.writeScope;
  }

  function assertDomWriteAllowed(source = 'unknown') {
    if (allowsDomWrite()) return true;
    const message = `DOM WRITE OUTSIDE RENDER SCHEDULER IS FORBIDDEN IN CANONICAL RUNTIME (${source})`;
    console.error(message);
    throw new Error(message);
  }

  global.RenderSchedulerScope = { flushSync, allowsDomWrite, currentWriteScope, assertDomWriteAllowed };
})(window);
