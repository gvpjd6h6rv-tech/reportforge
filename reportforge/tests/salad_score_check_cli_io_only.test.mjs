'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkCliIoOnly } from '../../tools/salad-score/checkers/check_cli_io_only.mjs';

test('checkCliIoOnly — fails when the CLI contains regex matching logic', () => {
  assert.equal(checkCliIoOnly('bin.mjs', "text.exec(/x/)").value, false);
});

test('checkCliIoOnly — passes for plain argv parsing', () => {
  assert.equal(checkCliIoOnly('bin.mjs', "if (a === '--root') {}").value, true);
});
