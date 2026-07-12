import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runCliInFixture } from './_run_cli_in_fixture.mjs';
import { fileURLToPath } from 'node:url';
const CONFIG_PATH = fileURLToPath(new URL('../../../salad-score.config.json', import.meta.url));
const SCENARIO = JSON.parse(fs.readFileSync(new URL('./scenario-data/scenarios.json', import.meta.url), 'utf8'));
const FIXTURE = { files: [SCENARIO.ownedCleanA], scopeMap: { subsystems: { 'SS-VALID': { files: ['engines/owned_clean_a.mjs'], allOwnedFiles: ['engines/owned_clean_a.mjs'], allowedOwners: ['owner-x'] } } }, ownershipMap: { subsystems: [{ owner: 'owner-x', allowedFiles: ['owned_clean_a.mjs'] }] } };

test('T35: exit 3 + empty stdout when ownership-map does not exist', async () => {
  const out = await runCliInFixture(FIXTURE, (root) => ({ config: CONFIG_PATH, subsystemId: 'SS-VALID', ownershipMap: root + '/audit/DOES_NOT_EXIST.json' }));
  assert.equal(out.exitCode, 3);
  assert.equal(out.stdout, '');
});
