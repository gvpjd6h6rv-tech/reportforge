'use strict';

function createEngineCoreContractAsserts(deps = {}) {
  const contractFailure = typeof deps.contractFailure === 'function'
    ? deps.contractFailure
    : (kind, source, detail) => {
        const message = `${kind} (${source})`;
        if (typeof console !== 'undefined' && console.error) console.error(message, detail || null);
        throw new Error(message);
      };

  function assertRectShape(rect, source = 'unknown') {
    if (!rect || typeof rect !== 'object') {
      return contractFailure('INVALID RECT SHAPE', source, rect);
    }
    for (const key of ['left', 'top', 'width', 'height']) {
      if (typeof rect[key] !== 'number' || !Number.isFinite(rect[key])) {
        return contractFailure('INVALID RECT SHAPE', source, rect);
      }
    }
    if ('x' in rect || 'y' in rect || 'w' in rect || 'h' in rect) {
      return contractFailure('INVALID RECT SHAPE', source, rect);
    }
    return rect;
  }

  function assertSelectionState(selection, source = 'unknown') {
    if (!(selection instanceof Set)) {
      return contractFailure('INVALID SELECTION STATE', source, selection);
    }
    for (const id of selection) {
      if (typeof id !== 'string' || id.length === 0) {
        return contractFailure('INVALID SELECTION STATE', source, [...selection]);
      }
    }
    return selection;
  }

  function assertLayoutContract(layout, source = 'unknown') {
    if (!layout || typeof layout !== 'object') {
      return contractFailure('INVALID LAYOUT CONTRACT', source, layout);
    }
    if (typeof layout.id !== 'string' || typeof layout.sectionId !== 'string') {
      return contractFailure('INVALID LAYOUT CONTRACT', source, layout);
    }
    for (const key of ['x', 'y', 'w', 'h']) {
      if (typeof layout[key] !== 'number' || !Number.isFinite(layout[key])) {
        return contractFailure('INVALID LAYOUT CONTRACT', source, layout);
      }
    }
    return layout;
  }

  function assertZoomContract(zoom, source = 'unknown') {
    if (typeof zoom !== 'number' || !Number.isFinite(zoom)) {
      return contractFailure('INVALID ZOOM CONTRACT', source, zoom);
    }
    return zoom;
  }

  return {
    assertRectShape,
    assertSelectionState,
    assertLayoutContract,
    assertZoomContract,
  };
}

var exported = { createEngineCoreContractAsserts };
if (typeof module !== 'undefined') {
  module.exports = exported;
}

if (typeof globalThis !== 'undefined') {
  globalThis.EngineCoreContractAssertsFactory = createEngineCoreContractAsserts;
}
