import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runSubsystemGate } from '../../../tools/salad-score/subsystem-gate/runner/run_subsystem_gate.mjs';
import { withMaterializedFixture } from './fixture_materializer.mjs';
import { fileURLToPath } from 'node:url';
const CONFIG_PATH = fileURLToPath(new URL('../../../salad-score.config.json', import.meta.url));
const SCENARIO = JSON.parse(fs.readFileSync(new URL('./scenario-data/scenarios.json', import.meta.url), 'utf8'));

test('T45: a declared non-scoreable file that does not exist on disk surfaces in MISSING_NON_SCOREABLE_FILES and fails', async () => {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  await withMaterializedFixture({
    files: [SCENARIO.ownedCleanA],
    scopeMap: { subsystems: { 'SS-NSMISSING': { files: ['engines/owned_clean_a.mjs'], nonScoreableFiles: ['does_not_exist.json'], allOwnedFiles: ['engines/owned_clean_a.mjs', 'does_not_exist.json'], allowedOwners: ['owner-x'] } } },
    ownershipMap: { subsystems: [{ owner: 'owner-x', allowedFiles: ['owned_clean_a.mjs'] }] },
  }, async (root) => {
    const result = runSubsystemGate({ root, config, ownershipMapPath: root + '/audit/subsystem_ownership_map.json', scopeMapPath: root + '/audit/subsystem_scope_map.json', subsystemId: 'SS-NSMISSING' });
    assert.equal(result.FINAL_GATE_STATUS, 'FAIL');
    assert.deepEqual(result.MISSING_NON_SCOREABLE_FILES, ['does_not_exist.json']);
  });
});
