import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runCliInFixture } from './_run_cli_in_fixture.mjs';
import { fileURLToPath } from 'node:url';
const CONFIG_PATH = fileURLToPath(new URL('../../../salad-score.config.json', import.meta.url));
const SCENARIO = JSON.parse(fs.readFileSync(new URL('./scenario-data/scenarios.json', import.meta.url), 'utf8'));
const FIXTURE = {
  files: [SCENARIO.ownedCleanA, SCENARIO.unowned],
  scopeMap: { subsystems: { 'SS-VALID': { files: ['engines/owned_clean_a.mjs'], allOwnedFiles: ['engines/owned_clean_a.mjs'], allowedOwners: ['owner-x'] }, 'SS-UNOWNED': { files: ['engines/unowned_file.mjs'], allOwnedFiles: ['engines/unowned_file.mjs'], allowedOwners: [] } } },
  ownershipMap: { subsystems: [{ owner: 'owner-x', allowedFiles: ['owned_clean_a.mjs'] }] },
};

test('T17: exit 0 + stdout PASS + empty stderr; exit 1 + stdout FAIL + empty stderr', async () => {
  const pass = await runCliInFixture(FIXTURE, () => ({ config: CONFIG_PATH, subsystemId: 'SS-VALID' }));
  assert.equal(pass.exitCode, 0);
  assert.equal(pass.stderr, '');
  assert.equal(JSON.parse(pass.stdout).FINAL_GATE_STATUS, 'PASS');
  const fail = await runCliInFixture(FIXTURE, () => ({ config: CONFIG_PATH, subsystemId: 'SS-UNOWNED' }));
  assert.equal(fail.exitCode, 1);
  assert.equal(fail.stderr, '');
  assert.equal(JSON.parse(fail.stdout).FINAL_GATE_STATUS, 'FAIL');
});
