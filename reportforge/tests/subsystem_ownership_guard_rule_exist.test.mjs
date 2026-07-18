'use strict';
/**
 * subsystem_ownership_guard_rule_exist.test.mjs — P29B guard #3
 *
 * Legacy allowedFiles existence remains explicit for every domain, and the
 * current real ownership map still passes the guard.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { checkFilesExist } from '../../audit/subsystem_ownership_guard.mjs';

test('RULE-EXIST is explicit for legacy allowedFiles and the real map still passes', () => {
  const designerRuntime = [{ id: 'SS-01', domain: 'designer-runtime', allowedFiles: ['Real.js', 'Missing.js'] }];
  assert.deepEqual(checkFilesExist(designerRuntime, new Set(['Real.js'])), [
    { rule: 'RULE-EXIST', subsystem: 'SS-01', file: 'Missing.js', detail: 'engines/Missing.js does not exist on disk' },
  ]);

  const backendRender = [{ id: 'SS-B01', domain: 'backend-render', allowedFiles: ['ZombiePythonShim.js'] }];
  assert.deepEqual(checkFilesExist(backendRender, new Set()), [
    { rule: 'RULE-EXIST', subsystem: 'SS-B01', file: 'ZombiePythonShim.js', detail: 'engines/ZombiePythonShim.js does not exist on disk' },
  ]);

  assert.deepEqual(
    checkFilesExist([
      { id: 'SS-B01', domain: 'backend-render', allowedFiles: [] },
      { id: 'SS-B02', domain: 'backend-render', allowedFiles: [] },
    ], new Set()),
    []
  );

  assert.deepEqual(checkFilesExist([{ id: 'SS-01', domain: 'designer-runtime', allowedFiles: ['Real.js'] }], new Set(['Real.js'])), []);

  const output = execFileSync('node', ['audit/subsystem_ownership_guard.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.match(output, /PASS — all ownership rules satisfied\./);
});
