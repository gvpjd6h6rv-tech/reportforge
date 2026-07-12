import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runSubsystemGate } from '../../../tools/salad-score/subsystem-gate/runner/run_subsystem_gate.mjs';
import { withMaterializedFixture } from './fixture_materializer.mjs';
import { fileURLToPath } from 'node:url';
const CONFIG_PATH = fileURLToPath(new URL('../../../salad-score.config.json', import.meta.url));
const SCENARIO = JSON.parse(fs.readFileSync(new URL('./scenario-data/scenarios.json', import.meta.url), 'utf8'));

test('T5: a declared file that was not materialized/scanned surfaces in MISSING_FILES and fails', async () => {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  await withMaterializedFixture({
    files: [SCENARIO.ownedCleanA],
    scopeMap: { subsystems: { 'SS-MISSING': { files: ['engines/owned_clean_a.mjs', 'engines/does_not_exist.mjs'], allOwnedFiles: ['engines/owned_clean_a.mjs', 'engines/does_not_exist.mjs'], allowedOwners: ['owner-x'] } } },
    ownershipMap: { subsystems: [{ owner: 'owner-x', allowedFiles: ['owned_clean_a.mjs'] }] },
  }, async (root) => {
    const result = runSubsystemGate({ root, config, ownershipMapPath: root + '/audit/subsystem_ownership_map.json', scopeMapPath: root + '/audit/subsystem_scope_map.json', subsystemId: 'SS-MISSING' });
    assert.equal(result.FINAL_GATE_STATUS, 'FAIL');
    assert.equal(result.MISSING_SCOREABLE_FILES.length, 1);
    assert.ok(result.MISSING_SCOREABLE_FILES[0].endsWith('does_not_exist.mjs'));
  });
});
