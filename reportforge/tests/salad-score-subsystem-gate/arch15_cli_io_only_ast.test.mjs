import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { checkCliIoOnlyAst } from '../../../tools/salad-score/subsystem-gate/contracts/check_cli_io_only_ast.mjs';

test('ARCH15 (AST-based, replaces ARCH10 regex proxy): the CLI imports only node:fs + the runner layer, and reads only result.FINAL_GATE_STATUS -- never checkers/scoring directly, never another result field', () => {
  const text = fs.readFileSync(new URL('../../../tools/salad-score/subsystem-gate/bin/salad-score-subsystem.mjs', import.meta.url), 'utf8');
  const result = checkCliIoOnlyAst(text);
  assert.equal(result.value, true, JSON.stringify(result.evidence));
});
