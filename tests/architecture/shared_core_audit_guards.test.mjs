'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkSharedCoreAuditGuards } from '../../tools/guards/shared_core/shared_core_audit_guards.mjs';

function tmpRoot(guardFiles) {
  const d  = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-'));
  const ad = path.join(d, 'audit');
  fs.mkdirSync(ad);
  for (const f of guardFiles) fs.writeFileSync(path.join(ad, f), '');
  return d;
}

test('checkSharedCoreAuditGuards — passes when ≥5 guard files exist', () => {
  const files = ['a_guard.mjs','b_guard.mjs','c_guard.mjs','d_guard.mjs','e_guard.mjs'];
  assert.equal(checkSharedCoreAuditGuards(tmpRoot(files)).value, true);
});

test('checkSharedCoreAuditGuards — fails when fewer than 5 guard files', () => {
  const r = checkSharedCoreAuditGuards(tmpRoot(['a_guard.mjs','b_guard.mjs']));
  assert.equal(r.value, false);
  assert.ok(r.evidence[0].includes('found 2'));
});

test('checkSharedCoreAuditGuards — ignores non-guard .mjs files', () => {
  const files = ['a_guard.mjs','b_guard.mjs','util.mjs','c_guard.mjs','d_guard.mjs','e_guard.mjs'];
  assert.equal(checkSharedCoreAuditGuards(tmpRoot(files)).value, true);
});
