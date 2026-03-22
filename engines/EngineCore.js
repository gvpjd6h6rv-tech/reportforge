/**
 * EngineCore — ReportForge v19.4
 * ─────────────────────────────────────────────────────────────────
 * Central orchestrator for the v19 engine architecture.
 *
 * Responsibilities:
 *  1. EngineRegistry — consistent access to all engines (window.X or registry)
 *  2. Event Router   — all raw input → pipeline (screen→model→HitTest→Snap→Drag→Layout→Overlay)
 *  3. Zoom lifecycle — adjustForZoom, notify all engines in order
 *  4. Deterministic pipeline — engine execution order is fixed
 *
 * Pipeline (mouse events):
 *   raw pointer event
 *       ↓ screenToModel (RF.Geometry)
 *       ↓ HitTestEngine  (what is under cursor?)
 *       ↓ SnapEngine     (snap model coords)
 *       ↓ DragEngine     (update model positions)
 *       ↓ ElementLayoutEngine / SectionLayoutEngine  (layout tier)
 *       ↓ RenderScheduler.layout/visual/handles
 *       ↓ OverlayEngineV19 (rulers + handles + guides)
 *
 * Architecture rules:
 *   • All engines accessed via EngineRegistry.get(name)
 *   • No engine reads DS.zoom — only RF.Geometry.zoom()
 *   • All DOM writes go through RenderScheduler
 */
'use strict';

// ── EngineRegistry ───────────────────────────────────────────────────
const EngineRegistry = (() => {
  const _engines = new Map();

  return {
    /**
     * Register an engine instance.
     * Also attached to window for legacy `window.EngineName` access.
     */
    register(name, instance) {
      _engines.set(name, instance);
      if (typeof window !== 'undefined' && !window[name]) {
        window[name] = instance;
      }
    },

    /** @returns {object|undefined} */
    get(name) { return _engines.get(name); },

    /** @returns {boolean} */
    has(name) { return _engines.has(name); },

    /** @returns {string[]} */
    list() { return [..._engines.keys()]; },

    /** Iterate all registered engines */
    forEach(fn) { _engines.forEach((v, k) => fn(v, k)); },
  };
})();

