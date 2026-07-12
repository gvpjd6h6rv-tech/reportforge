'use strict';
import { parse } from 'acorn';
import { astWalk } from './ast_walk.mjs';

/** AST-based rule: an ATOMIC checker exports exactly 1 function, performs
 *  no I/O, imports no OTHER checker (2+ sibling-checker imports = declared
 *  orchestrator, exempt from that one sub-rule), and every return path
 *  builds the same {value, evidence} shape. */
export function checkCheckerSingleRuleAst(text) {
  const ast = parse(text, { ecmaVersion: 2022, sourceType: 'module', locations: true, allowHashBang: true });
  const violations = [];
  const exported = ast.body.filter((n) => n.type === 'ExportNamedDeclaration' && n.declaration?.type === 'FunctionDeclaration');
  if (exported.length !== 1) violations.push(`expected exactly 1 exported function, found ${exported.length}`);

  const checkerImports = ast.body.filter((n) => n.type === 'ImportDeclaration' && /\.\.\/checkers\/|\.\/check_/.test(n.source.value));
  const isOrchestrator = checkerImports.length >= 2;
  for (const node of ast.body) {
    if (node.type !== 'ImportDeclaration') continue;
    const src = node.source.value;
    if (/node:(fs|child_process|http|net)/.test(src)) violations.push(`checker performs I/O via import: ${src}`);
    if (!isOrchestrator && /\.\.\/checkers\/|\.\/check_/.test(src)) violations.push(`atomic checker imports another checker: ${src}`);
  }

  const returnShapes = new Set();
  if (exported[0]) {
    astWalk(exported[0].declaration.body, (n) => {
      if (n.type === 'AwaitExpression') violations.push(`checker uses await (I/O) at L${n.loc?.start.line}`);
      if (n.type === 'ReturnStatement' && n.argument?.type === 'ObjectExpression') returnShapes.add(n.argument.properties.map((p) => p.key?.name).sort().join(','));
    });
  }
  if (returnShapes.size > 1) violations.push(`multiple distinct return shapes: ${[...returnShapes].join(' | ')}`);
  return { value: violations.length === 0, evidence: violations, isOrchestrator };
}
