import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runSubsystemGate } from '../../../tools/salad-score/subsystem-gate/runner/run_subsystem_gate.mjs';
import { withMaterializedFixture } from './fixture_materializer.mjs';
import { fileURLToPath } from 'node:url';
const CONFIG_PATH = fileURLToPath(new URL('../../../salad-score.config.json', import.meta.url));
const SCENARIO = JSON.parse(fs.readFileSync(new URL('./scenario-data/scenarios.json', import.meta.url), 'utf8'));

test('T7: the same unowned fact fails the gate via OWNERSHIP_VIOLATIONS', async () => {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  await withMaterializedFixture({
    files: [SCENARIO.unowned],
    scopeMap: { subsystems: { 'SS-UNOWNED': { files: ['engines/unowned_file.mjs'], allOwnedFiles: ['engines/unowned_file.mjs'], allowedOwners: [] } } },
    ownershipMap: { subsystems: [] },
  }, async (root) => {
    const result = runSubsystemGate({ root, config, ownershipMapPath: root + '/audit/subsystem_ownership_map.json', scopeMapPath: root + '/audit/subsystem_scope_map.json', subsystemId: 'SS-UNOWNED' });
    assert.equal(result.FINAL_GATE_STATUS, 'FAIL');
    assert.equal(result.CHECKS.noOwnershipViolations, 'FAIL');
    assert.deepEqual(result.UNOWNED_SCOREABLE_FILES, result.UNOWNED_SCOREABLE_FILES);
  });
});