// ── EngineCore ────────────────────────────────────────────────────────
const EngineCore = (() => {

  // ── Internal state ─────────────────────────────────────────────────
  let _initialised  = false;
  let _prevZoom     = 1.0;
  const _EPS        = 0.5;
  const _runtime    = {
    debugFlags: _resolveDebugFlags(),
    lastWarningKey: null,
    safeMode: {
      active: false,
      reason: null,
      incidentKey: null,
      recoveryAttempted: false,
      recoveryCount: 0,
      lastError: null,
      lastRecoveryAt: null,
    },
    pipeline: {
      lastFrameMeta: null,
      lastFailure: null,
      lastInvariantReport: null,
      lastWarningReport: null,
      lastSnapshotAt: null,
    },
  };

  // Per-frame pointer state
  const _ptr = { clientX: 0, clientY: 0, buttons: 0 };

  // ── Helper: resolve engine or null ──────────────────────────────────
  // ONLY EngineRegistry — no window scanning, no global access
  function _E(name) { return EngineRegistry.get(name) || null; }

  function _useInteractionRouter() {
    return typeof window === 'undefined' || window.RF_USE_ENGINECORE_INTERACTION !== false;
  }

  function _trace(source, event, payload, phase, frame) {
    if (typeof window === 'undefined' || typeof window.rfTrace !== 'function') return;
    const channel = (typeof event === 'string' && (event.includes('verify') || event.includes('invariant')))
      ? 'invariants'
      : 'runtime';
    if (!window.DebugTrace?.isEnabled(channel)) return;
    window.rfTrace(channel, event, {
      frame: typeof frame === 'number' ? frame : (_E('RenderScheduler') ? _E('RenderScheduler').frame : null),
      source,
      phase: phase || null,
      payload: payload || null,
    });
  }

  function _traceElement(source, event, state) {
    if (typeof window === 'undefined' || typeof window.rfTrace !== 'function') return;
    if (typeof event === 'string' && event.toLowerCase().includes('move') && !window.DebugTrace?.isEnabled('move')) return;
    if (!window.DebugTrace?.isEnabled('elements')) return;
    window.rfTrace('elements', event, {
      source,
      id: state && typeof state.id !== 'undefined' ? state.id : null,
      handle: state && typeof state.handle !== 'undefined' ? state.handle : null,
      state: state || null,
    });
  }

  function _targetSummary(target) {
    if (!target) return null;
    return {
      tag: target.tagName || null,
      id: target.id || null,
      className: typeof target.className === 'string' ? target.className : null,
      dataset: target.dataset ? {
        id: target.dataset.id || null,
        pos: target.dataset.pos || null,
        handlePos: target.dataset.handlePos || null,
        sectionId: target.dataset.sectionId || null,
      } : null,
    };
  }

  function _resolveDebugFlags() {
    const globalFlags = (typeof window !== 'undefined' && window.RF_DEBUG_FLAGS &&
      typeof window.RF_DEBUG_FLAGS === 'object')
      ? window.RF_DEBUG_FLAGS
      : {};
    return {
      invariants: globalFlags.invariants !== false,
      asserts: globalFlags.asserts !== false,
      trace: globalFlags.trace === true,
      snapshots: globalFlags.snapshots === true,
      safeMode: globalFlags.safeMode !== false,
    };
  }

  function _cloneSerializable(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function _emitRuntimeEvent(name, detail) {
    if (typeof document === 'undefined' || typeof CustomEvent === 'undefined') return;
    document.dispatchEvent(new CustomEvent(name, { detail, bubbles: false }));
  }

  function _finite(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function _same(a, b, eps = _EPS) {
    return Math.abs((a || 0) - (b || 0)) <= eps;
  }

  function _parsePx(value) {
    const n = parseFloat(value || '0');
    return Number.isFinite(n) ? n : 0;
  }

  function _snapshotSections() {
    if (typeof DS === 'undefined' || !Array.isArray(DS.sections)) return [];
    return DS.sections.map(sec => ({
      id: sec.id,
      stype: sec.stype,
      height: sec.height,
      visible: sec.visible !== false,
      label: sec.label || '',
      abbr: sec.abbr || '',
    }));
  }

  function _snapshotElements() {
    if (typeof DS === 'undefined' || !Array.isArray(DS.elements)) return [];
    return DS.elements.map(el => ({
      id: el.id,
      sectionId: el.sectionId,
      type: el.type,
      x: el.x,
      y: el.y,
      w: el.w,
      h: el.h,
      zIndex: el.zIndex || 0,
    }));
  }

  function _snapshotContracts() {
    const section = _E('SectionLayoutEngine');
    const canvas = _E('CanvasLayoutEngine') || _E('CanvasEngineV19');
    const scroll = _E('WorkspaceScrollEngine');
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

  function _summarizeContracts(contracts) {
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

  function _pushIssue(issues, code, message, meta) {
    issues.push({ code, message, meta: meta || null });
  }

  function _validateSectionContract(contracts, issues) {
    const section = contracts.section;
    if (!section || section.ready === false) {
      return;
    }
    if (!_finite(section.pageWidth) || section.pageWidth < 0) {
      _pushIssue(issues, 'section.pageWidth.invalid', 'Section pageWidth must be finite and non-negative', {
        pageWidth: section.pageWidth,
      });
    }

    const sectionDomCount = document.querySelectorAll('.cr-section[data-section-id]').length;
    if (sectionDomCount < (section.sections || []).length) {
      return;
    }

    let expectedTop = 0;
    for (const sec of section.sections || []) {
      if (!_finite(sec.top) || !_finite(sec.height) || sec.height < 0) {
        _pushIssue(issues, 'section.band.invalid', 'Section top/height must be finite and non-negative', sec);
        continue;
      }
      if (!_same(sec.top, expectedTop)) {
        _pushIssue(issues, 'section.band.gap', 'Section top must be contiguous with previous section', {
          id: sec.id,
          expectedTop,
          actualTop: sec.top,
        });
      }
      expectedTop += sec.height;

      const div = document.querySelector(`.cr-section[data-section-id="${sec.id}"]`);
      if (!div) {
        continue;
      }

      if (!_same(_parsePx(div.style.height), sec.height)) {
        _pushIssue(issues, 'section.dom.height', 'Section DOM height diverges from contract', {
          id: sec.id,
          contractHeight: sec.height,
          domHeight: _parsePx(div.style.height),
        });
      }
      if (!_same(_parsePx(div.style.width), section.pageWidth)) {
        _pushIssue(issues, 'section.dom.width', 'Section DOM width diverges from contract', {
          id: sec.id,
          contractWidth: section.pageWidth,
          domWidth: _parsePx(div.style.width),
        });
      }
      if ((sec.visible ? '' : 'none') !== (div.style.display || '')) {
        _pushIssue(issues, 'section.dom.display', 'Section DOM visibility diverges from contract', {
          id: sec.id,
          expected: sec.visible ? '' : 'none',
          actual: div.style.display || '',
        });
      }
    }

    if (!_same(section.totalHeight, expectedTop)) {
      _pushIssue(issues, 'section.totalHeight.invalid', 'Section totalHeight must match the sum of section heights', {
        expectedTop,
        totalHeight: section.totalHeight,
      });
    }
  }

  function _validateCanvasContract(contracts, issues) {
    const section = contracts.section;
    const canvas = contracts.canvas;
    if (!canvas || canvas.ready === false) {
      return;
    }

    if (!_finite(canvas.width) || !_finite(canvas.height) || canvas.height < 0) {
      _pushIssue(issues, 'canvas.contract.invalid', 'Canvas width/height must be finite and non-negative', canvas);
    }
    if (section) {
      if (!_same(canvas.width, section.pageWidth)) {
        _pushIssue(issues, 'canvas.width.mismatch', 'Canvas width must match SectionLayout pageWidth', {
          canvasWidth: canvas.width,
          sectionPageWidth: section.pageWidth,
        });
      }
      if (!_same(canvas.height, section.totalHeight)) {
        _pushIssue(issues, 'canvas.height.mismatch', 'Canvas height must match SectionLayout totalHeight', {
          canvasHeight: canvas.height,
          sectionTotalHeight: section.totalHeight,
        });
      }
    }
    if (!_same(canvas.height, canvas.maxHeight) || !_same(canvas.minHeight, 0)) {
      _pushIssue(issues, 'canvas.bounds.invalid', 'Canvas bounds must keep minHeight=0 and maxHeight=height', canvas);
    }

    const cl = document.getElementById('canvas-layer');
    if (!cl) {
      return;
    }

    if (!_same(_parsePx(cl.style.width), canvas.width)) {
      _pushIssue(issues, 'canvas.dom.width', 'Canvas DOM width diverges from contract', {
        contractWidth: canvas.width,
        domWidth: _parsePx(cl.style.width),
      });
    }
    if (!_same(_parsePx(cl.style.height), canvas.height)) {
      _pushIssue(issues, 'canvas.dom.height', 'Canvas DOM height diverges from contract', {
        contractHeight: canvas.height,
        domHeight: _parsePx(cl.style.height),
      });
    }
    if (!_same(_parsePx(cl.style.maxHeight), canvas.maxHeight)) {
      _pushIssue(issues, 'canvas.dom.maxHeight', 'Canvas DOM maxHeight diverges from contract', {
        contractMaxHeight: canvas.maxHeight,
        domMaxHeight: _parsePx(cl.style.maxHeight),
      });
    }
  }

  function _validateScrollContract(contracts, issues) {
    const canvas = contracts.canvas;
    const scroll = contracts.scroll;
    if (!scroll || scroll.ready === false) {
      return;
    }
    if (canvas) {
      if (!_same(scroll.scaledW, canvas.width)) {
        _pushIssue(issues, 'scroll.width.mismatch', 'Scroll bounds width must match canvas width', {
          scrollWidth: scroll.scaledW,
          canvasWidth: canvas.width,
        });
      }
      if (!_same(scroll.scaledH, canvas.height)) {
        _pushIssue(issues, 'scroll.height.mismatch', 'Scroll bounds height must match canvas height', {
          scrollHeight: scroll.scaledH,
          canvasHeight: canvas.height,
        });
      }
    }
    if (!_finite(scroll.padding) || scroll.padding < 0) {
      _pushIssue(issues, 'scroll.padding.invalid', 'Scroll padding must be finite and non-negative', {
        padding: scroll.padding,
      });
    }
  }

  function _buildRuntimeSnapshot(reason) {
    const snapshot = {
      version: 'phase3-runtime-v1',
      reason: reason || 'runtime',
      timestamp: new Date().toISOString(),
      frame: _E('RenderScheduler') && typeof _E('RenderScheduler').frame === 'number'
        ? _E('RenderScheduler').frame
        : null,
      zoom: typeof RF !== 'undefined' && RF.Geometry && typeof RF.Geometry.zoom === 'function'
        ? RF.Geometry.zoom()
        : (typeof DS !== 'undefined' ? DS.zoom : 1),
      pointer: _cloneSerializable(this.getPointer ? this.getPointer() : RF.Geometry.viewToModel(_ptr.clientX, _ptr.clientY)),
      safeMode: _cloneSerializable(_runtime.safeMode),
      debugFlags: _cloneSerializable(_runtime.debugFlags),
      pipeline: _cloneSerializable(_runtime.pipeline),
      ds: {
        sectionCount: typeof DS !== 'undefined' && Array.isArray(DS.sections) ? DS.sections.length : 0,
        elementCount: typeof DS !== 'undefined' && Array.isArray(DS.elements) ? DS.elements.length : 0,
        selectedIds: typeof DS !== 'undefined' && DS.selection ? [...DS.selection] : [],
        sections: _snapshotSections(),
        elements: _snapshotElements(),
      },
      contracts: _cloneSerializable(_snapshotContracts()),
    };
    _runtime.pipeline.lastSnapshotAt = snapshot.timestamp;
    return snapshot;
  }

  function _recordInvariantReport(report) {
    const clonedReport = _cloneSerializable(report || {});
    const normalizedIssues = Array.isArray(clonedReport.issues)
      ? clonedReport.issues.filter(Boolean)
      : [];
    const storedIssues = normalizedIssues;
    const storedReport = {
      ...clonedReport,
      issues: storedIssues,
      ok: storedIssues.length === 0,
    };

    _trace('EngineCore', 'invariant-report', {
      ok: storedReport.ok,
      issuesLength: storedIssues.length,
      issueCodes: storedIssues.map(issue => issue.code),
      timestamp: storedReport.timestamp,
    }, storedReport.phase, storedReport.meta && storedReport.meta.frame);

    _runtime.pipeline.lastInvariantReport = storedReport;
    if (storedReport.ok === false && typeof console !== 'undefined') {
      const warningReport = _cloneSerializable(storedReport);
      _runtime.pipeline.lastWarningReport = warningReport;
      const issueCodes = storedIssues.map(issue => issue.code);
      const warningKey = JSON.stringify({
        frame: storedReport.meta && typeof storedReport.meta.frame !== 'undefined' ? storedReport.meta.frame : null,
        phase: storedReport.phase,
        codes: issueCodes,
      });
      if (_runtime.lastWarningKey !== warningKey) {
        _runtime.lastWarningKey = warningKey;
        console.warn(
          `[EngineCore] Runtime invariants warning at ${storedReport.phase}`,
          {
            source: '_recordInvariantReport',
            frame: storedReport.meta && typeof storedReport.meta.frame !== 'undefined'
              ? storedReport.meta.frame
              : null,
            phase: storedReport.phase,
            timestamp: storedReport.timestamp,
            ok: storedReport.ok,
            issuesLength: storedIssues.length,
            issueCodes,
            report: warningReport,
          }
        );
      }
    }
    if (_runtime.debugFlags.trace && typeof console !== 'undefined') {
      console.debug('[EngineCore] invariant report', storedReport);
    }
    _emitRuntimeEvent('rf:runtime-invariants', storedReport);
  }

  function _normalizeError(error) {
    if (!error) return null;
    return {
      name: error.name || 'Error',
      message: error.message || String(error),
      stack: error.stack || null,
    };
  }

  function _incidentKey(reason, error, meta) {
    const normalized = _normalizeError(error);
    return JSON.stringify({
      reason: reason || 'runtime_failure',
      name: normalized ? normalized.name : 'Error',
      message: normalized ? normalized.message : '',
      phase: meta && meta.phase ? meta.phase : '',
      priority: meta && typeof meta.priority !== 'undefined' ? meta.priority : '',
    });
  }

  // ── Event pipeline ──────────────────────────────────────────────────

  /**
   * Full input pipeline for a pointer event.
   * Called from the single workspace pointermove/down/up listeners.
   */
  function _normalizePointerEvent(e, phase) {
    const ws = document.getElementById('workspace');
    const rect = ws ? ws.getBoundingClientRect() : null;
    const model = RF.Geometry.viewToModel(e.clientX, e.clientY);
    const selected = (typeof DS !== 'undefined' && DS.getSelectedElements)
      ? DS.getSelectedElements()
      : [];
    const hitTest = _E('HitTestEngine');
    return {
      phase,
      pointerId: typeof e.pointerId === 'number' ? e.pointerId : null,
      pointerType: e.pointerType || 'mouse',
      button: typeof e.button === 'number' ? e.button : 0,
      buttons: typeof e.buttons === 'number' ? e.buttons : 0,
      detail: typeof e.detail === 'number' ? e.detail : 0,
      clientX: e.clientX,
      clientY: e.clientY,
      client: { x: e.clientX, y: e.clientY },
      workspace: rect ? {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      } : { x: e.clientX, y: e.clientY },
      model,
      hit: hitTest ? {
        element: hitTest.elementAt(e.clientX, e.clientY),
        section: hitTest.sectionAt(e.clientX, e.clientY),
        handle: selected.length === 1
          ? hitTest.handleAt(selected[0], e.clientX, e.clientY)
          : null,
      } : { element: null, section: null, handle: null },
      modifiers: {
        altKey: !!e.altKey,
        ctrlKey: !!e.ctrlKey,
        metaKey: !!e.metaKey,
        shiftKey: !!e.shiftKey,
      },
      target: e.target || null,
      originalEvent: e,
    };
  }

  function _interactionEngine() {
    const selection = _E('SelectionEngine');
    if (
      selection &&
      typeof selection.onElementPointerDown === 'function' &&
      typeof selection.onHandlePointerDown === 'function'
    ) {
      return selection;
    }
    const selectionV19 = _E('SelectionEngineV19');
    if (
      selectionV19 &&
      typeof selectionV19.onElementPointerDown === 'function' &&
      typeof selectionV19.onHandlePointerDown === 'function'
    ) {
      return selectionV19;
    }
    return selectionV19 || selection;
  }

  function _routePointer(e, phase) {
    const event = _normalizePointerEvent(e, phase);
    _runtime.pipeline.lastPointerEvent = _cloneSerializable({
      phase: event.phase,
      pointerId: event.pointerId,
      buttons: event.buttons,
      client: event.client,
      workspace: event.workspace,
      model: event.model,
      hit: {
        elementId: event.hit.element ? event.hit.element.id : null,
        sectionId: event.hit.section ? event.hit.section.id : null,
        handle: event.hit.handle,
      },
      modifiers: event.modifiers,
    });

    const selection = _interactionEngine();
    const sectionResize = _E('SectionResizeEngine');
    const insert = _E('InsertEngine');
    const closest = selector => (
      event.target &&
      typeof event.target.closest === 'function' &&
      event.target.closest(selector)
    );
    const elementNode = closest('.cr-element');
    const handleNode = closest('.sel-handle');
    const sectionHandleNode = closest('.section-resize-handle');
    const interactionEngineName = selection === _E('SelectionEngine')
      ? 'SelectionEngine'
      : (selection === _E('SelectionEngineV19') ? 'SelectionEngineV19' : null);

    if (phase === 'down') {
      if (elementNode || handleNode) {
        _traceElement('EngineCore', 'pointerdown', {
          id: elementNode ? (elementNode.dataset.id || null) : null,
          handle: handleNode ? (handleNode.dataset.pos || handleNode.dataset.handlePos || null) : null,
          target: _targetSummary(event.target),
          elementId: elementNode ? (elementNode.dataset.id || null) : null,
          handlePos: handleNode ? (handleNode.dataset.pos || handleNode.dataset.handlePos || null) : null,
          interactionEngine: interactionEngineName,
        });
      }
      if (!closest('#ctx-menu')) {
        const ctx = _E('ContextMenuEngine');
        if (ctx && typeof ctx.hide === 'function') ctx.hide();
      }
      if (!closest('.menu-item') && !closest('.dropdown')) {
        const menu = _E('MenuEngine');
        if (menu && typeof menu.closeAll === 'function') menu.closeAll();
      }
      if (event.button === 0 && sectionHandleNode) {
        if (sectionResize && typeof sectionResize.onPointerDown === 'function') {
          sectionResize.onPointerDown(event, sectionHandleNode.dataset.sectionId);
        }
      } else if (event.button === 0 && handleNode) {
        if (selection && typeof selection.onHandlePointerDown === 'function') {
          const handlePos = handleNode.dataset.pos || handleNode.dataset.handlePos || null;
          _traceElement('EngineCore', 'dispatch-handle-down', {
            id: event.hit.element ? event.hit.element.id : null,
            handle: handlePos,
            handlePos,
            engine: interactionEngineName,
          });
          selection.onHandlePointerDown(
            event,
            handlePos
          );
        }
      } else if (event.button === 0 && elementNode) {
        if (selection && typeof selection.onElementPointerDown === 'function') {
          _traceElement('EngineCore', 'dispatch-element-down', {
            id: elementNode.dataset.id || null,
            elementId: elementNode.dataset.id || null,
            engine: interactionEngineName,
          });
          selection.onElementPointerDown(event, elementNode.dataset.id);
        }
      } else if (
        event.button === 0 &&
        typeof DS !== 'undefined' &&
        !DS.previewMode
      ) {
        if (insert && typeof insert.onCanvasMouseDown === 'function') {
          _traceElement('EngineCore', 'dispatch-canvas-down', {
            engine: 'InsertEngine',
          });
          insert.onCanvasMouseDown(event);
        }
      }
    } else if (phase === 'move') {
      if (sectionResize && sectionResize._drag && typeof sectionResize.onMouseMove === 'function') {
        sectionResize.onMouseMove(event);
      } else if (selection && typeof selection.onMouseMove === 'function') {
        selection.onMouseMove(event);
      }
    } else if (phase === 'up' || phase === 'cancel') {
      _traceElement('EngineCore', phase === 'cancel' ? 'pointercancel' : 'pointerup', {
        id: event.hit.element ? event.hit.element.id : null,
        handle: event.hit.handle || null,
        interactionEngine: interactionEngineName,
      });
      if (sectionResize && typeof sectionResize.onMouseUp === 'function') {
        sectionResize.onMouseUp(event);
      }
      if (selection && typeof selection.onMouseUp === 'function') {
        _traceElement('EngineCore', phase === 'cancel' ? 'dispatch-selection-cancel' : 'dispatch-selection-up', {
          id: event.hit.element ? event.hit.element.id : null,
          handle: event.hit.handle || null,
          cancel: phase === 'cancel',
          engine: interactionEngineName,
          dragType: selection._drag ? selection._drag.type || null : null,
        });
        selection.onMouseUp(event);
      }
    }

    return event;
  }

  // ── Zoom lifecycle ──────────────────────────────────────────────────

  /**
   * Called from DesignZoomEngine._apply BEFORE the zoom is applied.
   * Preserves visual scroll anchor via WorkspaceScrollEngine.
   */
  function onZoomWillChange(newZoom) {
    const prev = _prevZoom;
    if (_E('WorkspaceScrollEngine')) {
      _E('WorkspaceScrollEngine').adjustForZoom(prev, newZoom);
    }
    _prevZoom = newZoom;
  }

  /**
   * Called from DesignZoomEngine._apply AFTER zoom is applied.
   * Triggers full layout → visual → handles pipeline in correct order.
   */
  function onZoomDidChange(newZoom) {
    // LAYOUT tier — geometry must be updated first
    RenderScheduler.layout(() => {
      if (_E('CanvasLayoutEngine'))         _E('CanvasLayoutEngine').updateSync();
      if (_E('SectionLayoutEngine'))  _E('SectionLayoutEngine').updateSync();
    }, 'zoom_layout');

    // VISUAL tier — rulers + grid
    RenderScheduler.visual(() => {
      if (_E('GridEngine'))       _E('GridEngine').updateSync();
      if (_E('OverlayEngineV19')) _E('OverlayEngineV19').renderSync();
    }, 'zoom_visual');

    // HANDLES tier — selection boxes
    RenderScheduler.handles(() => {
      if (_E('HandlesEngine')) _E('HandlesEngine').render();
    }, 'zoom_handles');

    // POST tier — preview refresh
    RenderScheduler.post(() => {
      if (typeof DS !== 'undefined' && DS.previewMode) {
        if (typeof PreviewEngine !== 'undefined') PreviewEngine.refresh();
      }
      if (_E('WorkspaceScrollEngine')) _E('WorkspaceScrollEngine').update();
    }, 'zoom_post');
  }

  // ── Initialisation ──────────────────────────────────────────────────

  function _registerAllEngines() {
    /**
     * EXPLICIT engine registration.
     * NO window scanning. NO new Function. NO eval.
     * Every engine is referenced by its direct JavaScript identifier.
     *
     * Responsibility ownership (one active engine per concern):
     *   Selection   → SelectionEngine      (monolithic, owns drag/rubber-band/move)
     *   Overlay     → OverlayEngineV19     (v19 compositor → delegates to RulerEngine)
     *   Canvas      → CanvasEngine         (monolithic, owns buildElementDiv)
     *   Preview     → PreviewEngine        (monolithic, owns HTML generation)
     */
    function reg(key, instance) {
      if (instance != null) EngineRegistry.register(key, instance);
    }

    // v19 Phase 1 — View & Geometry
    reg('RulerEngine',           typeof RulerEngine           !== 'undefined' ? RulerEngine           : null);
    reg('GridEngine',            typeof GridEngine            !== 'undefined' ? GridEngine            : null);
    reg('SnapEngine',            typeof SnapEngine            !== 'undefined' ? SnapEngine            : null);
    reg('WorkspaceScrollEngine', typeof WorkspaceScrollEngine !== 'undefined' ? WorkspaceScrollEngine : null);
    // v19 Phase 2 — Scheduler & Interaction
    reg('RenderScheduler',       typeof RenderScheduler       !== 'undefined' ? RenderScheduler       : null);
    reg('ZoomEngineV19',         typeof ZoomEngineV19         !== 'undefined' ? ZoomEngineV19         : null);
    reg('HitTestEngine',         typeof HitTestEngine         !== 'undefined' ? HitTestEngine         : null);
    reg('DragEngine',            typeof DragEngine            !== 'undefined' ? DragEngine            : null);
    reg('HandlesEngine',         typeof HandlesEngine         !== 'undefined' ? HandlesEngine         : null);
    reg('GuideEngine',           typeof GuideEngine           !== 'undefined' ? GuideEngine           : null);
    reg('AlignmentEngine',       typeof AlignmentEngine       !== 'undefined' ? AlignmentEngine       : null);
    reg('SelectionEngineV19',    typeof SelectionEngineV19    !== 'undefined' ? SelectionEngineV19    : null);
    // v19 Phase 3 — Layout & System
    reg('CanvasEngineV19',       typeof CanvasLayoutEngine    !== 'undefined' ? CanvasLayoutEngine    : null);  // file: CanvasLayoutEngine.js
    reg('SectionLayoutEngine',   typeof SectionLayoutEngine   !== 'undefined' ? SectionLayoutEngine   : null);
    reg('ElementLayoutEngine',   typeof ElementLayoutEngine   !== 'undefined' ? ElementLayoutEngine   : null);
    reg('PreviewEngineV19',      typeof PreviewEngineV19      !== 'undefined' ? PreviewEngineV19      : null);
    reg('OverlayEngineV19',      typeof OverlayEngineV19      !== 'undefined' ? OverlayEngineV19      : null);
    reg('HistoryEngine',         typeof HistoryEngine         !== 'undefined' ? HistoryEngine         : null);
    reg('KeyboardEngine',        typeof KeyboardEngine        !== 'undefined' ? KeyboardEngine        : null);
    reg('ClipboardEngine',       typeof ClipboardEngine       !== 'undefined' ? ClipboardEngine       : null);
    // v19 Phase 4 — Orchestration
    reg('EngineCore',            typeof EngineCore            !== 'undefined' ? EngineCore            : null);
    reg('EngineRegistry',        typeof EngineRegistry        !== 'undefined' ? EngineRegistry        : null);
    // Monolithic (canonical — one instance each)
    reg('SelectionEngine',       typeof SelectionEngine       !== 'undefined' ? SelectionEngine       : null);
    reg('SectionResizeEngine',   typeof SectionResizeEngine   !== 'undefined' ? SectionResizeEngine   : null);
    reg('OverlayEngine',         typeof OverlayEngine         !== 'undefined' ? OverlayEngine         : null);
    reg('CanvasEngine',          typeof CanvasEngine          !== 'undefined' ? CanvasEngine          : null);
    reg('PreviewEngine',         typeof PreviewEngine         !== 'undefined' ? PreviewEngine         : null);
    reg('DesignZoomEngine',      typeof DesignZoomEngine      !== 'undefined' ? DesignZoomEngine      : null);
    reg('PreviewZoomEngine',     typeof PreviewZoomEngine     !== 'undefined' ? PreviewZoomEngine     : null);
    reg('InsertEngine',          typeof InsertEngine          !== 'undefined' ? InsertEngine          : null);
    reg('CommandEngine',         typeof CommandEngine         !== 'undefined' ? CommandEngine         : null);
    reg('FormatEngine',          typeof FormatEngine          !== 'undefined' ? FormatEngine          : null);
    reg('PropertiesEngine',      typeof PropertiesEngine      !== 'undefined' ? PropertiesEngine      : null);
    reg('ZoomWidget',            typeof ZoomWidget            !== 'undefined' ? ZoomWidget            : null);
    reg('RF',                    typeof RF                    !== 'undefined' ? RF                    : null);
    reg('DS',                    typeof DS                    !== 'undefined' ? DS                    : null);
    reg('CFG',                   typeof CFG                   !== 'undefined' ? CFG                   : null);

    console.log(`[EngineCore] Registered ${EngineRegistry.list().length} engines`);
  }

  function _patchZoomEngine() {
    const DesignZoomEngine = EngineRegistry.get('DesignZoomEngine');
    if (!DesignZoomEngine) return;

    // The Phase 1/2/3 boots have already wrapped _apply multiple times.
    // We patch ONCE more here, adding the lifecycle hooks.
    const _prev = DesignZoomEngine._apply.bind(DesignZoomEngine);
    DesignZoomEngine._apply = function(z, ax, ay) {
      onZoomWillChange(z);  // scroll anchor BEFORE
      _prev(z, ax, ay);     // apply zoom (writes DS.zoom, updates all DOM)
      onZoomDidChange(z);   // full pipeline AFTER
    };
  }

  function _wireWorkspaceEvents() {
    if (!_useInteractionRouter()) return;
    const ws = document.getElementById('workspace');
    if (!ws) return;
    if (typeof window !== 'undefined' && typeof window.RF_USE_ENGINECORE_INTERACTION === 'undefined') {
      window.RF_USE_ENGINECORE_INTERACTION = true;
    }

    ws.addEventListener('pointerdown', e => {
      _ptr.clientX = e.clientX; _ptr.clientY = e.clientY; _ptr.buttons = e.buttons;
      _routePointer(e, 'down');
    }, { capture: true, passive: true });

    document.addEventListener('pointermove', e => {
      _ptr.clientX = e.clientX; _ptr.clientY = e.clientY; _ptr.buttons = e.buttons;
      _routePointer(e, 'move');
    }, { passive: true });

    document.addEventListener('pointerup', e => {
      _routePointer(e, 'up');
    }, { passive: true });

    document.addEventListener('pointercancel', e => {
      _routePointer(e, 'cancel');
    }, { passive: true });

    // Pointer leave → clear ruler cursor
    ws.addEventListener('pointerleave', () => {
      if (_E('RulerEngine')) _E('RulerEngine').clearCursor();
    }, { passive: true });
  }

  // ── Public API ──────────────────────────────────────────────────────
  return {
    /**
     * Initialise EngineCore.
     * Must be called after all other engines are loaded.
     */
    init() {
      if (_initialised) return;
      _initialised = true;
      _prevZoom = (typeof DS !== 'undefined' && DS.zoom) ? DS.zoom : 1.0;

      _registerAllEngines();
      _patchZoomEngine();
      _wireWorkspaceEvents();

      console.log('[EngineCore] Initialised. Registered engines:',
        EngineRegistry.list().join(', '));
    },

    beginFrame(meta) {
      _runtime.pipeline.lastFrameMeta = _cloneSerializable(meta);
      if (_runtime.debugFlags.trace && typeof console !== 'undefined') {
        console.debug('[EngineCore] frame begin', meta);
      }
    },

    completeFrame(meta) {
      _runtime.pipeline.lastFrameMeta = _cloneSerializable(meta);
      _emitRuntimeEvent('rf:runtime-frame', _runtime.pipeline.lastFrameMeta);
      if (_runtime.debugFlags.trace && typeof console !== 'undefined') {
        console.debug('[EngineCore] frame complete', meta);
      }
    },

    verifyRuntimeInvariants(phase, meta = {}) {
      if (!_runtime.debugFlags.invariants) {
        return { ok: true, skipped: true, phase, meta };
      }

      const collectedIssues = [];
      const contracts = _snapshotContracts();
      _trace('EngineCore', 'verify-begin', {
        contracts: _summarizeContracts(contracts),
        meta: _cloneSerializable(meta),
      }, phase, meta && meta.frame);
      _validateSectionContract(contracts, collectedIssues);
      _validateCanvasContract(contracts, collectedIssues);
      _validateScrollContract(contracts, collectedIssues);
      const actualIssues = Array.isArray(collectedIssues)
        ? collectedIssues.filter(Boolean)
        : [];
      _trace('EngineCore', 'verify-issues', {
        issues: actualIssues.map(issue => ({
          code: issue.code,
          meta: issue.meta || null,
        })),
      }, phase, meta && meta.frame);

      const report = {
        ok: actualIssues.length === 0,
        phase,
        meta: _cloneSerializable(meta),
        issues: actualIssues,
        timestamp: new Date().toISOString(),
      };
      _trace('EngineCore', 'verify-final', {
        ok: actualIssues.length === 0,
        issuesLength: actualIssues.length,
        issueCodes: actualIssues.map(issue => issue.code),
      }, phase, meta && meta.frame);
      _recordInvariantReport(report);
      return {
        ...report,
        ok: actualIssues.length === 0,
        issues: actualIssues,
      };
    },

    setDebugFlags(nextFlags = {}) {
      _runtime.debugFlags = { ..._runtime.debugFlags, ...nextFlags };
      if (typeof window !== 'undefined') window.RF_DEBUG_FLAGS = _cloneSerializable(_runtime.debugFlags);
      return this.getDebugFlags();
    },

    getDebugFlags() {
      return _cloneSerializable(_runtime.debugFlags);
    },

    enterSafeMode(reason, error, meta = {}) {
      if (!_runtime.debugFlags.safeMode) return this.getSafeMode();
      const incidentKey = _incidentKey(reason, error, meta);
      if (_runtime.safeMode.active && _runtime.safeMode.incidentKey === incidentKey) {
        return this.getSafeMode();
      }
      _runtime.safeMode.active = true;
      _runtime.safeMode.reason = reason || 'runtime_failure';
      _runtime.safeMode.incidentKey = incidentKey;
      _runtime.safeMode.recoveryAttempted = false;
      _runtime.safeMode.lastError = _normalizeError(error);
      _runtime.safeMode.lastRecoveryAt = new Date().toISOString();
      _runtime.pipeline.lastFailure = {
        reason: _runtime.safeMode.reason,
        incidentKey,
        error: _runtime.safeMode.lastError,
        meta: _cloneSerializable(meta),
        timestamp: _runtime.safeMode.lastRecoveryAt,
      };
      _emitRuntimeEvent('rf:safe-mode', this.getSafeMode());
      console.error('[EngineCore] Entering safe mode', _runtime.pipeline.lastFailure);
      return this.getSafeMode();
    },

    clearSafeMode() {
      _runtime.safeMode.active = false;
      _runtime.safeMode.reason = null;
      _runtime.safeMode.incidentKey = null;
      _runtime.safeMode.recoveryAttempted = false;
      _runtime.safeMode.lastError = null;
      return this.getSafeMode();
    },

    getSafeMode() {
      return _cloneSerializable(_runtime.safeMode);
    },

    exportRuntimeState(reason = 'manual') {
      return _buildRuntimeSnapshot.call(this, reason);
    },

    recoverFromPipelineFailure(reason, error, meta = {}) {
      const incidentKey = _incidentKey(reason, error, meta);
      if (_runtime.safeMode.active &&
          _runtime.safeMode.incidentKey === incidentKey &&
          _runtime.safeMode.recoveryAttempted) {
        return {
          recovered: false,
          skipped: true,
          safeMode: this.getSafeMode(),
          snapshot: null,
        };
      }

      this.enterSafeMode(reason, error, meta);
      _runtime.safeMode.recoveryAttempted = true;
      const scheduler = _E('RenderScheduler');
      let recovered = false;
      try {
        if (scheduler && typeof scheduler.runLayoutPipelineSync === 'function') {
          scheduler.runLayoutPipelineSync();
          recovered = true;
        }
      } catch (recoveryError) {
        _runtime.safeMode.lastError = _normalizeError(recoveryError);
        console.error('[EngineCore] Safe mode recovery failed', recoveryError);
      }
      if (recovered) {
        _runtime.safeMode.recoveryCount += 1;
        const postRecovery = this.verifyRuntimeInvariants('post-recovery', meta);
        _emitRuntimeEvent('rf:runtime-recovery', {
          recovered: postRecovery.ok,
          report: postRecovery,
          safeMode: this.getSafeMode(),
        });
      }
      return {
        recovered,
        safeMode: this.getSafeMode(),
        snapshot: _runtime.debugFlags.snapshots ? this.exportRuntimeState('recovery') : null,
      };
    },

    /** Re-register all engines (call after dynamic load) */
    refresh() { _registerAllEngines(); },

    /** Expose registry for external use */
    registry: EngineRegistry,

    /** Current pointer state (model space) */
    getPointer() {
      return RF.Geometry.viewToModel(_ptr.clientX, _ptr.clientY);
    },
  };
})();

if (typeof module !== 'undefined') {
  module.exports = { EngineCore, EngineRegistry };
}
