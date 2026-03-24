'use strict';

document.addEventListener('DOMContentLoaded', () => {
  DesignerUI.init();
  DebugTraceToggle.init();
  DebugOverlay.init();
  SectionEngine.init();
  FieldExplorerEngine.init();
  FieldExplorerEngine.setupCanvasDrop();
  MenuEngine.init();
  initToolbars();
  initMouseEvents();
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

  window._rfCanvas = document.getElementById('canvas-layer');
  window._rfViewport = document.getElementById('viewport');
  window._rfWorkspace = document.getElementById('workspace');

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
  window.__rfCommandRegistry = CMD_REGISTRY;

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
      DataEngine: window.DataEngine || window.RF_DataEngine || null,
      LayoutEngine: window.LayoutEngine || window.RF_LayoutEngine || null,
      ExecutionGraph: window.ExecutionGraph || window.RF_ExecutionGraph || null,
      ParameterEngine: window.ParameterEngine || window.RF_ParameterEngine || null,
      SceneGraphEngine: window.SceneGraphEngine || window.RF_SceneGraphEngine || null,
      QueryGraph: window.QueryGraph || window.RF_QueryGraph || null,
      RenderPipeline: window.RenderPipeline || window.RF_RenderPipeline || null,
      FormulaEngine: window.FormulaEngine || window.RF_FormulaEngine || null,
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
  document.querySelectorAll('.doc-type-btn').forEach((btn) =>
    btn.addEventListener('click', () => switchDocType(btn.dataset.doctype)));
  DS._sampleData = SAMPLE_DATA;
  const items = SAMPLE_DATA.items || [];
  document.getElementById('sb-records').textContent = `Items: ${items.length}`;
  console.log('[ReportForge] Multi-doc engine listo — 5 tipos: factura, remision, nota_credito, retencion, liquidacion');
});

document.addEventListener('DOMContentLoaded', () => {
  if (typeof RulerEngine !== 'undefined' && typeof OverlayEngine !== 'undefined') {
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

  if (typeof DesignZoomEngine !== 'undefined') {
    const _origApply19 = DesignZoomEngine._apply.bind(DesignZoomEngine);
    DesignZoomEngine._apply = function(z, ax, ay) {
      _origApply19(z, ax, ay);
      const ws = document.getElementById('workspace');
      if (ws) ws.dispatchEvent(new CustomEvent('rf:zoom-changed', { detail: { zoom: z } }));
    };
  }

  if (typeof SnapEngine !== 'undefined') {
    SnapEngine.init();
    if (typeof DS !== 'undefined') DS.snap = (v) => SnapEngine.snap(v);
  }

  if (typeof GridEngine !== 'undefined') GridEngine.init();
  if (typeof WorkspaceScrollEngine !== 'undefined') WorkspaceScrollEngine.init();

  if (typeof DesignZoomEngine !== 'undefined') {
    DesignZoomEngine.set(DS.zoom || 1.0);
  }

  console.log('[ReportForge v19] Boot complete — RulerEngine, GridEngine, SnapEngine, WorkspaceScrollEngine');
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

  if (typeof DesignZoomEngine !== 'undefined') {
    const _prevApply = DesignZoomEngine._apply.bind(DesignZoomEngine);
    DesignZoomEngine._apply = function(z, ax, ay) {
      _prevApply(z, ax, ay);
      RenderScheduler.handles(() => {
        if (typeof HandlesEngine !== 'undefined') HandlesEngine.render();
      });
    };
  }

  console.log('[ReportForge v19.2] Phase 2 engines active: RenderScheduler, ZoomEngine, HitTestEngine, DragEngine, HandlesEngine, GuideEngine, AlignmentEngine, SelectionEngine');
});
