'use strict';
export function validateCapabilityMap(capabilityMap, physicalPaths = []) {
  const files = capabilityMap?.capabilities?.[0]?.files || [];
  const member = files.filter((f) => f.classification === 'GEOMETRY_MEMBER').length;
  const dependent = files.filter((f) => f.classification === 'GEOMETRY_DEPENDENT').length;
  const excluded = files.filter((f) => f.classification === 'GEOMETRY_EXCLUDED').length;
  const layerCounts = Object.create(null);
  for (const file of files) if (file.classification === 'GEOMETRY_MEMBER') layerCounts[file.primaryLayer] = (layerCounts[file.primaryLayer] || 0) + 1;
  const targets = { GEOMETRY_CORE: 4, GEOMETRY_MODEL: 7, GEOMETRY_LAYOUT: 8, GEOMETRY_HIT_TEST: 4, GEOMETRY_RENDER: 16, GEOMETRY_INTERACTION: 13, GEOMETRY_ADAPTER: 4 };
  const prefixOk = files.every((file) => {
    const prefix = file.classification === 'GEOMETRY_MEMBER' ? 'GM-' : file.classification === 'GEOMETRY_DEPENDENT' ? 'GD-' : file.classification === 'GEOMETRY_EXCLUDED' ? 'GX-' : '';
    return !prefix || String(file.semanticContractRule || '').startsWith(prefix);
  });
  const ok = capabilityMap?.schemaVersion === '2.0.0' && capabilityMap?.phaseId === 'E2R-V2-PHASE-1-GEOMETRY-AND-FILE-SCORING' && files.length === 171 && member === 56 && dependent === 39 && excluded === 76 && physicalPaths.every((p) => files.some((f) => f.path === p)) && Object.entries(targets).every(([layer, expected]) => layerCounts[layer] === expected) && prefixOk;
  return { value: ok, evidence: { files: files.length, member, dependent, excluded } };
}
