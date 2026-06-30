'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkLoadOrderRuntimeBootstrap } from '../../tools/guards/load_order/load_order_runtime_bootstrap.mjs';

function tmpDir(src) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-'));
  fs.writeFileSync(path.join(d, 'RuntimeBootstrap.js'), src);
  return d;
}

const GOOD = `
  DesignerUI.init();
  SectionEngine.init();
  ZoomEngine.set(1);
  DS.saveHistory();
`;

test('checkLoadOrderRuntimeBootstrap — passes with correct order', () => {
  assert.equal(checkLoadOrderRuntimeBootstrap(tmpDir(GOOD)).value, true);
});

test('checkLoadOrderRuntimeBootstrap — fails when ZoomEngine.set before DesignerUI.init', () => {
  const src = `ZoomEngine.set(1); DesignerUI.init(); SectionEngine.init(); DS.saveHistory();`;
  const r = checkLoadOrderRuntimeBootstrap(tmpDir(src));
  assert.equal(r.value, false);
  assert.ok(r.evidence.some(e => e.includes('DesignerUI.init()')));
});

test('checkLoadOrderRuntimeBootstrap — fails when DS.saveHistory before SectionEngine.init', () => {
  const src = `DesignerUI.init(); DS.saveHistory(); SectionEngine.init(); ZoomEngine.set(1);`;
  const r = checkLoadOrderRuntimeBootstrap(tmpDir(src));
  assert.equal(r.value, false);
  assert.ok(r.evidence.some(e => e.includes('SectionEngine.init()')));
});
