import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { checkTestExactlyOneEntrypointAst } from '../../../tools/salad-score/subsystem-gate/contracts/check_test_exactly_one_entrypoint_ast.mjs';

test('ARCH14 (AST-based, replaces ARCH11 text-count proxy): every T*/ARCH* file contains exactly one real top-level test(...) call (immune to self-referential string matches)', () => {
  const dir = new URL('.', import.meta.url).pathname;
  const violations = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.test.mjs')) continue;
    const r = checkTestExactlyOneEntrypointAst(fs.readFileSync(dir + name, 'utf8'));
    if (!r.value) violations.push(`${name}: ${r.evidence.join(',')}`);
  }
  assert.deepEqual(violations, []);
});
