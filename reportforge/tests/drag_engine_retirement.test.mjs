'use strict';
/**
 * drag_engine_retirement.test.mjs — P31C closure #1
 *
 * P31A confirmed DragEngine.begin()/update()/commit() have zero callers
 * anywhere in the repo (engines/, designer/, reportforge/tests/) — the only
 * attempted caller was RuntimeBootstrap.js's DragEngine.init({...}) wiring,
 * which never ran (.init doesn't exist) and was itself removed in P31B. The
 * real move/resize drag pipeline is engines/SelectionInteractionPointer.js +
 * SelectionInteractionMotion.js (see SS-06 notes), unrelated to DragEngine.
 *
 * P31C retires begin()/update()/commit() (and their now-unused internal
 * helpers _updateMove/_updateResize/_snap) — option (a) from the 3 offered
 * (retire begin/update/commit | retire DragEngine entirely | document as
 * enforced exception). DragEngine.cancel() stays: it IS reachable (via
 * KeyboardEngine.js's Escape handler) and is a safe no-op given begin() can
 * no longer ever make isActive true.
 *
 * This locks in the reduced public API as a regression guard.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = fs.readFileSync(resolve(ROOT, 'engines/DragEngine.js'), 'utf8');

function loadDragEngine() {
  const calls = { guideClear: 0, saveHistory: 0 };
  const ctx = {
    DragState: undefined, // exercises the inline fallback, same as production today
    GuideEngine: { clear() { calls.guideClear++; } },
    DS: { saveHistory() { calls.saveHistory++; } },
    document: { querySelectorAll() { return []; } },
    module: { exports: {} },
    console,
  };
  vm.runInNewContext(SRC, ctx);
  return { DragEngine: ctx.module.exports, calls };
}

test('FIXED (P31C) — begin/update/commit are retired: no longer exported', () => {
  const { DragEngine } = loadDragEngine();
  assert.equal(DragEngine.begin, undefined, 'begin() must be retired — zero callers anywhere in the repo (P31A)');
  assert.equal(DragEngine.update, undefined, 'update() must be retired — zero callers anywhere in the repo (P31A)');
  assert.equal(DragEngine.commit, undefined, 'commit() must be retired — zero callers anywhere in the repo (P31A)');
});

test('cancel() remains: reachable via KeyboardEngine.js Escape handler, safe no-op when never dragging', () => {
  const { DragEngine, calls } = loadDragEngine();
  assert.equal(typeof DragEngine.cancel, 'function');
  assert.doesNotThrow(() => DragEngine.cancel());
  assert.equal(calls.guideClear, 1, 'cancel() must still clear guides');
  assert.equal(DragEngine.isActive, false, 'isActive must stay false — begin() can no longer ever set it true');
});

test('isActive/dragType/state getters survive the retirement, still delegate to the DragState fallback', () => {
  const { DragEngine } = loadDragEngine();
  assert.equal(DragEngine.isActive, false);
  assert.equal(DragEngine.dragType, null);
  assert.ok(DragEngine.state, 'state must still expose the DragState delegate (real or fallback)');
});

test('REAL REPO — subsystem_ssot_guard.mjs still passes (DragEngine still delegates to DragState correctly)', () => {
  const output = execFileSync('node', ['audit/subsystem_ssot_guard.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.match(output, /violations found: 0/);
});
