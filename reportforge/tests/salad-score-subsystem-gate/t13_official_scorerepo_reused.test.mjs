import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scoreRepo } from '../../../tools/salad-score/scoring/score_repo.mjs';
import { calculateSubsystemScore } from '../../../tools/salad-score/subsystem-gate/scoring/calculate_subsystem_score.mjs';
import { scanFixtureRoot } from './_shared_scan_fixture.mjs';
import { withMaterializedFixture } from './fixture_materializer.mjs';
import { fileURLToPath } from 'node:url';
const CONFIG_PATH = fileURLToPath(new URL('../../../salad-score.config.json', import.meta.url));
const { presets, ownedCleanA, ownedCleanB } = JSON.parse(fs.readFileSync(new URL('./scenario-data/scenarios.json', import.meta.url), 'utf8'));
const P = presets.multiOwnerValid;
const CFG = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

test('T13: SP_SUBSYSTEM_SCORE equals the OFFICIAL scoreRepo() on the same scoped set', async () => {
  await withMaterializedFixture({ files: [ownedCleanA, ownedCleanB], scopeMap: P.scopeMap, ownershipMap: P.ownershipMap }, async (root) => {
    const scoped = scanFixtureRoot(root, CFG, root + '/audit/subsystem_ownership_map.json', P.declared);
    assert.equal(calculateSubsystemScore(scoped), scoreRepo(scoped));
  });
});
