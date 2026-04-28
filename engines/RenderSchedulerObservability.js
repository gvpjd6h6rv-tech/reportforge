(function (global) {
  'use strict';

  function now() {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  function recordFrameTime(S, runtime) {
    const t = now();
    S.recentFrameTimes.push(t);
    while (S.recentFrameTimes.length > 60) S.recentFrameTimes.shift();

    const cutoff = t - 1000;
    while (S.recentFrameTimes.length && S.recentFrameTimes[0] < cutoff) {
      S.recentFrameTimes.shift();
    }

    const framesInWindow = S.recentFrameTimes.length;
    if (framesInWindow > S.stormThreshold && !S.stormActive) {
      S.stormActive = true;
      const detail = {
        framesInWindow,
        stormThreshold: S.stormThreshold,
        frame: S.frame,
        at: new Date().toISOString(),
      };
      console.warn('[RenderScheduler] Render storm detected', detail);
      if (global.dispatchEvent && typeof CustomEvent !== 'undefined') {
        global.dispatchEvent(new CustomEvent('rf:render-storm', { detail }));
      }
      if (runtime && typeof runtime.enterSafeMode === 'function') {
        runtime.enterSafeMode(
          'render_storm',
          new Error(`Render storm: ${framesInWindow} flushes/s > threshold ${S.stormThreshold}`),
          detail
        );
      }
    }

    if (framesInWindow <= S.stormThreshold && S.stormActive) {
      S.stormActive = false;
    }
  }

  function recordHotspot(S, entry) {
    if (!entry || entry.ms <= S.hotspotThresholdMs) return;
    if (S.hotspots.length >= 100) S.hotspots.shift();
    S.hotspots.push(entry);
  }

  function getFrameRate(S) {
    recordFrameTime(S, null);
    return S.recentFrameTimes.length;
  }

  function clearStorm(S) {
    S.recentFrameTimes.length = 0;
    S.stormActive = false;
  }

  function getHotspots(S) {
    return S.hotspots.slice();
  }

  function clearHotspots(S) {
    S.hotspots.length = 0;
  }

  global.RenderSchedulerObservability = {
    now,
    recordFrameTime,
    recordHotspot,
    getFrameRate,
    clearStorm,
    getHotspots,
    clearHotspots,
  };
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof module !== 'undefined') module.exports = globalThis.RenderSchedulerObservability;
