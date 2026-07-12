'use strict';
import { extractModuleReferences } from '../ast/extract_module_references.mjs';

export function buildModuleEdges(input = {}) {
  const files = Array.isArray(input) ? input : Array.isArray(input?.files) ? input.files : [];
  const edges = [];
  for (const file of files) {
    const source = file?.source || file?.code || file?.text || '';
    const refs = extractModuleReferences(source).references;
    for (const ref of refs) {
      const target = ref.specifier.replace(/\\/g, '/');
      if (!target || target === file.path || target === file.relative) continue;
      edges.push({ from: file.path || file.relative || null, to: target, kind: ref.kind });
    }
  }
  return { edges };
}
