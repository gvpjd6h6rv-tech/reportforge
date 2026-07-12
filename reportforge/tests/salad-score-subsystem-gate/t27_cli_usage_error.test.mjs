import test from 'node:test';
import assert from 'node:assert/strict';
import { main } from '../../../tools/salad-score/subsystem-gate/bin/salad-score-subsystem.mjs';
import { captureCliOutput } from './_capture_cli_output.mjs';

test('T27: exit 2 with a usage message in stderr + EMPTY stdout when a required flag is missing', () => {
  process.exitCode = undefined;
  const out = captureCliOutput(() => main(['--root', '/tmp']));
  assert.equal(out.result, null);
  assert.equal(process.exitCode, 2);
  assert.equal(out.stdout, '');
  assert.match(out.stderr, /usage error/);
  process.exitCode = undefined;
});
