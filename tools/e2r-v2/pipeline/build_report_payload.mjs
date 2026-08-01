
'use strict';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function buildReportPayload({ root, capabilityMap, capabilityMapPath, ownershipMapPath, inventory, scoring, generatedAt = new Date().toISOString() } = {}) {
  const files = Array.isArray(scoring?.files) ? scoring.files : [];
  const memberCount = files.filter((file) => file.classification === 'GEOMETRY_MEMBER').length;
  const dependentCount = files.filter((file) => file.classification === 'GEOMETRY_DEPENDENT').length;
  const excludedCount = files.filter((file) => file.classification === 'GEOMETRY_EXCLUDED').length;
  const capability = clone(scoring?.capability ?? {});
  const publicationStatus = (
    scoring?.publicationStatus === 'PUBLISHED'
    || (
      scoring?.semanticScopeStatus === 'COMPLETE'
      && scoring?.scoreObservabilityStatus === 'COMPLETE'
      && Number.isFinite(capability?.expectedCount)
      && Number.isFinite(capability?.observedCount)
      && capability.observedCount >= capability.expectedCount
      && Number.isFinite(capability?.missingCount)
      && capability.missingCount === 0
    )
  ) ? 'PUBLISHED' : (scoring?.publicationStatus ?? 'NOT_OBSERVABLE');
  return {
    phaseId: 'E2R-V2-PHASE-1-GEOMETRY-AND-FILE-SCORING',
    capabilityId: 'CAPABILITY-GEOMETRY',
    generatedAt,
    root,
    capabilityMap: clone(capabilityMap ?? {}),
    capabilityMapPath,
    ownershipMapPath,
    files: clone(files),
    summary: {
      totalPhysical: Array.isArray(inventory?.physical) ? inventory.physical.length : 0,
      memberCount: scoring?.summary?.memberCount ?? memberCount,
      dependentCount: scoring?.summary?.dependentCount ?? dependentCount,
      excludedCount: scoring?.summary?.excludedCount ?? excludedCount,
      subsystem: clone(scoring?.subsystem ?? {}),
      capability,
    },
    declarationStatus: scoring?.declarationStatus ?? 'NOT_OBSERVABLE',
    semanticScopeStatus: scoring?.semanticScopeStatus ?? 'NOT_OBSERVABLE',
    ownershipCompletenessStatus: scoring?.ownershipCompletenessStatus ?? 'NOT_OBSERVABLE',
    scoreObservabilityStatus: scoring?.scoreObservabilityStatus ?? 'NOT_OBSERVABLE',
    publicationStatus,
    bfsCandidates: [],
    reviewedBfsCandidates: [],
    scopeMap: {},
    ownershipMap: {},
    coverageOwnershipIdExceptions: {},
  };
}
