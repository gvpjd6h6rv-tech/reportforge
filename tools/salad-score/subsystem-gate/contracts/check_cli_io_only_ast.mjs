'use strict';
import { parse } from 'acorn';

/** AST-based rule (replaces the string-comparison-domain proxy): the CLI
 *  module may import ONLY from 'node:fs' and the runner layer (never a
 *  checker or scoring module directly -- that would mean the CLI is
 *  re-implementing/duplicating a rule instead of delegating entirely to
 *  the runner). It may inspect ONLY result.FINAL_GATE_STATUS on the
 *  returned object (never any other field -- e.g. never
 *  result.sp_total_score, result.CHECKS, etc, which would mean the CLI is
 *  making its own judgement about internals instead of trusting the
 *  runner's single verdict field). */
export function checkCliIoOnlyAst(text) {
  const ast = parse(text, { ecmaVersion: 2022, sourceType: 'module', locations: true, allowHashBang: true });
  const violations = [];
  for (const node of ast.body) {
    if (node.type === 'ImportDeclaration') {
      const src = node.source.value;
      const allowed = src === 'node:fs' || /\/runner\//.test(src) || src.startsWith('../runner/');
      if (!allowed) violations.push(`disallowed import: ${src}`);
    }
  }
  const text2 = text; // scan for direct field access other than FINAL_GATE_STATUS
  const forbiddenFieldAccess = [...text2.matchAll(/\bresult\.(\w+)/g)].map((m) => m[1]).filter((f) => f !== 'FINAL_GATE_STATUS');
  if (forbiddenFieldAccess.length > 0) violations.push(`CLI reads result.${forbiddenFieldAccess[0]} directly (only FINAL_GATE_STATUS is allowed)`);
  return { value: violations.length === 0, evidence: violations };
}
