'use strict';
export function extractModuleReferences(input = {}) {
  const source = typeof input === 'string' ? input : String(input?.source || input?.code || input?.text || '');
  const references = [];
  for (const match of source.matchAll(/\bimport\s+(?:[^'"`]+?\s+from\s+)?['"]([^'"`]+)['"]/g)) {
    references.push({ kind: 'IMPORT', specifier: match[1] });
  }
  for (const match of source.matchAll(/\brequire\s*\(\s*['"]([^'"`]+)['"]\s*\)/g)) {
    references.push({ kind: 'REQUIRE', specifier: match[1] });
  }
  for (const match of source.matchAll(/\bimport\s*\(\s*['"]([^'"`]+)['"]\s*\)/g)) {
    references.push({ kind: 'DYNAMIC_IMPORT', specifier: match[1] });
  }
  return {
    references,
    imports: references.filter((ref) => ref.kind === 'IMPORT').length,
    requires: references.filter((ref) => ref.kind === 'REQUIRE').length,
    dynamicImports: references.filter((ref) => ref.kind === 'DYNAMIC_IMPORT').length,
  };
}
