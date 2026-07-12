import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { checkRunnerOnlyOrchestrationAst } from '../../../tools/salad-score/subsystem-gate/contracts/check_runner_only_orchestration_ast.mjs';

test('ARCH13 (AST-based, replaces ARCH9 token-count proxy): run_subsystem_gate.mjs never constructs a NEW comparison itself (may react to a delegated checker.value, may never embed ===, >, switch, etc)', () => {
  const text = fs.readFileSync(new URL('../../../tools/salad-score/subsystem-gate/runner/run_subsystem_gate.mjs', import.meta.url), 'utf8');
  const result = checkRunnerOnlyOrchestrationAst(text);
  assert.equal(result.value, true, JSON.stringify(result.evidence));
});
