'use strict';
export function buildReportViewModel(report) {
  const rows = [...(report.files || [])].sort((a, b) => a.path.localeCompare(b.path)).map((file) => ({ path: file.path, classification: file.classification, layer: file.primaryLayer || '', rule: file.semanticContractRule, spTotalScore: file.spTotalScore, spEaseComponent: file.spEaseComponent, rawScore: file.rawFileScore?.raw ?? null, finalScore: file.finalFileScore?.value ?? null, ownerState: file.ownerState || 'UNOWNED' }));
  return { phaseLabel: 'E2R V2 PHASE 1', capabilityLabel: 'SEMANTICALLY COMPLETE CAPABILITY: GEOMETRY ONLY', runtimeLabel: 'JS DESIGNER-RUNTIME ONLY', rows, summary: report.summary, publicationStatus: report.publicationStatus };
}
