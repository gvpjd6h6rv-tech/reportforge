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

  // Per-frame pointer state
  const _ptr = { clientX: 0, clientY: 0, buttons: 0 };

  // ── Helper: resolve engine or null ──────────────────────────────────
  // ONLY EngineRegistry — no window scanning, no global access
  function _E(name) { return EngineRegistry.get(name) || null; }

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
