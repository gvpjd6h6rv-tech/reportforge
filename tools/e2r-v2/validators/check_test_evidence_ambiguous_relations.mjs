
'use strict';

function normalizePath(value) {
  return String(value ?? '').replace(/\\/g, '/').trim();
}

export function checkTestEvidenceAmbiguousRelations(records = []) {
  const list = Array.isArray(records) ? records : [];
  const productionToSources = new Map();
  const sourceToProductions = new Map();
  for (const record of list) {
    const productionFile = normalizePath(record?.productionFile);
    const sourcePath = normalizePath(record?.sourcePath);
    if (!productionFile || !sourcePath) continue;
    if (!productionToSources.has(productionFile)) productionToSources.set(productionFile, new Set());
    if (!sourceToProductions.has(sourcePath)) sourceToProductions.set(sourcePath, new Set());
    productionToSources.get(productionFile).add(sourcePath);
    sourceToProductions.get(sourcePath).add(productionFile);
  }
  const diagnostics = [];
  for (const [productionFile, sources] of productionToSources.entries()) {
    if (sources.size > 1) diagnostics.push({ code: 'TEST_EVIDENCE_RELATION_AMBIGUOUS', productionFile, sourcePaths: [...sources].sort() });
  }
  for (const [sourcePath, productions] of sourceToProductions.entries()) {
    if (productions.size > 1) diagnostics.push({ code: 'TEST_EVIDENCE_RELATION_AMBIGUOUS', sourcePath, productionFiles: [...productions].sort() });
  }
  return {
    name: 'check_test_evidence_ambiguous_relations',
    value: diagnostics.length === 0,
    evidence: {
      total: list.length,
      ambiguousProductionFileCount: [...productionToSources.values()].filter((set) => set.size > 1).length,
      ambiguousSourcePathCount: [...sourceToProductions.values()].filter((set) => set.size > 1).length,
    },
    diagnostics,
  };
}
