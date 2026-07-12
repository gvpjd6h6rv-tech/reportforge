import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runSubsystemGate } from '../../../tools/salad-score/subsystem-gate/runner/run_subsystem_gate.mjs';
import { withMaterializedFixture } from './fixture_materializer.mjs';
import { fileURLToPath } from 'node:url';
const CONFIG_PATH = fileURLToPath(new URL('../../../salad-score.config.json', import.meta.url));
const SCENARIO = JSON.parse(fs.readFileSync(new URL('./scenario-data/scenarios.json', import.meta.url), 'utf8'));

test('T59: allOwnedFiles declaring a phantom entry absent from BOTH partitions fails SCOPE-COMPLETENESS-01 (the omission the derived-union design could never detect)', async () => {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  await withMaterializedFixture({
    files: [SCENARIO.ownedCleanA],
    scopeMap: { subsystems: { 'SS-PHANTOM': {
      files: ['engines/owned_clean_a.mjs'],
      allOwnedFiles: ['engines/owned_clean_a.mjs', 'engines/phantom_never_partitioned.mjs'],
      allowedOwners: ['owner-x'],
    } } },
    ownershipMap: { subsystems: [{ owner: 'owner-x', allowedFiles: ['owned_clean_a.mjs'] }] },
  }, async (root) => {
    const result = runSubsystemGate({ root, config, ownershipMapPath: root + '/audit/subsystem_ownership_map.json', scopeMapPath: root + '/audit/subsystem_scope_map.json', subsystemId: 'SS-PHANTOM' });
    assert.equal(result.FINAL_GATE_STATUS, 'FAIL');
    assert.equal(result.CHECKS.allOwnedFilesComplete, 'FAIL');
  });
});
