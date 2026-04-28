'use strict';

const RuntimeServicesBootstrap = typeof window !== 'undefined'
  ? (window.RF?.RuntimeServices || null)
  : null;

document.addEventListener('DOMContentLoaded', () => {
  DesignerUI.init();
  DebugTraceToggle.init();
  DebugOverlay.init();
  SectionEngine.init();
  FieldExplorerEngine.init();
  FieldExplorerEngine.setupCanvasDrop();
  initMenuBindings();
  initCommandRuntimeState();
  initUIBindings();
  registerGlobalEventHandlers();
  initClock();
  ZoomEngine.set(1.0);
  if (!DS.formulas) DS.formulas = {};
  DS.saveHistory();
  document.getElementById('sb-msg').textContent =
    'ReportForge listo — Arrastra campos del explorador, doble-clic para editar texto, F5 para vista previa';
  document.getElementById('props-title')?.addEventListener('click', () => {
    document.getElementById('properties-panel').classList.toggle('collapsed');
  });
  console.log('[ReportForge] Diseñador iniciado — ' + DS.elements.length + ' elementos, ' + DS.sections.length + ' secciones');
});

document.addEventListener('DOMContentLoaded', () => {
  const ALIASES = [
    ['canvas-layer', 'canvas-surface'],
    ['workspace', 'canvas-scroll'],
    ['viewport', 'canvas-viewport'],
  ];
  ALIASES.forEach(([realId, aliasId]) => {
    if (document.getElementById(aliasId)) return;
    const real = document.getElementById(realId);
    if (!real) return;
    const ph = document.createElement('div');
    ph.id = aliasId;
    ph.setAttribute('data-alias-for', realId);
    ph.style.cssText = 'position:absolute;inset:0;pointer-events:none;visibility:hidden;z-index:-9999;';
    real.appendChild(ph);
  });

  RuntimeServicesBootstrap?.setDomRef('canvas', document.getElementById('canvas-layer'));
  RuntimeServicesBootstrap?.setDomRef('viewport', document.getElementById('viewport'));
  RuntimeServicesBootstrap?.setDomRef('workspace', document.getElementById('workspace'));

  const CMD_REGISTRY = [
    'bring-forward', 'send-backward', 'group', 'ungroup', 'invert-selection',
    'deselect-all', 'zoom-fit-page', 'zoom-fit-width',
    'add-horizontal-guide', 'add-vertical-guide', 'remove-guide', 'clear-guides',
    'set-margin-left', 'set-margin-right', 'set-margin-top', 'set-margin-bottom',
    'delete-section', 'move-section-up', 'move-section-down', 'rename-section',
    'lock-object', 'unlock-object', 'hide-object', 'show-object',
  ];
  const regContainer = document.createElement('div');
  regContainer.id = 'rf-command-registry';
  regContainer.setAttribute('aria-hidden', 'true');
  regContainer.style.cssText = 'display:none;position:absolute;pointer-events:none;';
  CMD_REGISTRY.forEach((cmd) => {
    const btn = document.createElement('button');
    btn.dataset.action = cmd;
    btn.setAttribute('tabindex', '-1');
    regContainer.appendChild(btn);
  });
  document.body.appendChild(regContainer);
  RuntimeServicesBootstrap?.setMeta('commandRegistry', CMD_REGISTRY);

  const addIdAlias = (realId, aliasId) => {
    if (document.getElementById(aliasId)) return;
    const real = document.getElementById(realId);
    if (!real) return;
    real.dataset.aliasId = aliasId;
    const ghost = document.createElement('div');
    ghost.id = aliasId;
    ghost.style.cssText = 'display:block;position:absolute;inset:0;pointer-events:none;z-index:-9999';
    real.appendChild(ghost);
  };
  addIdAlias('ruler-h-canvas', 'h-ruler');
  addIdAlias('ruler-v', 'v-ruler');

  if (!document.getElementById('section-gutter')) {
    const canvasRow = document.getElementById('canvas-row');
    if (canvasRow) {
      const sg = document.createElement('div');
      sg.id = 'section-gutter';
      sg.style.cssText = 'position:absolute;top:0;left:24px;width:0;bottom:0;pointer-events:none;z-index:-1;';
      canvasRow.appendChild(sg);
    }
  }

  if (typeof DS !== 'undefined') {
    window.RF = window.RF || {};
    window.RF.Core = window.RF.Core || {};
    window.RF.Core.DocumentModel = DS;

    const coreEngines = {
      DataEngine: typeof DataEngine !== 'undefined' ? DataEngine : (window.RF_DataEngine || null),
      LayoutEngine: typeof LayoutEngine !== 'undefined' ? LayoutEngine : (window.RF_LayoutEngine || null),
      ExecutionGraph: typeof ExecutionGraph !== 'undefined' ? ExecutionGraph : (window.RF_ExecutionGraph || null),
      ParameterEngine: typeof ParameterEngine !== 'undefined' ? ParameterEngine : (window.RF_ParameterEngine || null),
      SceneGraphEngine: typeof SceneGraphEngine !== 'undefined' ? SceneGraphEngine : (window.RF_SceneGraphEngine || null),
      QueryGraph: typeof QueryGraph !== 'undefined' ? QueryGraph : (window.RF_QueryGraph || null),
      RenderPipeline: typeof RenderPipeline !== 'undefined' ? RenderPipeline : (window.RF_RenderPipeline || null),
      FormulaEngine: typeof FormulaEngine !== 'undefined' ? FormulaEngine : (window.RF_FormulaEngine || null),
    };

    const mkStub = (name) => {
      const datasets = {};
      return {
        _name: name, _stub: true,
        registerDataset: (id, rows) => { datasets[id] = { id, rows: rows || [] }; },
        getDataset: (id) => datasets[id] || { id, rows: [] },
        filterDataset: (id, fn) => ({ rows: (datasets[id]?.rows || []).filter(fn) }),
        groupDataset: (id, fn) => {
          const map = new Map();
          (datasets[id]?.rows || []).forEach((row) => {
            const key = fn(row);
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(row);
          });
          return map;
        },
        cacheDataset: () => {}, joinDatasets: () => ({ rows: [] }),
        layoutSection: () => ({}), measureSection: () => ({}), paginate: () => ([]),
        addStage: () => {}, run: async () => ({}), debug: () => ({}),
        registerParameter: () => {}, resolveParameter: () => null, promptAll: async () => ({}),
        build: () => ({}), diff: () => ([]), applyPatches: () => {},
        register: () => {}, get: () => null, set: () => {},
      };
    };

    Object.entries(coreEngines).forEach(([key, val]) => {
      window.RF.Core[key] = val || mkStub(key);
    });
  }
});

