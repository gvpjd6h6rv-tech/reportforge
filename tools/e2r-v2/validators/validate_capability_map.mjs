'use strict';

const FROZEN_COUNTS = Object.freeze({
  total: 170,
  member: 55,
  dependent: 40,
  excluded: 75,
});

const FROZEN_LAYER_COUNTS = Object.freeze({
  GEOMETRY_CORE: 4,
  GEOMETRY_MODEL: 7,
  GEOMETRY_LAYOUT: 8,
  GEOMETRY_HIT_TEST: 4,
  GEOMETRY_RENDER: 15,
  GEOMETRY_INTERACTION: 13,
  GEOMETRY_ADAPTER: 4,
});

function countByClassification(files, classification) {
  return files.filter(
    (file) => file.classification === classification,
  ).length;
}

function countMemberLayers(files) {
  const counts = Object.create(null);

  for (const file of files) {
    if (file.classification !== 'GEOMETRY_MEMBER') continue;

    counts[file.primaryLayer] = (
      counts[file.primaryLayer] || 0
    ) + 1;
  }

  return counts;
}

function hasValidRulePrefix(file) {
  const prefixes = {
    GEOMETRY_MEMBER: 'GM-',
    GEOMETRY_DEPENDENT: 'GD-',
    GEOMETRY_EXCLUDED: 'GX-',
  };

  const prefix = prefixes[file.classification];

  return Boolean(prefix)
    && String(file.semanticContractRule || '')
      .startsWith(prefix);
}

export function validateCapabilityMap(
  capabilityMap,
  physicalPaths = [],
) {
  const files = (
    capabilityMap?.capabilities?.[0]?.files || []
  );

  const member = countByClassification(
    files,
    'GEOMETRY_MEMBER',
  );
  const dependent = countByClassification(
    files,
    'GEOMETRY_DEPENDENT',
  );
  const excluded = countByClassification(
    files,
    'GEOMETRY_EXCLUDED',
  );

  const layerCounts = countMemberLayers(files);
  const mappedPaths = new Set(
    files.map((file) => file.path),
  );

  const physicalComplete = (
    physicalPaths.length === files.length
    && physicalPaths.every(
      (path) => mappedPaths.has(path),
    )
  );

  const layersMatch = Object.entries(
    FROZEN_LAYER_COUNTS,
  ).every(
    ([layer, expected]) => (
      layerCounts[layer] === expected
    ),
  );

  const countsMatch = (
    files.length === FROZEN_COUNTS.total
    && member === FROZEN_COUNTS.member
    && dependent === FROZEN_COUNTS.dependent
    && excluded === FROZEN_COUNTS.excluded
  );

  const value = (
    capabilityMap?.schemaVersion === '2.0.0'
    && capabilityMap?.phaseId
      === 'E2R-V2-PHASE-1-GEOMETRY-AND-FILE-SCORING'
    && countsMatch
    && physicalComplete
    && layersMatch
    && files.every(hasValidRulePrefix)
  );

  return {
    value,
    evidence: {
      files: files.length,
      physical: physicalPaths.length,
      member,
      dependent,
      excluded,
      layerCounts,
    },
  };
}
