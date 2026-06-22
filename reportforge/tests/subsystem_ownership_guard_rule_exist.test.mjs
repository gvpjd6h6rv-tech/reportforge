'use strict';
/**
 * subsystem_ownership_guard_rule_exist.test.mjs — P29B guard #3
 *
 * "no source_files inexistentes / no zombies en ownership maps" — RULE-EXIST
 * in audit/subsystem_ownership_guard.mjs used to only check designer-runtime
 * subsystems (`if (ss.domain !== 'designer-runtime') continue;`), silently
 * skipping backend-render entirely. Today backend-render's allowedFiles are
 * all intentionally empty (Python file verification deferred to a dedicated
 * Python guard — documented in the map's own notes), so the old scoping
 * never actually missed a real violation, but it was a structural gap: any
 * future domain, or any accidental non-empty allowedFiles entry under
 * backend-render, would have silently bypassed existence checking.
 *
 * This extracts RULE-EXIST into a pure, exported checkFilesExist() that
 * applies to every subsystem regardless of domain.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { checkFilesExist } from '../../audit/subsystem_ownership_guard.mjs';

test('checkFilesExist — flags a missing file regardless of domain (designer-runtime)', () => {
  const subsystems = [
    { id: 'SS-01', domain: 'designer-runtime', allowedFiles: ['Real.js', 'Missing.js'] },
  ];
  const diskFiles = new Set(['Real.js']);
  const errors = checkFilesExist(subsystems, diskFiles);
  assert.deepEqual(errors, [
    { rule: 'RULE-EXIST', subsystem: 'SS-01', file: 'Missing.js', detail: 'engines/Missing.js does not exist on disk' },
  ]);
});

test('checkFilesExist — also flags a missing file under backend-render (the gap this closes)', () => {
  const subsystems = [
    { id: 'SS-B01', domain: 'backend-render', allowedFiles: ['ZombiePythonShim.js'] },
  ];
  const diskFiles = new Set();
  const errors = checkFilesExist(subsystems, diskFiles);
  assert.deepEqual(errors, [
    { rule: 'RULE-EXIST', subsystem: 'SS-B01', file: 'ZombiePythonShim.js', detail: 'engines/ZombiePythonShim.js does not exist on disk' },
  ]);
});

test('checkFilesExist — empty allowedFiles produces no errors (backend-render today)', () => {
  const subsystems = [
    { id: 'SS-B01', domain: 'backend-render', allowedFiles: [] },
    { id: 'SS-B02', domain: 'backend-render', allowedFiles: [] },
  ];
  assert.deepEqual(checkFilesExist(subsystems, new Set()), []);
});

test('checkFilesExist — a file that exists on disk is never flagged', () => {
  const subsystems = [{ id: 'SS-01', domain: 'designer-runtime', allowedFiles: ['Real.js'] }];
  assert.deepEqual(checkFilesExist(subsystems, new Set(['Real.js'])), []);
});

// ── integration: real repo data ──────────────────────────────────────────

test('REAL REPO — subsystem_ownership_guard.mjs still PASSES after the domain-scope fix', () => {
  // All current backend-render allowedFiles are intentionally empty, so
  // widening RULE-EXIST to every domain must not introduce a new failure
  // against the real map today — this is a structural fix, not a behavior
  // change on current data.
  const output = execFileSync('node', ['audit/subsystem_ownership_guard.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.match(output, /PASS — all ownership rules satisfied\./);
});
