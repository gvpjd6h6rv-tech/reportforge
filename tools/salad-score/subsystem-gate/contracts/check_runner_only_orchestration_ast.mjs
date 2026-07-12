'use strict';
import { parse } from 'acorn';
import { astWalk } from './ast_walk.mjs';

/** AST-based rule: the runner may branch ONLY on the standardized
 *  {value, evidence} result of an IMPORTED checker (an IfStatement testing
 *  `.value` -- possibly negated -- on a variable assigned directly from an
 *  imported function call). It may NEVER derive a gate condition directly
 *  from domain data (no BinaryExpression/LogicalExpression(!='??')/
 *  SwitchStatement anywhere; no IfStatement testing anything else). */
export function checkRunnerOnlyOrchestrationAst(text) {
  const ast = parse(text, { ecmaVersion: 2022, sourceType: 'module', locations: true, allowHashBang: true });
  const violations = [];
  const importedNames = new Set();
  for (const node of ast.body) if (node.type === 'ImportDeclaration') for (const s of node.specifiers) importedNames.add(s.local.name);

  const checkerResultVars = new Set();
  astWalk(ast, (n) => {
    if (n.type === 'VariableDeclarator' && n.init?.type === 'CallExpression' && n.init.callee.type === 'Identifier' && importedNames.has(n.init.callee.name)) checkerResultVars.add(n.id.name);
  });

  astWalk(ast, (n) => {
    if (n.type === 'SwitchStatement') violations.push(`SwitchStatement at L${n.loc?.start.line}`);
    if (n.type === 'BinaryExpression') violations.push(`BinaryExpression(${n.operator}) at L${n.loc?.start.line}`);
    if (n.type === 'LogicalExpression' && n.operator !== '??') violations.push(`LogicalExpression(${n.operator}) at L${n.loc?.start.line}`);
    if (n.type === 'IfStatement') {
      let test = n.test;
      if (test.type === 'UnaryExpression' && test.operator === '!') test = test.argument;
      const ok = test.type === 'MemberExpression' && test.property.name === 'value' && test.object.type === 'Identifier' && checkerResultVars.has(test.object.name);
      if (!ok) violations.push(`IfStatement at L${n.loc?.start.line} does not test a tracked checker result's .value`);
    }
  });
  return { value: violations.length === 0, evidence: violations };
}
