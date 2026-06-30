'use strict';
/**
 * compare_results.mjs — pure comparator (1 responsibility: map legacy↔modular, flag divergences).
 *
 * Pairs legacy results with their modular counterparts using the legacyId
 * mapping defined in the guards-map.json (or by id suffix convention when
 * no explicit mapping exists).
 *
 * Returns an array of comparison objects:
 *   { legacyId, modularId, legacyPass, modularPass, equivalent, divergence }
 */

// Explicit mapping: legacy guard id → modular guard id(s) it was split into.
// Derived from Phase 4 split plan.
const LEGACY_TO_MODULAR = {
  'immutability-guard': [
    'immutability-history-private',
    'immutability-history-no-expose',
  ],
  'load-order-guard': [
    'load-order-runtime-bootstrap',
    'load-order-deferred-bootstrap',
  ],
  'shared-core-guard': [
    'shared-core-doc-section',
    'shared-core-suites-exist',
    'shared-core-validate-exists',
    'shared-core-audit-guards',
  ],
  'subsystem-ownership-guard': [
    'ownership-files-exist',
  ],
};

export function compareResults(allResults) {
  const byId = (mode) =>
    Object.fromEntries(allResults.filter(r => r.mode === mode).map(r => [r.id, r]));

  const legacy  = byId('legacy');
  const modular = byId('modular');
  const comparisons = [];

  for (const [legacyId, modularIds] of Object.entries(LEGACY_TO_MODULAR)) {
    const leg = legacy[legacyId];
    if (!leg) continue;  // legacy guard not in this run

    // All mapped modular guards must pass for the split to be equivalent.
    const modResults = modularIds.map(mid => modular[mid]).filter(Boolean);
    const allModularPass = modResults.length > 0 && modResults.every(r => r.pass);
    const equivalent = leg.pass === allModularPass;

    comparisons.push({
      legacyId,
      modularIds,
      legacyPass: leg.pass,
      modularPass: allModularPass,
      modularCoverage: `${modResults.length}/${modularIds.length} modular guards present`,
      equivalent,
      divergence: equivalent ? null : {
        legacy: leg.pass,
        modular: allModularPass,
        detail: equivalent
          ? null
          : `legacy=${leg.pass} but modular=${allModularPass} (${modularIds.join(', ')})`,
      },
    });
  }

  return comparisons;
}
