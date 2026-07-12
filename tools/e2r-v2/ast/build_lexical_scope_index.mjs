'use strict';
export function buildLexicalScopeIndex(input = {}) {
  const source = typeof input === 'string' ? input : String(input?.source || input?.code || input?.text || '');
  const declarations = [];
  const shadowed = [];
  const scopes = [{ name: 'global', symbols: [] }];
  const declared = new Set();
  for (const match of source.matchAll(/\b(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)) {
    const name = match[1];
    if (declared.has(name)) shadowed.push(name);
    declared.add(name);
    declarations.push(name);
    scopes[0].symbols.push(name);
  }
  return { declarations, shadowed, scopes };
}
