'use strict';

function createEngineCoreContracts(deps = {}) {
  const getEngine = typeof deps.getEngine === 'function' ? deps.getEngine : () => null;
  const runtimeServices = deps.runtimeServices || null;
  const finite = typeof deps.finite === 'function'
    ? deps.finite
    : (value) => typeof value === 'number' && Number.isFinite(value);
  const same = typeof deps.same === 'function'
    ? deps.same
    : (a, b, eps = 0.5) => Math.abs((a || 0) - (b || 0)) <= eps;
  const parsePx = typeof deps.parsePx === 'function'
    ? deps.parsePx
    : (value) => {
        const n = parseFloat(value || '0');
        return Number.isFinite(n) ? n : 0;
      };
  const contractFailure = typeof deps.contractFailure === 'function'
    ? deps.contractFailure
    : (kind, source, detail) => {
        const message = `${kind} (${source})`;
        if (typeof console !== 'undefined' && console.error) console.error(message, detail || null);
        throw new Error(message);
      };

  const doc = typeof document !== 'undefined' ? document : null;
  const win = typeof window !== 'undefined' ? window : null;

  function assertRectShape(rect, source = 'unknown') {
    if (!rect || typeof rect !== 'object') {
      return contractFailure('INVALID RECT SHAPE', source, rect);
    }
    const keys = ['left', 'top', 'width', 'height'];
    for (const key of keys) {
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

  function snapshotSections() {
    if (typeof DS === 'undefined' || !Array.isArray(DS.sections)) return [];
    return DS.sections.map((sec) => ({
      id: sec.id,
      stype: sec.stype,
      height: sec.height,
      visible: sec.visible !== false,
      label: sec.label || '',
      abbr: sec.abbr || '',
    }));
  }

  function snapshotElements() {
    if (typeof DS === 'undefined' || !Array.isArray(DS.elements)) return [];
    return DS.elements.map((el) => {
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

  function pushIssue(issues, code, message, meta) {
    issues.push({ code, message, meta: meta || null });
  }

  function validateSectionContract(contracts, issues) {
    const section = contracts.section;
    if (!section || section.ready === false) return;
    if (!finite(section.pageWidth) || section.pageWidth < 0) {
      pushIssue(issues, 'section.pageWidth.invalid', 'Section pageWidth must be finite and non-negative', {
        pageWidth: section.pageWidth,
      });
    }

    const sectionDomCount = doc ? doc.querySelectorAll('.cr-section[data-section-id]').length : 0;
    if (sectionDomCount < (section.sections || []).length) {
      return;
    }

    let expectedTop = 0;
    for (const sec of section.sections || []) {
      if (!finite(sec.top) || !finite(sec.height) || sec.height < 0) {
        pushIssue(issues, 'section.band.invalid', 'Section top/height must be finite and non-negative', sec);
        continue;
      }
      if (!same(sec.top, expectedTop)) {
        pushIssue(issues, 'section.band.gap', 'Section top must be contiguous with previous section', {
          id: sec.id,
          expectedTop,
          actualTop: sec.top,
        });
      }
      expectedTop += sec.height;

      const div = doc ? doc.querySelector(`.cr-section[data-section-id="${sec.id}"]`) : null;
      if (!div) continue;

      if (!same(parsePx(div.style.height), sec.height)) {
        pushIssue(issues, 'section.dom.height', 'Section DOM height diverges from contract', {
          id: sec.id,
          contractHeight: sec.height,
          domHeight: parsePx(div.style.height),
        });
      }
      if (!same(parsePx(div.style.width), section.pageWidth)) {
        pushIssue(issues, 'section.dom.width', 'Section DOM width diverges from contract', {
          id: sec.id,
          contractWidth: section.pageWidth,
          domWidth: parsePx(div.style.width),
        });
      }
      if ((sec.visible ? '' : 'none') !== (div.style.display || '')) {
        pushIssue(issues, 'section.dom.display', 'Section DOM visibility diverges from contract', {
          id: sec.id,
          expected: sec.visible ? '' : 'none',
          actual: div.style.display || '',
        });
      }
    }

    if (!same(section.totalHeight, expectedTop)) {
      pushIssue(issues, 'section.totalHeight.invalid', 'Section totalHeight must match the sum of section heights', {
        expectedTop,
        totalHeight: section.totalHeight,
      });
    }
  }

  function validateCanvasContract(contracts, issues) {
    const section = contracts.section;
    const canvas = contracts.canvas;
    if (!canvas || canvas.ready === false) return;

    if (!finite(canvas.width) || !finite(canvas.height) || canvas.height < 0) {
      pushIssue(issues, 'canvas.contract.invalid', 'Canvas width/height must be finite and non-negative', canvas);
    }
    if (section) {
      if (!same(canvas.width, section.pageWidth)) {
        pushIssue(issues, 'canvas.width.mismatch', 'Canvas width must match SectionLayout pageWidth', {
          canvasWidth: canvas.width,
          sectionPageWidth: section.pageWidth,
        });
      }
      if (!same(canvas.height, section.totalHeight)) {
        pushIssue(issues, 'canvas.height.mismatch', 'Canvas height must match SectionLayout totalHeight', {
          canvasHeight: canvas.height,
          sectionTotalHeight: section.totalHeight,
        });
      }
    }
    if (!same(canvas.height, canvas.maxHeight) || !same(canvas.minHeight, 0)) {
      pushIssue(issues, 'canvas.bounds.invalid', 'Canvas bounds must keep minHeight=0 and maxHeight=height', canvas);
    }

    const cl = doc ? doc.getElementById('canvas-layer') : null;
    if (!cl) return;

    if (!same(parsePx(cl.style.width), canvas.width)) {
      pushIssue(issues, 'canvas.dom.width', 'Canvas DOM width diverges from contract', {
        contractWidth: canvas.width,
        domWidth: parsePx(cl.style.width),
      });
    }
    if (!same(parsePx(cl.style.height), canvas.height)) {
      pushIssue(issues, 'canvas.dom.height', 'Canvas DOM height diverges from contract', {
        contractHeight: canvas.height,
        domHeight: parsePx(cl.style.height),
      });
    }
    if (!same(parsePx(cl.style.maxHeight), canvas.maxHeight)) {
      pushIssue(issues, 'canvas.dom.maxHeight', 'Canvas DOM maxHeight diverges from contract', {
        contractMaxHeight: canvas.maxHeight,
        domMaxHeight: parsePx(cl.style.maxHeight),
      });
    }
  }

  function validateScrollContract(contracts, issues) {
    const canvas = contracts.canvas;
    const scroll = contracts.scroll;
    if (!scroll || scroll.ready === false) return;
    if (canvas) {
      if (!same(scroll.scaledW, canvas.width)) {
        pushIssue(issues, 'scroll.width.mismatch', 'Scroll bounds width must match canvas width', {
          scrollWidth: scroll.scaledW,
          canvasWidth: canvas.width,
        });
      }
      if (!same(scroll.scaledH, canvas.height)) {
        pushIssue(issues, 'scroll.height.mismatch', 'Scroll bounds height must match canvas height', {
          scrollHeight: scroll.scaledH,
          canvasHeight: canvas.height,
        });
      }
    }
    if (!finite(scroll.padding) || scroll.padding < 0) {
      pushIssue(issues, 'scroll.padding.invalid', 'Scroll padding must be finite and non-negative', {
        padding: scroll.padding,
      });
    }
  }

  function validateCanonicalRuntime(issues) {
    if (typeof window !== 'undefined') {
      const canvasOwner = runtimeServices?.getOwner('canvas') || null;
      if (canvasOwner !== 'CanvasLayoutEngine') {
        pushIssue(issues, 'runtime.canvas.owner', 'Canonical canvas owner must be CanvasLayoutEngine', {
          actual: canvasOwner || null,
        });
      }
      const selectionOwner = runtimeServices?.getOwner('selection') || null;
      if (selectionOwner !== 'SelectionEngine') {
        pushIssue(issues, 'runtime.selection.owner', 'Canonical selection owner must be SelectionEngine', {
          actual: selectionOwner || null,
        });
      }
      const previewOwner = runtimeServices?.getOwner('preview') || null;
      if (previewOwner !== 'PreviewEngineV19') {
        pushIssue(issues, 'runtime.preview.owner', 'Canonical preview owner must be PreviewEngineV19', {
          actual: previewOwner || null,
        });
      }
    }

    if (typeof CanvasEngine !== 'undefined') {
      pushIssue(issues, 'runtime.canvas.legacy-present', 'CanvasEngine facade must not exist in canonical runtime', {});
    }
    if (typeof PreviewEngine !== 'undefined') {
      pushIssue(issues, 'runtime.preview.legacy-present', 'PreviewEngine facade must not exist in canonical runtime', {});
    }
    if (typeof SelectionEngine !== 'undefined' && SelectionEngine.__active !== true) {
      pushIssue(issues, 'runtime.selection.inactive', 'SelectionEngine must remain active', {
        active: SelectionEngine.__active,
      });
    }
    if (typeof PreviewEngineV19 !== 'undefined' && PreviewEngineV19.__active !== true) {
      pushIssue(issues, 'runtime.preview.inactive', 'PreviewEngineV19 must remain active', {
        active: PreviewEngineV19.__active,
      });
    }

    const selBoxes = doc ? doc.querySelectorAll('#handles-layer .sel-box').length : 0;
    if (selBoxes > 1) {
      pushIssue(issues, 'runtime.selection.duplicate-box', 'Selection overlay must have at most one sel-box', {
        selBoxes,
      });
    }

    if (typeof DS !== 'undefined' && DS.selection instanceof Set && doc) {
      const domSelectedIds = new Set(
        [...doc.querySelectorAll('.cr-element.selected[data-id]')].map((node) => node.dataset.id).filter(Boolean)
      );
      const dsSelectedIds = new Set([...DS.selection]);
      if (domSelectedIds.size !== dsSelectedIds.size ||
          [...dsSelectedIds].some((id) => !domSelectedIds.has(id))) {
        pushIssue(issues, 'runtime.selection.state-drift', 'DOM selected state must derive exactly from DS.selection', {
          domSelectedIds: [...domSelectedIds],
          dsSelectedIds: [...dsSelectedIds],
        });
      }

      if (DS.selection.size === 1 && selBoxes === 1) {
        const selectedId = [...DS.selection][0];
        const selectedNode = doc.querySelector(
          DS.previewMode
            ? `#preview-content .cr-element.selected[data-id="${selectedId}"]`
            : `#canvas-layer .cr-element.selected[data-id="${selectedId}"]:not(.pv-el)`
        );
        const box = doc.querySelector('#handles-layer .sel-box');
        if (selectedNode && box) {
          const sr = selectedNode.getBoundingClientRect();
          const br = box.getBoundingClientRect();
          const drift = Math.max(
            Math.abs(sr.left - br.left),
            Math.abs(sr.top - br.top),
            Math.abs(sr.width - br.width),
            Math.abs(sr.height - br.height)
          );
          if (drift > 0.75) {
            pushIssue(issues, 'runtime.selection.overlay-drift', 'Selection overlay must remain aligned to selected element', {
              drift,
              element: { left: sr.left, top: sr.top, width: sr.width, height: sr.height },
              overlay: { left: br.left, top: br.top, width: br.width, height: br.height },
            });
          }
        }
      }
    }
  }

  return {
    assertRectShape,
    assertSelectionState,
    assertLayoutContract,
    assertZoomContract,
    snapshotSections,
    snapshotElements,
    snapshotContracts,
    summarizeContracts,
    pushIssue,
    validateSectionContract,
    validateCanvasContract,
    validateScrollContract,
    validateCanonicalRuntime,
  };
}

const exported = { createEngineCoreContracts };
if (typeof module !== 'undefined') {
  module.exports = exported;
}

if (typeof globalThis !== 'undefined') {
  globalThis.EngineCoreContractsFactory = createEngineCoreContracts;
}
