
'use strict';

function normalizePath(value) {
  return String(value ?? '').replace(/\\/g, '/').trim();
}

export function collectTestEvidenceRelations(records = []) {
  const canonicalRecords = Array.isArray(records) ? records : [];
  const byProductionFile = Object.create(null);
  const bySourcePath = Object.create(null);
  const relations = [];
  for (const record of canonicalRecords) {
    const productionFile = normalizePath(record?.productionFile);
    const sourcePath = normalizePath(record?.sourcePath);
    if (!productionFile || !sourcePath) continue;
    if (!byProductionFile[productionFile]) byProductionFile[productionFile] = [];
    if (!bySourcePath[sourcePath]) bySourcePath[sourcePath] = [];
    const relation = {
      productionFile,
      sourcePath,
      name: String(record?.name ?? '').trim() || productionFile.split('/').pop(),
      relationType: 'EXACT_PATH',
      evidenceStrength: record?.evidenceStrength ?? null,
      outcome: record?.outcome ?? null,
      status: 'OBSERVABLE',
    };
    byProductionFile[productionFile].push(relation);
    bySourcePath[sourcePath].push(relation);
    relations.push(relation);
  }
  const exactMatchCount = relations.filter((relation) => relation.productionFile === relation.sourcePath).length;
  return {
    relations,
    byProductionFile,
    bySourcePath,
    relationCount: relations.length,
    exactMatchCount,
    duplicateCount: 0,
    ambiguityCount: 0,
    diagnostics: [],
  };
}
