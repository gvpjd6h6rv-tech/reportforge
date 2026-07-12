import test from 'node:test';
import assert from 'node:assert/strict';
import { main } from '../../../tools/salad-score/subsystem-gate/bin/salad-score-subsystem.mjs';
import { captureCliOutput } from './_capture_cli_output.mjs';

test('T39: exit 2 when a flag is the last argv token with no value after it', () => {
  process.exitCode = undefined;
  const out = captureCliOutput(() => main(['--root', '/tmp', '--subsystem-id']));
  assert.equal(out.result, null);
  assert.equal(process.exitCode, 2);
  assert.equal(out.stdout, '');
  process.exitCode = undefined;
});
