import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

test('ARCH7: the draft ownership-map edit assigns only files that really exist, and every scoped file has an owner (no phantom names, no orphans, no sharedFiles bypass)', () => {
  const map = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../../../tools/salad-score/subsystem-gate/governance/subsystem_ownership_map.json', import.meta.url)), 'utf8'));
  assert.ok(!('sharedFiles' in map) || map.sharedFiles.length === 0, 'sharedFiles must not be used as a scoring bypass');
  const realFiles = new Set();
  for (const dir of ['collectors', 'checkers', 'scoring', 'contracts', 'runner', 'bin']) {
    for (const name of fs.readdirSync(fileURLToPath(new URL('../../../tools/salad-score/subsystem-gate/' + dir, import.meta.url)))) realFiles.add(name);
  }
  const declared = new Set(map.subsystems.find((s) => s.owner === 'salad-score-runner').allowedFiles);
  for (const name of declared) assert.ok(realFiles.has(name), `ownership map declares a phantom file: ${name}`);
  for (const name of realFiles) assert.ok(declared.has(name), `real file has no owner: ${name}`);
});
