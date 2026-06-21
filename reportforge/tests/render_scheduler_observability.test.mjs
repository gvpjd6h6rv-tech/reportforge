'use strict';
/**
 * SS-03 — RenderSchedulerObservability contracts
 * Covers all 7 exported functions: now, recordFrameTime (storm detection,
 * auto-clear, dispatchEvent), recordHotspot (threshold, cap), getHotspots,
 * clearHotspots, clearStorm, getFrameRate.
 * All tests use require() — no vm, no DOM nodes required.
 */
import test   from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

if (typeof globalThis.CustomEvent === 'undefined') {
  globalThis.CustomEvent = class CustomEvent extends Event {
    constructor(type, params = {}) {
      super(type, params);
      this.detail = params.detail;
    }
  };
}
if (typeof CustomEvent === 'undefined') (0, eval)('var CustomEvent = globalThis.CustomEvent');

const require = createRequire(import.meta.url);
const ROOT    = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OBS     = require('../../engines/RenderSchedulerObservability.js');

// ── S factory — fresh state per test ─────────────────────────────────────────

function makeS(opts = {}) {
  return {
    recentFrameTimes:  [],
    stormThreshold:    opts.stormThreshold  ?? 3,
    stormActive:       opts.stormActive     ?? false,
    frame:             opts.frame           ?? 1,
    hotspotThresholdMs: opts.hotspotThresholdMs ?? 16,
    hotspots:          [],
  };
}

// ── now() ─────────────────────────────────────────────────────────────────────

test('now — returns a number', () => {
  assert.equal(typeof OBS.now(), 'number');
});

test('now — returns a positive value', () => {
  assert.ok(OBS.now() > 0);
});

test('now — successive calls are non-decreasing', () => {
  const t1 = OBS.now();
  const t2 = OBS.now();
  assert.ok(t2 >= t1);
});

// ── recordHotspot ─────────────────────────────────────────────────────────────

test('recordHotspot — entry below threshold is a no-op', () => {
  const S = makeS({ hotspotThresholdMs: 16 });
  OBS.recordHotspot(S, { frame: 1, phase: 'layout', key: 'test', ms: 10 });
  assert.equal(S.hotspots.length, 0);
});

test('recordHotspot — entry exactly at threshold is a no-op (not strictly greater)', () => {
  const S = makeS({ hotspotThresholdMs: 16 });
  OBS.recordHotspot(S, { frame: 1, phase: 'layout', key: 'test', ms: 16 });
  assert.equal(S.hotspots.length, 0);
});

test('recordHotspot — entry above threshold is added', () => {
  const S = makeS({ hotspotThresholdMs: 16 });
  OBS.recordHotspot(S, { frame: 1, phase: 'layout', key: 'slow', ms: 25 });
  assert.equal(S.hotspots.length, 1);
  assert.equal(S.hotspots[0].key, 'slow');
  assert.equal(S.hotspots[0].ms, 25);
});

test('recordHotspot — null/falsy entry is a no-op', () => {
  const S = makeS();
  OBS.recordHotspot(S, null);
  assert.equal(S.hotspots.length, 0);
});

test('recordHotspot — cap enforced at 100: oldest evicted when full', () => {
  const S = makeS({ hotspotThresholdMs: 0 });
  // Fill to exactly 100
  for (let i = 0; i < 100; i++) {
    OBS.recordHotspot(S, { frame: i, phase: 'layout', key: `k${i}`, ms: 1 });
  }
  assert.equal(S.hotspots.length, 100);
  // Add one more — oldest (k0) should be evicted
  OBS.recordHotspot(S, { frame: 100, phase: 'layout', key: 'k100', ms: 1 });
  assert.equal(S.hotspots.length, 100);
  assert.equal(S.hotspots[0].key, 'k1');   // oldest k0 evicted
  assert.equal(S.hotspots[99].key, 'k100');
});

// ── getHotspots ───────────────────────────────────────────────────────────────

test('getHotspots — returns a copy, not same reference', () => {
  const S = makeS({ hotspotThresholdMs: 0 });
  OBS.recordHotspot(S, { frame: 1, phase: 'layout', key: 'a', ms: 1 });
  const result = OBS.getHotspots(S);
  assert.notEqual(result, S.hotspots);  // different array
  assert.equal(result.length, 1);
  assert.equal(result[0].key, 'a');
});

test('getHotspots — empty when no hotspots above threshold', () => {
  const S = makeS({ hotspotThresholdMs: 100 });
  OBS.recordHotspot(S, { frame: 1, phase: 'layout', key: 'fast', ms: 50 });
  assert.equal(OBS.getHotspots(S).length, 0);
});

// ── clearHotspots ─────────────────────────────────────────────────────────────

test('clearHotspots — empties the hotspots array', () => {
  const S = makeS({ hotspotThresholdMs: 0 });
  OBS.recordHotspot(S, { frame: 1, phase: 'layout', key: 'a', ms: 1 });
  OBS.recordHotspot(S, { frame: 2, phase: 'visual', key: 'b', ms: 2 });
  assert.equal(S.hotspots.length, 2);
  OBS.clearHotspots(S);
  assert.equal(S.hotspots.length, 0);
});

