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
    safeMode: {
      active: false,
      reason: null,
      recoveryCount: 0,
      lastError: null,
      lastRecoveryAt: null,
    },
    pipeline: {
      lastFrameMeta: null,
      lastFailure: null,
      lastInvariantReport: null,
      lastSnapshotAt: null,
    },
  };

  // Per-frame pointer state
  const _ptr = { clientX: 0, clientY: 0, buttons: 0 };

  // ── Helper: resolve engine or null ──────────────────────────────────
  // ONLY EngineRegistry — no window scanning, no global access
  function _E(name) { return EngineRegistry.get(name) || null; }

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
    const canvas = _E('CanvasLayoutEngine');
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

  function _pushIssue(issues, code, message, meta) {
    issues.push({ code, message, meta: meta || null });
  }

  function _validateSectionContract(contracts, issues) {
    const section = contracts.section;
    if (!section) {
      _pushIssue(issues, 'section.contract.missing', 'SectionLayout contract unavailable');
      return;
    }
    if (!_finite(section.pageWidth) || section.pageWidth < 0) {
      _pushIssue(issues, 'section.pageWidth.invalid', 'Section pageWidth must be finite and non-negative', {
        pageWidth: section.pageWidth,
      });
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
        _pushIssue(issues, 'section.dom.missing', 'Section DOM node missing for contract section', { id: sec.id });
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
    if (!canvas) {
      _pushIssue(issues, 'canvas.contract.missing', 'CanvasLayout contract unavailable');
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
      _pushIssue(issues, 'canvas.dom.missing', 'canvas-layer DOM node missing');
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
    if (!scroll) {
      _pushIssue(issues, 'scroll.contract.missing', 'WorkspaceScroll contract unavailable');
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

    const vp = document.getElementById('viewport');
    if (vp && !_same(_parsePx(vp.style.marginBottom), scroll.padding)) {
      _pushIssue(issues, 'scroll.dom.marginBottom', 'Viewport marginBottom diverges from scroll padding', {
        marginBottom: _parsePx(vp.style.marginBottom),
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
    _runtime.pipeline.lastInvariantReport = report;
    if (_runtime.debugFlags.asserts && typeof console !== 'undefined' && typeof console.assert === 'function') {
      console.assert(report.ok, `[EngineCore] Runtime invariants failed at ${report.phase}`);
    }
    if (_runtime.debugFlags.trace && typeof console !== 'undefined') {
      console.debug('[EngineCore] invariant report', report);
    }
    _emitRuntimeEvent('rf:runtime-invariants', report);
  }

  function _normalizeError(error) {
    if (!error) return null;
    return {
      name: error.name || 'Error',
      message: error.message || String(error),
      stack: error.stack || null,
    };
  }

  // ── Event pipeline ──────────────────────────────────────────────────

  /**
   * Full input pipeline for a pointer event.
   * Called from the single workspace pointermove/down/up listeners.
   */
  function _routePointer(e, phase) {
    const type = phase; // 'down' | 'move' | 'up'

    // 1. Screen → Model
    const model = RF.Geometry.viewToModel(e.clientX, e.clientY);

    // 2. HitTest
    const hit = _E('HitTestEngine')
      ? {
          element: _E('HitTestEngine').elementAt(e.clientX, e.clientY),
          section: _E('HitTestEngine').sectionAt(e.clientX, e.clientY),
          handle:  DS.getSelectedElements && DS.getSelectedElements().length === 1
            ? _E('HitTestEngine').handleAt(DS.getSelectedElements()[0], e.clientX, e.clientY)
            : null,
        }
      : { element: null, section: null, handle: null };

    // 3. Pass to SelectionEngine (owns rubber-band, multi-select, move-drag)
    //    The monolithic SelectionEngine already handles this; EngineCore
    //    supplements with guide feedback.

    // 4. During drag: compute alignment guides and snap
    if (type === 'move' && DS.selection && DS.selection.size > 0) {
      const selEls = DS.getSelectedElements ? DS.getSelectedElements() : [];
      if (selEls.length && _E('AlignmentEngine')) {
        const result = _E('AlignmentEngine').compute(selEls[0]);
        if (result.guides.length && _E('GuideEngine')) {
          _E('GuideEngine').show(result.guides);
        }
      }
    }

    // 5. On pointer up: clear guides, schedule handle re-render
    if (type === 'up') {
      if (_E('GuideEngine')) _E('GuideEngine').clear();
      RenderScheduler.handles(() => {
        if (_E('HandlesEngine')) _E('HandlesEngine').render();
      }, 'handles_up');
    }

    // 6. Update ruler cursor (model space)
    if (_E('RulerEngine')) {
      _E('RulerEngine').updateCursor(model.x, model.y);
    }

    // 7. Status bar
    RenderScheduler.post(() => {
      const sb = document.getElementById('sb-pos');
      if (sb) sb.textContent = `X: ${Math.round(model.x)}   Y: ${Math.round(model.y)}`;
    }, 'sb_pos');
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
    const ws = document.getElementById('workspace');
    if (!ws) return;

    // Workspace pointer events → EngineCore pipeline
    // (The monolithic SelectionEngine still handles the primary drag logic;
    //  EngineCore adds the guide + hit + status pipeline on top)
    ws.addEventListener('pointermove', e => {
      _ptr.clientX = e.clientX; _ptr.clientY = e.clientY; _ptr.buttons = e.buttons;
      _routePointer(e, 'move');
    }, { passive: true });

    ws.addEventListener('pointerdown', e => {
      _ptr.clientX = e.clientX; _ptr.clientY = e.clientY; _ptr.buttons = e.buttons;
      _routePointer(e, 'down');
    }, { passive: true });

    ws.addEventListener('pointerup', e => {
      _routePointer(e, 'up');
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

      const issues = [];
      const contracts = _snapshotContracts();
      _validateSectionContract(contracts, issues);
      _validateCanvasContract(contracts, issues);
      _validateScrollContract(contracts, issues);

      const report = {
        ok: issues.length === 0,
        phase,
        meta: _cloneSerializable(meta),
        issues,
        timestamp: new Date().toISOString(),
      };
      _recordInvariantReport(report);
      return report;
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
      _runtime.safeMode.active = true;
      _runtime.safeMode.reason = reason || 'runtime_failure';
      _runtime.safeMode.lastError = _normalizeError(error);
      _runtime.safeMode.lastRecoveryAt = new Date().toISOString();
      _runtime.pipeline.lastFailure = {
        reason: _runtime.safeMode.reason,
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
      this.enterSafeMode(reason, error, meta);
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
