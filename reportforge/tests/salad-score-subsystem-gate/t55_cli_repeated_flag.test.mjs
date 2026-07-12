import test from 'node:test';
import assert from 'node:assert/strict';
import { main } from '../../../tools/salad-score/subsystem-gate/bin/salad-score-subsystem.mjs';
import { captureCliOutput } from './_capture_cli_output.mjs';

test('T55: a repeated flag uses the LAST occurrence (documented, deterministic argv precedence -- not a usage error)', () => {
  process.exitCode = undefined;
  const out = captureCliOutput(() => main(['--root', '/tmp/first', '--root', '/tmp/second', '--config', '/x', '--ownership-map', '/x', '--scope-map', '/x', '--subsystem-id', 'X']));
  assert.equal(out.result, null);
  assert.equal(process.exitCode, 3);
  process.exitCode = undefined;
});
