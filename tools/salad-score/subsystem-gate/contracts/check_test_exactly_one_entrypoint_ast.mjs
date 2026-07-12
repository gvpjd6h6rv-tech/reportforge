'use strict';
import { parse } from 'acorn';

/** AST-based rule: counts top-level CallExpression nodes whose callee is
 *  the LOCAL BINDING actually imported from 'node:test' (handles rename:
 *  `import realTest from 'node:test'` is tracked by its bound local name,
 *  not the string "test"). Explicitly rejects other test-runner call forms
 *  as NOT valid single-entrypoint evidence: `it(...)`, `test.each(...)`,
 *  or any call whose callee is NOT that exact imported binding are not
 *  counted as the recognized entrypoint -- so a file using only `it(...)`
 *  registers ZERO entrypoints (fails, rather than silently passing via a
 *  different call form). Contract: the ONLY permitted entrypoint shape is
 *  a direct call to the binding imported by name 'default' from
 *  'node:test' (Node's test runner default export), invoked with no
 *  member access (no `.each`, `.skip`, etc). */
export function checkTestExactlyOneEntrypointAst(text) {
  const ast = parse(text, { ecmaVersion: 2022, sourceType: 'module', locations: true, allowHashBang: true });
  let testBinding = null;
  for (const node of ast.body) {
    if (node.type === 'ImportDeclaration' && node.source.value === 'node:test') {
      const def = node.specifiers.find((s) => s.type === 'ImportDefaultSpecifier');
      if (def) testBinding = def.local.name;
    }
  }
  if (!testBinding) return { value: false, evidence: ["no default import from 'node:test' found"] };

  let count = 0;
  for (const stmt of ast.body) {
    const expr = stmt.type === 'ExpressionStatement' ? stmt.expression : null;
    if (expr && expr.type === 'CallExpression' && expr.callee.type === 'Identifier' && expr.callee.name === testBinding) count++;
  }
  return { value: count === 1, evidence: count === 1 ? [] : [`found ${count} calls to the imported '${testBinding}' binding (must be exactly 1; .each/.skip/it() are not recognized entrypoints)`] };
}
