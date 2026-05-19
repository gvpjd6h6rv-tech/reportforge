'use strict';

(function initRenderSchedulerFrame(global) {
  const S = global.RenderSchedulerState;
  const H = global.RenderSchedulerHelpers;

  function perfNow() {
    return global.performance && typeof global.performance.now === 'function'
      ? global.performance.now()
      : Date.now();
  }

  function _runStableFrameInvariants(meta) {
    if (S.stableInvariantRafId !== null) {
      cancelAnimationFrame(S.stableInvariantRafId);
      S.stableInvariantRafId = null;
    }

    if (!H.isStableFrame(meta)) {
      H.trace('RenderScheduler', 'skip-invariants', {
        reason: 'frame-not-stable',
        executed: meta && meta.executed ? H.cloneFrameCounts(meta.executed) : null,
        hasPendingWork: H.hasPendingWork(),
      }, 'stable-frame', S.frame);
      return null;
    }

    const snapshot = {
      frame: S.frame,
      phase: 'stable-frame',
      executed: meta && meta.executed ? H.cloneFrameCounts(meta.executed) : null,
      queued: meta && meta.queued ? H.cloneFrameCounts(meta.queued) : null,
      completedAt: meta && meta.completedAt ? meta.completedAt : null,
      error: meta && meta.error ? meta.error : null,
    };
    const signature = JSON.stringify({
      frame: snapshot.frame,
      executed: snapshot.executed,
      queued: snapshot.queued,
      completedAt: snapshot.completedAt,
    });
    const token = ++S.stableInvariantToken;
    S.stableInvariantRafId = requestAnimationFrame(() => {
      S.stableInvariantRafId = null;
      if (token !== S.stableInvariantToken) return;

      const stableMeta = {
        frame: snapshot.frame,
        phase: 'stable-frame',
        executed: snapshot.executed,
        queued: snapshot.queued,
        completedAt: snapshot.completedAt,
        error: snapshot.error,
      };

      if (!H.isStableFrame(stableMeta)) {
        H.trace('RenderScheduler', 'skip-invariants', {
          reason: 'post-flush-work-detected',
          executed: stableMeta.executed,
          hasPendingWork: H.hasPendingWork(),
        }, 'stable-frame', snapshot.frame);
        return;
      }

      if (S.lastStableInvariantSignature === signature) {
        H.trace('RenderScheduler', 'skip-invariants', {
          reason: 'stable-frame-duplicate',
          executed: stableMeta.executed,
        }, 'stable-frame', snapshot.frame);
        return;
      }
      S.lastStableInvariantSignature = signature;

      H.trace('RenderScheduler', 'verify-invariants', {
        executed: stableMeta.executed,
        queued: stableMeta.queued,
      }, 'stable-frame', snapshot.frame);
      H.notifyCore('verifyRuntimeInvariants', 'stable-frame', stableMeta);
    });
    return null;
  }

  function _flush() {
    S.rafId = null;
    S.frame++;
    S.locked = true;

    // Storm detection (#53): track flush rate, fire rf:render-storm when burst detected.
    const nowMs = Date.now();
    S.recentFrameTimes.push(nowMs);
    S.recentFrameTimes = S.recentFrameTimes.filter(t => nowMs - t <= 1000);
    if (S.recentFrameTimes.length > S.stormThreshold && !S.stormActive) {
      S.stormActive = true;
      global.dispatchEvent(new global.CustomEvent('rf:render-storm', {
        detail: { framesInWindow: S.recentFrameTimes.length, stormThreshold: S.stormThreshold, frame: S.frame },
      }));
    }

    const scheduler = global.RenderScheduler || null;
    const flushT0 = perfNow();
    const frameMeta = {
      frame: S.frame,
      startMs: flushT0,
      startedAt: new Date().toISOString(),
      invalidations: scheduler && typeof scheduler.getInvalidationState === 'function'
        ? scheduler.getInvalidationState()
        : JSON.parse(JSON.stringify(S.invalidations)),
      queued: {
        layout: S.queues[S.PRIORITY.LAYOUT].size,
        visual: S.queues[S.PRIORITY.VISUAL].size,
        handles: S.queues[S.PRIORITY.HANDLES].size,
        post: S.queues[S.PRIORITY.POST].size,
      },
      executed: {
        layout: 0,
        visual: 0,
        handles: 0,
        post: 0,
      },
      phases: [],
    };
    let firstError = null;

    H.trace('RenderScheduler', 'flush-begin', { queued: frameMeta.queued }, 'flush', S.frame);
    H.notifyCore('beginFrame', frameMeta);
    try {
      for (let i = 0; i < S.queues.length; i++) {
        const q = S.queues[i];
        const tasks = [...q.entries()];
        const priorityName = i === S.PRIORITY.LAYOUT ? 'layout'
          : i === S.PRIORITY.VISUAL ? 'visual'
          : i === S.PRIORITY.HANDLES ? 'handles'
          : 'post';
        const phaseStartedAt = perfNow();
        const phaseT0 = perfNow();
        let slowestMs = 0;
        let slowestKey = null;
        H.trace('RenderScheduler', 'priority-begin', {
          priority: priorityName,
          queued: tasks.length,
        }, priorityName, S.frame);
        q.clear();
        for (const [key, fn] of tasks) {
          try {
            const taskKey = typeof key === 'symbol' ? key.toString() : String(key);
            const taskT0 = perfNow();
            S.writeScope = priorityName;
            S.writeScopeDepth += 1;
            fn();
            const taskMs = perfNow() - taskT0;
            if (taskMs > slowestMs) {
              slowestMs = taskMs;
              slowestKey = taskKey;
            }
            if (taskMs > S.hotspotThresholdMs) {
              S.hotspots.push({ frame: S.frame, phase: priorityName, key: taskKey, ms: taskMs });
              if (S.hotspots.length > 100) S.hotspots.shift();
            }
            S.writeScopeDepth -= 1;
            if (S.writeScopeDepth === 0) S.writeScope = null;
            if (i === S.PRIORITY.LAYOUT) frameMeta.executed.layout += 1;
            else if (i === S.PRIORITY.VISUAL) frameMeta.executed.visual += 1;
            else if (i === S.PRIORITY.HANDLES) frameMeta.executed.handles += 1;
            else if (i === S.PRIORITY.POST) frameMeta.executed.post += 1;
          } catch (e) {
            if (S.writeScopeDepth > 0) S.writeScopeDepth -= 1;
            if (S.writeScopeDepth === 0) S.writeScope = null;
            if (!firstError) firstError = e;
            console.error('[RenderScheduler]', e);
            H.trace('RenderScheduler', 'task-error', {
              priority: priorityName,
              key: typeof key === 'symbol' ? key.toString() : key,
              message: e && e.message ? e.message : String(e),
            }, priorityName, S.frame);
          }
        }
        const durationMs = perfNow() - phaseStartedAt;
        frameMeta.phases.push({
          priority: i,
          name: priorityName,
          queued: tasks.length,
          tasks: tasks.length,
          executed: frameMeta.executed[priorityName],
          durationMs,
          slowestMs,
          slowestKey,
        });
        H.trace('RenderScheduler', 'priority-complete', {
          priority: priorityName,
          executed: frameMeta.executed[priorityName],
          durationMs,
        }, priorityName, S.frame);
        if (priorityName === 'layout') S.invalidations.layout.dirty = false;
        if (priorityName === 'visual') {
          S.invalidations.canvas.dirty = false;
          S.invalidations.overlay.dirty = false;
        }
        if (priorityName === 'handles') S.invalidations.handles.dirty = false;
        if (priorityName === 'post') S.invalidations.scroll.dirty = false;
      }
    } finally {
      S.locked = false;
      frameMeta.durationMs = perfNow() - flushT0;
      frameMeta.completedAt = new Date().toISOString();
      frameMeta.pendingWork = H.hasPendingWork();
      frameMeta.stable = H.isStableFrame({ ...frameMeta, error: firstError });
      _runStableFrameInvariants({ ...frameMeta, error: firstError });
      H.trace('RenderScheduler', 'flush-complete', {
        executed: H.cloneFrameCounts(frameMeta.executed),
        queued: frameMeta.queued,
        pendingWork: frameMeta.pendingWork,
        stable: frameMeta.stable,
      }, 'flush', S.frame);
      H.notifyCore('completeFrame', frameMeta);
    }

    if (firstError) {
      H.attemptRecovery('render_scheduler_flush_failure', firstError, {
        frame: S.frame,
        frameMeta,
      });
    }
  }

  function _kick() {
    if (!S.rafId) S.rafId = requestAnimationFrame(_flush);
  }

  global.RenderSchedulerFrame = {
    flush: _flush,
    kick: _kick,
    runStableFrameInvariants: _runStableFrameInvariants,
    getHotspots: () => S.hotspots.slice(),
    clearHotspots: () => { S.hotspots.length = 0; },
    clearStorm: () => { S.recentFrameTimes.length = 0; S.stormActive = false; },
    getFrameRate: () => S.recentFrameTimes.length,
  };
})(window);
