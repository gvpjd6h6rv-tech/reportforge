import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runSubsystemGate } from '../../../tools/salad-score/subsystem-gate/runner/run_subsystem_gate.mjs';
import { withMaterializedFixture } from './fixture_materializer.mjs';
import { fileURLToPath } from 'node:url';
const CONFIG_PATH = fileURLToPath(new URL('../../../salad-score.config.json', import.meta.url));
const SCENARIO = JSON.parse(fs.readFileSync(new URL('./scenario-data/scenarios.json', import.meta.url), 'utf8'));

test('T21: a file with a REAL owner not in the subsystem allowedOwners list fails the gate (distinct from unowned)', async () => {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  await withMaterializedFixture({
    files: [SCENARIO.ownedCleanA],
    scopeMap: { subsystems: { 'SS-WRONG-OWNER': { files: ['engines/owned_clean_a.mjs'], allOwnedFiles: ['engines/owned_clean_a.mjs'], allowedOwners: ['owner-y'] } } },
    ownershipMap: { subsystems: [{ owner: 'owner-x', allowedFiles: ['owned_clean_a.mjs'] }] },
  }, async (root) => {
    const result = runSubsystemGate({ root, config, ownershipMapPath: root + '/audit/subsystem_ownership_map.json', scopeMapPath: root + '/audit/subsystem_scope_map.json', subsystemId: 'SS-WRONG-OWNER' });
    assert.equal(result.FINAL_GATE_STATUS, 'FAIL');
    assert.equal(result.CHECKS.ownerInSubsystem, 'FAIL');
    assert.equal(result.CHECKS.noOwnershipViolations, 'PASS');
    assert.deepEqual(result.UNOWNED_SCOREABLE_FILES, []);
  });
});