document.addEventListener('DOMContentLoaded', () => {
  if (typeof RulerEngine !== 'undefined' && typeof OverlayEngine !== 'undefined' && !OverlayEngine._rfV19Patched) {
    OverlayEngine._rfV19Patched = true;
    OverlayEngine.render = function() {
      RF.Geometry.invalidate();
      RulerEngine.render();
    };
    OverlayEngine.renderSync = function() {
      RF.Geometry.invalidate();
      RulerEngine.renderSync();
    };
    OverlayEngine.updateCursor = (x, y) => RulerEngine.updateCursor(x, y);
  }

  if (typeof DesignZoomEngine !== 'undefined' && !DesignZoomEngine._apply._rfV19ZoomPatched) {
    const _origApply19 = DesignZoomEngine._apply.bind(DesignZoomEngine);
    DesignZoomEngine._apply = function(z, ax, ay) {
      _origApply19(z, ax, ay);
      const ws = document.getElementById('workspace');
      if (ws) ws.dispatchEvent(new CustomEvent('rf:zoom-changed', { detail: { zoom: z } }));
    };
    DesignZoomEngine._apply._rfV19ZoomPatched = true;
  }

  if (typeof SnapState !== 'undefined') SnapState.init();
  if (typeof DS !== 'undefined' && typeof SnapCore !== 'undefined' && typeof SnapState !== 'undefined') {
    DS.snap = (v) => SnapCore.snapValue(v, SnapState.getGrid(), SnapState.isEnabled());
  }

  if (typeof GridEngine !== 'undefined') GridEngine.init();
  if (typeof WorkspaceScrollEngine !== 'undefined') WorkspaceScrollEngine.init();

  if (typeof DesignZoomEngine !== 'undefined') {
    DesignZoomEngine.set(DS.zoom || 1.0);
  }

  console.log('[ReportForge v19] Boot complete — RulerEngine, GridEngine, SnapCore/SnapState, WorkspaceScrollEngine');
});

document.addEventListener('DOMContentLoaded', () => {
  if (typeof RenderScheduler === 'undefined') {
    console.error('[v19] RenderScheduler not loaded');
    return;
  }

  if (typeof ZoomEngineV19 !== 'undefined') {
    ZoomEngineV19.onChange((z) => {
      if (typeof GridEngine !== 'undefined') GridEngine.update();
      if (typeof WorkspaceScrollEngine !== 'undefined') WorkspaceScrollEngine.update();
    });
  }

  if (typeof GuideEngine !== 'undefined' && GuideEngine.init) GuideEngine.init();
  if (typeof AlignmentEngine !== 'undefined' && AlignmentEngine.init) AlignmentEngine.init();

  if (typeof DragEngine !== 'undefined' && DragEngine.init) {
    DragEngine.init({
      onDragStart: (els) => {
        if (typeof AlignmentEngine !== 'undefined') AlignmentEngine.beginDrag(els);
      },
      onDragMove: (els, dx, dy) => {
        if (typeof AlignmentEngine !== 'undefined') {
          const guides = AlignmentEngine.getGuides(els);
          if (typeof GuideEngine !== 'undefined') GuideEngine.show(guides);
        }
        RenderScheduler.handles(() => {
          if (typeof HandlesEngine !== 'undefined') HandlesEngine.render();
        });
      },
      onDragEnd: () => {
        if (typeof GuideEngine !== 'undefined') GuideEngine.clear();
        if (typeof AlignmentEngine !== 'undefined') AlignmentEngine.endDrag();
      },
    });
  }

  if (typeof HandlesEngine !== 'undefined' && HandlesEngine.init) HandlesEngine.init();

  if (typeof DesignZoomEngine !== 'undefined' && !DesignZoomEngine._apply._rfPhase2ZoomPatched) {
    const _prevApply = DesignZoomEngine._apply.bind(DesignZoomEngine);
    DesignZoomEngine._apply = function(z, ax, ay) {
      _prevApply(z, ax, ay);
      RenderScheduler.handles(() => {
        if (typeof HandlesEngine !== 'undefined') HandlesEngine.render();
      });
    };
    DesignZoomEngine._apply._rfPhase2ZoomPatched = true;
  }

  console.log('[ReportForge v19.2] Phase 2 engines active: RenderScheduler, ZoomEngine, HitTestEngine, DragEngine, HandlesEngine, GuideEngine, AlignmentEngine, SelectionEngine');
});
