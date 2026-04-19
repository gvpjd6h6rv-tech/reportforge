# Render Scheduler Contract

`RenderScheduler` is a facade only.

## Owners

- `RenderSchedulerState.js`: scheduler state, priorities, invalidation state, and core helpers.
- `RenderSchedulerFrame.js`: frame flush, stable-frame verification, and recovery hooks.
- `RenderSchedulerQueue.js`: queueing, invalidation, and priority dispatch.
- `RenderSchedulerScope.js`: DOM write scope guardrails.
- `RenderScheduler.js`: public facade and export surface.

## Public API

- `RenderScheduler.PRIORITY`
- `RenderScheduler.schedule()`
- `RenderScheduler.invalidateLayer()`
- `RenderScheduler.getInvalidationState()`
- `RenderScheduler.layout()`
- `RenderScheduler.visual()`
- `RenderScheduler.handles()`
- `RenderScheduler.post()`
- `RenderScheduler.flushSync()`
- `RenderScheduler.allowsDomWrite()`
- `RenderScheduler.currentWriteScope()`
- `RenderScheduler.assertDomWriteAllowed()`
- `RenderScheduler.frame`
