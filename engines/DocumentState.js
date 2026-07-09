'use strict';

const DocumentState = (() => {
  const FactoryMockup = (typeof FactoryInvoiceMockupLayout !== 'undefined')
    ? FactoryInvoiceMockupLayout
    : require('./FactoryInvoiceMockupLayout.js');

  let elementCounter = 100;

  function newId() {
    return `e${++elementCounter}`;
  }

  function mkEl(type, sectionId, x, y, w, h, extra = {}) {
    return {
      id: newId(), type, sectionId, x, y, w, h,
      fontFamily: 'Arial', fontSize: 8, bold: false, italic: false, underline: false,
      align: 'left', color: '#000000', bgColor: 'transparent',
      borderColor: 'transparent', borderWidth: 0, borderStyle: 'solid',
      content: '', fieldPath: '', fieldFmt: null,
      lineDir: 'h', lineWidth: 1, zIndex: 0,
      ...extra,
    };
  }

  function createState() {
    const { sections, elements } = FactoryMockup.build(mkEl);
    return {
      sections,
      elements,
      selection: new Set(),
      tool: 'pointer',
      zoom: 1.0,
      zoomDesign: 1.0,
      zoomPreview: 1.0,
      gridVisible: true,
      snapToGrid: true,
      previewMode: false,
      pageMarginLeft: 0,
      pageMarginTop: 0,
      previewZoom: 1.0,
      clipboard: [],
      history: [],
      historyIndex: -1,
      _subs: [],
    };
  }

  const invariants = Object.freeze({
    assertSelectionState(selection) {
      if (!(selection instanceof Set)) throw new Error('INVALID SELECTION STATE');
      return selection;
    },
    assertZoom(zoom) {
      if (typeof zoom !== 'number' || !Number.isFinite(zoom) || zoom <= 0) throw new Error('INVALID ZOOM CONTRACT');
      return zoom;
    },
    assertLayoutPatch(patch) {
      for (const key of ['x', 'y', 'w', 'h']) {
        if (Object.prototype.hasOwnProperty.call(patch, key)) {
          if (typeof patch[key] !== 'number' || !Number.isFinite(patch[key])) {
            throw new Error('INVALID LAYOUT CONTRACT');
          }
          if ((key === 'w' || key === 'h') && patch[key] <= 0) {
            throw new Error('INVALID LAYOUT CONTRACT: dimension must be positive');
          }
        }
      }
      return patch;
    },
  });

  function createDocumentState() {
    return {
      state: createState(),
      invariants,
      newId,
      mkEl,
    };
  }

  return { createDocumentState };
})();

if (typeof module !== 'undefined') {
  module.exports = DocumentState;
}

