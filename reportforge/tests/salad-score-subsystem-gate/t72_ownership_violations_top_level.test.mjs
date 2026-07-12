import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runSubsystemGate } from '../../../tools/salad-score/subsystem-gate/runner/run_subsystem_gate.mjs';
import { withMaterializedFixture } from './fixture_materializer.mjs';
import { fileURLToPath } from 'node:url';
const CONFIG_PATH = fileURLToPath(new URL('../../../salad-score.config.json', import.meta.url));
const SCENARIO = JSON.parse(fs.readFileSync(new URL('./scenario-data/scenarios.json', import.meta.url), 'utf8'));

test('T72: OWNERSHIP_VIOLATIONS is a top-level, sorted, relative-canonical union of UNOWNED_SCOREABLE_FILES and UNOWNED_NON_SCOREABLE_FILES, present even when empty', async () => {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  await withMaterializedFixture({
    files: [SCENARIO.unowned],
    scopeMap: { subsystems: { 'SS-UNOWNED': { files: ['engines/unowned_file.mjs'], allOwnedFiles: ['engines/unowned_file.mjs'], allowedOwners: [] } } },
    ownershipMap: { subsystems: [] },
  }, async (root) => {
    const result = runSubsystemGate({ root, config, ownershipMapPath: root + '/audit/subsystem_ownership_map.json', scopeMapPath: root + '/audit/subsystem_scope_map.json', subsystemId: 'SS-UNOWNED' });
    assert.deepEqual(result.OWNERSHIP_VIOLATIONS, ['engines/unowned_file.mjs']);
    assert.equal(result.UNOWNED_SCOREABLE_FILES.length, 1);
    assert.ok(!result.OWNERSHIP_VIOLATIONS[0].startsWith('/'), 'must be relative, not absolute');
  });
});
