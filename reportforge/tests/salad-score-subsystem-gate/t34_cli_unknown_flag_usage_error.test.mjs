import test from 'node:test';
import assert from 'node:assert/strict';
import { main } from '../../../tools/salad-score/subsystem-gate/bin/salad-score-subsystem.mjs';
import { captureCliOutput } from './_capture_cli_output.mjs';

test('T34: exit 2 with an unknown flag (usage error), empty stdout', () => {
  process.exitCode = undefined;
  const out = captureCliOutput(() => main(['--root', '/tmp', '--config', '/tmp/x.json', '--ownership-map', '/tmp/y.json', '--scope-map', '/tmp/z.json', '--subsystem-id', 'X', '--bogus-flag', 'y']));
  assert.equal(out.result, null);
  assert.equal(process.exitCode, 2);
  assert.equal(out.stdout, '');
  process.exitCode = undefined;
});
