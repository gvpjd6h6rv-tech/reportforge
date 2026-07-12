import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runCliInFixture } from './_run_cli_in_fixture.mjs';
import { writeTempBrokenJson } from './_write_temp_broken_json.mjs';
const SCENARIO = JSON.parse(fs.readFileSync(new URL('./scenario-data/scenarios.json', import.meta.url), 'utf8'));
const FIXTURE = { files: [SCENARIO.ownedCleanA], scopeMap: { subsystems: { 'SS-VALID': { files: ['engines/owned_clean_a.mjs'], allOwnedFiles: ['engines/owned_clean_a.mjs'], allowedOwners: ['owner-x'] } } }, ownershipMap: { subsystems: [{ owner: 'owner-x', allowedFiles: ['owned_clean_a.mjs'] }] } };

test('T38: exit 3 + empty stdout when --config contains invalid JSON', async () => {
  const broken = writeTempBrokenJson('t38');
  try {
    const out = await runCliInFixture(FIXTURE, () => ({ config: broken, subsystemId: 'SS-VALID' }));
    assert.equal(out.exitCode, 3);
    assert.equal(out.stdout, '');
  } finally { fs.unlinkSync(broken); }
});
