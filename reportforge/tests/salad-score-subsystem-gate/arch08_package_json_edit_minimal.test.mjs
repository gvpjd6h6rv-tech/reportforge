import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Contract ID: ARCH8-POSTAPPLY-PACKAGE-MANIFEST-INTEGRITY (supersedes the
 *  retired pre-apply ARCH8-PREAPPLY-DRAFT-MINIMALITY, which compared a
 *  not-yet-applied draft against a before-snapshot -- both scratch-only
 *  artifacts, never part of the approved 133-file manifest, now moot since
 *  the edit is already applied for real). Reads ONLY the real root
 *  package.json / package-lock.json and asserts the subsystem-gate's
 *  manifest integration is complete, self-contained, and reproducible --
 *  no dependency on scratch artifacts. */
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const pkg = JSON.parse(fs.readFileSync(ROOT + 'package.json', 'utf8'));
const lock = JSON.parse(fs.readFileSync(ROOT + 'package-lock.json', 'utf8'));

test('ARCH8: package.json/package-lock.json carry the subsystem-gate script, the relocated governance map paths, and the acorn devDependency -- exactly, reproducibly, with no scratch-artifact dependency', () => {
  // 1. canonical script exists
  assert.ok('salad-score:subsystem' in pkg.scripts, 'salad-score:subsystem script must exist');
  const cmd = pkg.scripts['salad-score:subsystem'];

  // 2. command uses the final bin path
  assert.ok(cmd.includes('tools/salad-score/subsystem-gate/'), 'command must reference tools/salad-score/subsystem-gate/');

  // 3. command uses the relocated governance maps
  assert.ok(cmd.includes('tools/salad-score/subsystem-gate/governance/subsystem_scope_map.json'), 'command must reference the relocated scope map');
  assert.ok(cmd.includes('tools/salad-score/subsystem-gate/governance/subsystem_ownership_map.json'), 'command must reference the relocated ownership map');

  // 4. no stale/forbidden references
  for (const forbidden of ['audit/subsystem_scope_map.json', '/tmp/sss-gate', 'package.json.draft', 'package.json.scripts.before.json']) {
    assert.ok(!cmd.includes(forbidden), `command must not reference ${forbidden}`);
  }

  // 5-6-7. acorn devDependency, exact version, present + correctly declared in the lockfile
  assert.equal(pkg.devDependencies.acorn, '^8.17.0');
  assert.equal(lock.packages[''].devDependencies.acorn, pkg.devDependencies.acorn);
  assert.equal(lock.packages['node_modules/acorn'].version, '8.17.0');
  assert.equal(lock.packages['node_modules/acorn'].dev, true);

  // 8. pre-existing dependencies untouched
  assert.equal(pkg.dependencies.playwright, '1.58.2');
  assert.equal(pkg.devDependencies['@playwright/test'], '1.58.2');

  // 9. lockfile format untouched
  assert.equal(lock.lockfileVersion, 3);
});
