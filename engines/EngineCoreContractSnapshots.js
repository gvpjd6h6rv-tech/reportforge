'use strict';

function createEngineCoreContractSnapshots(deps = {}) {
  const getEngine = typeof deps.getEngine === 'function' ? deps.getEngine : () => null;
  const assertLayoutContract = typeof deps.assertLayoutContract === 'function'
    ? deps.assertLayoutContract
    : () => {};
  const ds = typeof deps.DS !== 'undefined' ? deps.DS : (typeof DS !== 'undefined' ? DS : null);

  function snapshotSections() {
    if (!ds || !Array.isArray(ds.sections)) return [];
    return ds.sections.map((sec) => ({
      id: sec.id,
      stype: sec.stype,
      height: sec.height,
      visible: sec.visible !== false,
      label: sec.label || '',
      abbr: sec.abbr || '',
    }));
  }

  function snapshotElements() {
    if (!ds || !Array.isArray(ds.elements)) return [];
    return ds.elements.map((el) => {
      assertLayoutContract(el, 'EngineCore._snapshotElements');
      return {
        id: el.id,
        sectionId: el.sectionId,
        type: el.type,
        x: el.x,
        y: el.y,
        w: el.w,
        h: el.h,
        zIndex: el.zIndex || 0,
      };
    });
  }

  function snapshotContracts() {
    const section = getEngine('SectionLayoutEngine');
    const canvas = getEngine('CanvasLayoutEngine');
    const scroll = getEngine('WorkspaceScrollEngine');
    return {
      section: section && typeof section.getLayoutContract === 'function'
        ? section.getLayoutContract()
        : null,
      canvas: canvas && typeof canvas.getLayoutContract === 'function'
        ? canvas.getLayoutContract()
        : null,
      scroll: scroll && typeof scroll.getLayoutContract === 'function'
        ? scroll.getLayoutContract()
        : null,
    };
  }

  function summarizeContracts(contracts) {
    return {
      section: contracts.section ? {
        ready: contracts.section.ready,
        count: Array.isArray(contracts.section.sections) ? contracts.section.sections.length : 0,
        totalHeight: contracts.section.totalHeight,
        pageWidth: contracts.section.pageWidth,
      } : null,
      canvas: contracts.canvas ? {
        ready: contracts.canvas.ready,
        width: contracts.canvas.width,
        height: contracts.canvas.height,
      } : null,
      scroll: contracts.scroll ? {
        ready: contracts.scroll.ready,
        scaledW: contracts.scroll.scaledW,
        scaledH: contracts.scroll.scaledH,
        padding: contracts.scroll.padding,
      } : null,
    };
  }

  return {
    snapshotSections,
    snapshotElements,
    snapshotContracts,
    summarizeContracts,
  };
}

var exported = { createEngineCoreContractSnapshots };
if (typeof module !== 'undefined') {
  module.exports = exported;
}

if (typeof globalThis !== 'undefined') {
  globalThis.EngineCoreContractSnapshotsFactory = createEngineCoreContractSnapshots;
}
