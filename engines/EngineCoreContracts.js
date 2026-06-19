'use strict';

function loadContractFactory(globalName, requirePath, exportName) {
  if (typeof globalThis !== 'undefined' && typeof globalThis[globalName] === 'function') {
    return globalThis[globalName];
  }
  if (typeof require === 'function') {
    try {
      const mod = require(requirePath);
      return mod[exportName] || mod[globalName] || null;
    } catch (_err) {
      return null;
    }
  }
  return null;
}

function createEngineCoreContracts(deps = {}) {
  const ds = typeof deps.DS !== 'undefined' ? deps.DS : (typeof DS !== 'undefined' ? DS : null);
  const doc = typeof deps.doc !== 'undefined' ? deps.doc : (typeof document !== 'undefined' ? document : null);
  const win = typeof deps.win !== 'undefined' ? deps.win : (typeof window !== 'undefined' ? window : null);
  const sharedDeps = {
    ...deps,
    DS: ds,
    doc,
    win,
  };

  const createAsserts = loadContractFactory(
    'EngineCoreContractAssertsFactory',
    './EngineCoreContractAsserts.js',
    'createEngineCoreContractAsserts',
  );
  const createSnapshots = loadContractFactory(
    'EngineCoreContractSnapshotsFactory',
    './EngineCoreContractSnapshots.js',
    'createEngineCoreContractSnapshots',
  );
  const createValidators = loadContractFactory(
    'EngineCoreContractValidatorsFactory',
    './EngineCoreContractValidators.js',
    'createEngineCoreContractValidators',
  );

  if (!createAsserts || !createSnapshots || !createValidators) {
    throw new Error('EngineCore contract helpers unavailable');
  }

  const asserts = createAsserts(sharedDeps);
  const snapshots = createSnapshots({
    ...sharedDeps,
    assertLayoutContract: asserts.assertLayoutContract,
  });
  const validators = createValidators({
    ...sharedDeps,
    assertSelectionState: asserts.assertSelectionState,
    assertLayoutContract: asserts.assertLayoutContract,
    assertZoomContract: asserts.assertZoomContract,
    snapshotSections: snapshots.snapshotSections,
    snapshotElements: snapshots.snapshotElements,
  });

  return {
    ...asserts,
    ...snapshots,
    ...validators,
  };
}

var exported = { createEngineCoreContracts };
if (typeof module !== 'undefined') {
  module.exports = exported;
}

if (typeof globalThis !== 'undefined') {
  globalThis.EngineCoreContractsFactory = createEngineCoreContracts;
}
