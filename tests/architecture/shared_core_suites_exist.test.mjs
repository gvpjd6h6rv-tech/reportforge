'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkSharedCoreSuitesExist } from '../../tools/guards/shared_core/shared_core_suites_exist.mjs';

function tmpRoot(files) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-'));
  for (const f of files) {
    const full = path.join(d, f);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, '');
  }
  return d;
}

const ALL = [
  'reportforge/tests/debuggability.test.mjs',
  'reportforge/tests/governance_guardrails.test.mjs',
  'reportforge/tests/engine_contracts.test.mjs',
  'reportforge/tests/race_conditions.test.mjs',
];

test('checkSharedCoreSuitesExist — passes when all four suites exist', () => {
  assert.equal(checkSharedCoreSuitesExist(tmpRoot(ALL)).value, true);
});

test('checkSharedCoreSuitesExist — fails when one suite is missing', () => {
  const r = checkSharedCoreSuitesExist(tmpRoot(ALL.slice(0, 3)));
  assert.equal(r.value, false);
  assert.ok(r.evidence.some(e => e.includes('race_conditions')));
});

test('checkSharedCoreSuitesExist — fails when none exist', () => {
  const r = checkSharedCoreSuitesExist(tmpRoot([]));
  assert.equal(r.value, false);
  assert.equal(r.evidence.length, 4);
});