test('clearHotspots — no-op on already empty array', () => {
  const S = makeS();
  OBS.clearHotspots(S);
  assert.equal(S.hotspots.length, 0);
});

// ── clearStorm ────────────────────────────────────────────────────────────────

test('clearStorm — resets stormActive to false', () => {
  const S = makeS({ stormActive: true });
  OBS.clearStorm(S);
  assert.equal(S.stormActive, false);
});

test('clearStorm — resets recentFrameTimes to empty', () => {
  const S = makeS();
  S.recentFrameTimes.push(Date.now(), Date.now(), Date.now());
  OBS.clearStorm(S);
  assert.equal(S.recentFrameTimes.length, 0);
});

test('clearStorm — no-op when already clear', () => {
  const S = makeS({ stormActive: false });
  OBS.clearStorm(S);
  assert.equal(S.stormActive, false);
  assert.equal(S.recentFrameTimes.length, 0);
});

// ── recordFrameTime — accumulation ───────────────────────────────────────────

test('recordFrameTime — adds a timestamp to recentFrameTimes', () => {
  const S = makeS({ stormThreshold: 10 });
  OBS.recordFrameTime(S, null);
  assert.equal(S.recentFrameTimes.length, 1);
  assert.equal(typeof S.recentFrameTimes[0], 'number');
});

test('recordFrameTime — multiple calls accumulate entries', () => {
  const S = makeS({ stormThreshold: 10 });
  OBS.recordFrameTime(S, null);
  OBS.recordFrameTime(S, null);
  OBS.recordFrameTime(S, null);
  assert.ok(S.recentFrameTimes.length >= 3);
});

// ── recordFrameTime — storm detection ────────────────────────────────────────

test('recordFrameTime — stormActive becomes true when frames exceed threshold', () => {
  const S = makeS({ stormThreshold: 3 });
  // Need framesInWindow > 3 → 4 calls within 1 second
  for (let i = 0; i < 4; i++) OBS.recordFrameTime(S, null);
  assert.equal(S.stormActive, true);
});

test('recordFrameTime — dispatches rf:render-storm event on storm detection', () => {
  const S = makeS({ stormThreshold: 3 });
  const dispatched = [];
  const orig = globalThis.dispatchEvent;
  globalThis.dispatchEvent = (e) => dispatched.push(e.type);
  try {
    for (let i = 0; i < 4; i++) OBS.recordFrameTime(S, null);
    assert.ok(dispatched.includes('rf:render-storm'));
  } finally {
    if (orig === undefined) delete globalThis.dispatchEvent;
    else globalThis.dispatchEvent = orig;
  }
});

test('recordFrameTime — storm not re-triggered when already active', () => {
  const S = makeS({ stormThreshold: 3, stormActive: true });
  // Pre-fill with recent frames so framesInWindow stays > threshold on each call
  const t = OBS.now();
  S.recentFrameTimes = [t, t, t, t];  // 4 recent frames, already > threshold
  const dispatched = [];
  const orig = globalThis.dispatchEvent;
  globalThis.dispatchEvent = (e) => dispatched.push(e.type);
  try {
    OBS.recordFrameTime(S, null);  // framesInWindow=5 > 3, but stormActive=true → no dispatch
    assert.equal(dispatched.length, 0);  // already active → no dispatch
  } finally {
    if (orig === undefined) delete globalThis.dispatchEvent;
    else globalThis.dispatchEvent = orig;
  }
});

test('recordFrameTime — stormActive auto-clears when frames drop below threshold', () => {
  const S = makeS({ stormThreshold: 3, stormActive: true });
  // Put all timestamps more than 1s in the past (use OBS.now() — same clock as recordFrameTime)
  const oldTime = OBS.now() - 2000;
  S.recentFrameTimes = [oldTime, oldTime, oldTime, oldTime];  // all stale
  // One new call — stale timestamps get pruned → framesInWindow = 1 ≤ 3 → clear
  OBS.recordFrameTime(S, null);
  assert.equal(S.stormActive, false);
});

// ── getFrameRate ──────────────────────────────────────────────────────────────

test('getFrameRate — returns count of frames in the current 1s window', () => {
  const S = makeS({ stormThreshold: 100 });
  for (let i = 0; i < 5; i++) OBS.recordFrameTime(S, null);
  const rate = OBS.getFrameRate(S);
  // getFrameRate calls recordFrameTime internally (adds 1 more) → at least 5
  assert.ok(rate >= 5);
});

test('getFrameRate — prunes timestamps older than 1 second', () => {
  const S = makeS({ stormThreshold: 100 });
  // Inject old timestamps (> 1s ago, use OBS.now() — same clock as recordFrameTime)
  const oldTime = OBS.now() - 2000;
  S.recentFrameTimes = [oldTime, oldTime, oldTime];
  // getFrameRate internally calls recordFrameTime which prunes old timestamps
  const rate = OBS.getFrameRate(S);
  // After pruning 3 stale + adding 1 new → rate should be 1 or 2 (depending on impl)
  assert.ok(rate < 4);  // the 3 old ones are gone
});
