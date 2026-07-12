import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runSubsystemGate } from '../../../tools/salad-score/subsystem-gate/runner/run_subsystem_gate.mjs';
import { withMaterializedFixture } from './fixture_materializer.mjs';
import { fileURLToPath } from 'node:url';
const CONFIG_PATH = fileURLToPath(new URL('../../../salad-score.config.json', import.meta.url));
const SCENARIO = JSON.parse(fs.readFileSync(new URL('./scenario-data/scenarios.json', import.meta.url), 'utf8'));

test('T1: a valid subsystem with declared files owned by DIFFERENT owners passes the gate', async () => {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  await withMaterializedFixture({
    files: [SCENARIO.ownedCleanA, SCENARIO.ownedCleanB],
    scopeMap: { subsystems: { 'SS-VALID': { files: ['engines/owned_clean_a.mjs', 'engines/owned_clean_b.mjs'], allOwnedFiles: ['engines/owned_clean_a.mjs', 'engines/owned_clean_b.mjs'], allowedOwners: ['owner-x', 'owner-y'] } } },
    ownershipMap: { subsystems: [{ owner: 'owner-x', allowedFiles: ['owned_clean_a.mjs'] }, { owner: 'owner-y', allowedFiles: ['owned_clean_b.mjs'] }] },
  }, async (root) => {
    const result = runSubsystemGate({
      root, config, ownershipMapPath: root + '/audit/subsystem_ownership_map.json',
      scopeMapPath: root + '/audit/subsystem_scope_map.json', subsystemId: 'SS-VALID',
    });
    assert.equal(result.FINAL_GATE_STATUS, 'PASS');
    assert.equal(result.ALL_OWNED_FILES.length, 2);
  });
});
