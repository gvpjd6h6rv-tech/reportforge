import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runSubsystemGate } from '../../../tools/salad-score/subsystem-gate/runner/run_subsystem_gate.mjs';
import { withMaterializedFixture } from './fixture_materializer.mjs';
import { fileURLToPath } from 'node:url';
const CONFIG_PATH = fileURLToPath(new URL('../../../salad-score.config.json', import.meta.url));
const P = JSON.parse(fs.readFileSync(new URL('./scenario-data/scenarios.json', import.meta.url), 'utf8')).presets.nonScoreableDuplicateInvalid;

test('T70: a duplicate path WITHIN nonScoreableFiles fails under its own gate key, distinct from the scoreable-list reuse (T10)', async () => {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  await withMaterializedFixture(P, async (root) => {
    const result = runSubsystemGate({ root, config, ownershipMapPath: root + '/audit/subsystem_ownership_map.json', scopeMapPath: root + '/audit/subsystem_scope_map.json', subsystemId: 'SS-NSDUP' });
    assert.equal(result.CHECKS.noDuplicateNonScoreablePaths, 'FAIL');
    assert.equal(result.CHECKS.noDuplicateScopePaths, 'PASS');
  });
});
