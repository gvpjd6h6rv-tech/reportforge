'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkLoadOrderDeferredBootstrap } from '../../tools/guards/load_order/load_order_deferred_bootstrap.mjs';

function tmpDir(src) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-'));
  fs.writeFileSync(path.join(d, 'DeferredBootstrap.js'), src);
  return d;
}

const GOOD = `
  console.log('EngineCore online');
  RenderScheduler.flushSync();
  CanvasLayoutEngine.__active = true;
  SelectionEngine.__active = true;
`;

test('checkLoadOrderDeferredBootstrap — passes with correct order', () => {
  assert.equal(checkLoadOrderDeferredBootstrap(tmpDir(GOOD)).value, true);
});

test('checkLoadOrderDeferredBootstrap — fails when CanvasLayoutEngine.__active before RenderScheduler.flushSync', () => {
  const src = `CanvasLayoutEngine.__active = true; RenderScheduler.flushSync(); SelectionEngine.__active = true;`;
  const r = checkLoadOrderDeferredBootstrap(tmpDir(src));
  assert.equal(r.value, false);
  assert.ok(r.evidence.some(e => e.includes('RenderScheduler.flushSync')));
});

test('checkLoadOrderDeferredBootstrap — fails when SelectionEngine.__active before CanvasLayoutEngine.__active', () => {
  const src = `console.log('EngineCore online'); RenderScheduler.flushSync(); SelectionEngine.__active = true; CanvasLayoutEngine.__active = true;`;
  const r = checkLoadOrderDeferredBootstrap(tmpDir(src));
  assert.equal(r.value, false);
  assert.ok(r.evidence.some(e => e.includes('CanvasLayoutEngine.__active = true')));
});
