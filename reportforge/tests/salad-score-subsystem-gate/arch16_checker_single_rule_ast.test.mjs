import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { checkCheckerSingleRuleAst } from '../../../tools/salad-score/subsystem-gate/contracts/check_checker_single_rule_ast.mjs';

test('ARCH16 (AST-based, replaces ARCH12 export-count proxy): every checker/contract file exports exactly 1 function, performs no I/O, imports no other checker unless declared as an orchestrator (2+ sibling-checker imports), and returns one consistent shape', () => {
  const dirs = ['checkers', 'contracts'];
  const violations = [];
  for (const dir of dirs) {
    const path = new URL(`../../../tools/salad-score/subsystem-gate/${dir}/`, import.meta.url).pathname;
    for (const name of fs.readdirSync(path)) {
      const r = checkCheckerSingleRuleAst(fs.readFileSync(path + name, 'utf8'));
      if (!r.value) violations.push(`${dir}/${name}: ${r.evidence.join(',')}`);
    }
  }
  assert.deepEqual(violations, []);
});
