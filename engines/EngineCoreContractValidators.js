'use strict';

function createEngineCoreContractValidators(deps = {}) {
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
  const doc = typeof deps.doc !== 'undefined' ? deps.doc : (typeof document !== 'undefined' ? document : null);
  const win = typeof deps.win !== 'undefined' ? deps.win : (typeof window !== 'undefined' ? window : null);
  const ds = typeof deps.DS !== 'undefined' ? deps.DS : (typeof DS !== 'undefined' ? DS : null);

  function pushIssue(issues, code, message, meta) {
    issues.push({ code, message, meta: meta || null });
  }

  function validateSectionEntry(section, sec, expectedTop, issues) {
    if (!finite(sec.top) || !finite(sec.height) || sec.height < 0) {
      pushIssue(issues, 'section.band.invalid', 'Section top/height must be finite and non-negative', sec);
      return expectedTop;
    }
    if (!same(sec.top, expectedTop)) {
      pushIssue(issues, 'section.band.gap', 'Section top must be contiguous with previous section', {
        id: sec.id,
        expectedTop,
        actualTop: sec.top,
      });
    }

    const div = doc ? doc.querySelector(`.cr-section[data-section-id="${sec.id}"]`) : null;
    if (div) {
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

    return expectedTop + sec.height;
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
    if (sectionDomCount < (section.sections || []).length) return;

    let expectedTop = 0;
    for (const sec of section.sections || []) {
      expectedTop = validateSectionEntry(section, sec, expectedTop, issues);
    }

    if (!same(section.totalHeight, expectedTop)) {
      pushIssue(issues, 'section.totalHeight.invalid', 'Section totalHeight must match the sum of section heights', {
        expectedTop,
        totalHeight: section.totalHeight,
      });
    }
  }

  function validateCanvasDom(canvas, issues) {
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

    validateCanvasDom(canvas, issues);
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

  function validateOrphanNodes(issues) {
    if (!ds || !Array.isArray(ds.elements)) return;
    if (!doc) return;

    const modelIds = new Set(ds.elements.map((el) => String(el.id)));
    const domElements = [...doc.querySelectorAll('.cr-element[data-id]')];
    for (const node of domElements) {
      const id = node && node.dataset ? node.dataset.id : null;
      if (!modelIds.has(id)) {
        pushIssue(issues, 'orphan.dom-element', 'DOM .cr-element has no matching DS.elements entry', { id });
      }
    }

    const domSectionIds = new Set(
      [...doc.querySelectorAll('.cr-section[data-section-id]')].map((n) => String(n && n.dataset ? n.dataset.sectionId : null)),
    );
    for (const el of ds.elements) {
      if (!el.sectionId) {
        pushIssue(issues, 'orphan.model-element.no-section-id', 'DS.elements entry has no sectionId', {
          id: el.id,
          type: el.type,
        });
      } else if (!domSectionIds.has(String(el.sectionId))) {
        pushIssue(issues, 'orphan.model-element.missing-section', 'DS.elements entry references a sectionId with no DOM .cr-section', {
          id: el.id,
          sectionId: el.sectionId,
        });
      }
    }
  }

  function validateRuntimeOwner(issues, ownerKey, expected, code, message) {
    const actual = runtimeServices?.getOwner(ownerKey) || null;
    if (actual !== expected) {
      pushIssue(issues, code, message, { actual: actual || null });
    }
  }

  function validateLegacyRuntimePresence(issues) {
    if (win && typeof win.CanvasEngine !== 'undefined') {
      pushIssue(issues, 'runtime.canvas.legacy-present', 'CanvasEngine facade must not exist in canonical runtime', {});
    }
    if (win && typeof win.PreviewEngine !== 'undefined') {
      pushIssue(issues, 'runtime.preview.legacy-present', 'PreviewEngine facade must not exist in canonical runtime', {});
    }
  }

  function validateRuntimeActivation(issues) {
    if (win && typeof win.SelectionEngine !== 'undefined' && win.SelectionEngine.__active !== true) {
      pushIssue(issues, 'runtime.selection.inactive', 'SelectionEngine must remain active', {
        active: win.SelectionEngine.__active,
      });
    }
    if (win && typeof win.PreviewEngineV19 !== 'undefined' && win.PreviewEngineV19.__active !== true) {
      pushIssue(issues, 'runtime.preview.inactive', 'PreviewEngineV19 must remain active', {
        active: win.PreviewEngineV19.__active,
      });
    }
  }

  function validateSelectionOverlayIntegrity(issues) {
    const selBoxes = doc ? doc.querySelectorAll('#handles-layer .sel-box').length : 0;
    if (selBoxes > 1) {
      pushIssue(issues, 'runtime.selection.duplicate-box', 'Selection overlay must have at most one sel-box', {
        selBoxes,
      });
    }

    if (!ds || !(ds.selection instanceof Set) || !doc) return;

    const domSelectedIds = new Set(
      [...doc.querySelectorAll('.cr-element.selected[data-id]')].map((node) => (node && node.dataset ? node.dataset.id : null)).filter(Boolean),
    );
    const dsSelectedIds = new Set([...ds.selection]);
    if (domSelectedIds.size !== dsSelectedIds.size ||
        [...dsSelectedIds].some((id) => !domSelectedIds.has(id))) {
      pushIssue(issues, 'runtime.selection.state-drift', 'DOM selected state must derive exactly from DS.selection', {
        domSelectedIds: [...domSelectedIds],
        dsSelectedIds: [...dsSelectedIds],
      });
    }

    if (ds.selection.size === 1 && selBoxes === 1) {
      const selectedId = [...ds.selection][0];
      const selectedNode = doc.querySelector(
        ds.previewMode
          ? `#preview-content .cr-element.selected[data-id="${selectedId}"]`
          : `#canvas-layer .cr-element.selected[data-id="${selectedId}"]:not(.pv-el)`,
      );
      const box = doc.querySelector('#handles-layer .sel-box');
      if (selectedNode && box) {
        const sr = selectedNode.getBoundingClientRect();
        const br = box.getBoundingClientRect();
        const drift = Math.max(
          Math.abs(sr.left - br.left),
          Math.abs(sr.top - br.top),
          Math.abs(sr.width - br.width),
          Math.abs(sr.height - br.height),
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

  function validateCanonicalRuntime(issues) {
    if (win !== null) {
      validateRuntimeOwner(issues, 'canvas', 'CanvasLayoutEngine', 'runtime.canvas.owner', 'Canonical canvas owner must be CanvasLayoutEngine');
      validateRuntimeOwner(issues, 'selection', 'SelectionEngine', 'runtime.selection.owner', 'Canonical selection owner must be SelectionEngine');
      validateRuntimeOwner(issues, 'preview', 'PreviewEngineV19', 'runtime.preview.owner', 'Canonical preview owner must be PreviewEngineV19');
    }

    validateLegacyRuntimePresence(issues);
    validateRuntimeActivation(issues);
    validateSelectionOverlayIntegrity(issues);
  }

  return {
    pushIssue,
    validateSectionContract,
    validateCanvasContract,
    validateScrollContract,
    validateCanonicalRuntime,
    validateOrphanNodes,
  };
}

var exported = { createEngineCoreContractValidators };
if (typeof module !== 'undefined') {
  module.exports = exported;
}

if (typeof globalThis !== 'undefined') {
  globalThis.EngineCoreContractValidatorsFactory = createEngineCoreContractValidators;
}
