'use strict';

const EngineCoreRoutingRegistry = (() => {
  function createEngineCoreRoutingRegistry(deps = {}) {
    const registry = deps.registry || null;

    function reg(key, instance) {
      if (instance != null && registry && typeof registry.register === 'function') registry.register(key, instance);
    }

    function registerAllEngines() {
      reg('RulerEngine', typeof RulerEngine !== 'undefined' ? RulerEngine : null);
      reg('GridEngine', typeof GridEngine !== 'undefined' ? GridEngine : null);
      reg('WorkspaceScrollEngine', typeof WorkspaceScrollEngine !== 'undefined' ? WorkspaceScrollEngine : null);
      reg('RenderScheduler', typeof RenderScheduler !== 'undefined' ? RenderScheduler : null);
      reg('ZoomEngineV19', typeof ZoomEngineV19 !== 'undefined' ? ZoomEngineV19 : null);
      reg('HitTestEngine', typeof HitTestEngine !== 'undefined' ? HitTestEngine : null);
      reg('DragEngine', typeof DragEngine !== 'undefined' ? DragEngine : null);
      reg('HandlesEngine', typeof HandlesEngine !== 'undefined' ? HandlesEngine : null);
      reg('GuideEngine', typeof GuideEngine !== 'undefined' ? GuideEngine : null);
      reg('AlignmentEngine', typeof AlignmentEngine !== 'undefined' ? AlignmentEngine : null);
      reg('CanvasLayoutEngine', typeof CanvasLayoutEngine !== 'undefined' ? CanvasLayoutEngine : null);
      reg('SectionLayoutEngine', typeof SectionLayoutEngine !== 'undefined' ? SectionLayoutEngine : null);
      reg('ElementLayoutEngine', typeof ElementLayoutEngine !== 'undefined' ? ElementLayoutEngine : null);
      reg('PreviewEngineV19', typeof PreviewEngineV19 !== 'undefined' ? PreviewEngineV19 : null);
      reg('OverlayEngine', typeof OverlayEngine !== 'undefined' ? OverlayEngine : null);
      reg('HistoryEngine', typeof HistoryEngine !== 'undefined' ? HistoryEngine : null);
      reg('KeyboardEngine', typeof KeyboardEngine !== 'undefined' ? KeyboardEngine : null);
      reg('ClipboardEngine', typeof ClipboardEngine !== 'undefined' ? ClipboardEngine : null);
      reg('EngineCore', typeof EngineCore !== 'undefined' ? EngineCore : null);
      reg('EngineRegistry', typeof EngineRegistry !== 'undefined' ? EngineRegistry : null);
      reg('SelectionEngine', typeof SelectionEngine !== 'undefined' ? SelectionEngine : null);
      reg('SectionResizeEngine', typeof SectionResizeEngine !== 'undefined' ? SectionResizeEngine : null);
      reg('DesignZoomEngine', typeof DesignZoomEngine !== 'undefined' ? DesignZoomEngine : null);
      reg('PreviewZoomEngine', typeof PreviewZoomEngine !== 'undefined' ? PreviewZoomEngine : null);
      reg('InsertEngine', typeof InsertEngine !== 'undefined' ? InsertEngine : null);
      reg('CommandEngine', typeof CommandEngine !== 'undefined' ? CommandEngine : null);
      reg('FormatEngine', typeof FormatEngine !== 'undefined' ? FormatEngine : null);
      reg('PropertiesEngine', typeof PropertiesEngine !== 'undefined' ? PropertiesEngine : null);
      reg('ZoomWidget', typeof ZoomWidget !== 'undefined' ? ZoomWidget : null);
      reg('RF', typeof RF !== 'undefined' ? RF : null);
      reg('DS', typeof DS !== 'undefined' ? DS : null);
      reg('CFG', typeof CFG !== 'undefined' ? CFG : null);
      console.log(`[EngineCore] Registered ${registry.list().length} engines`);
    }

    function patchZoomEngine() {
      const DesignZoomEngine = registry && typeof registry.get === 'function' ? registry.get('DesignZoomEngine') : null;
      if (!DesignZoomEngine) return;
      const previous = DesignZoomEngine._apply.bind(DesignZoomEngine);
      DesignZoomEngine._apply = function(z, ax, ay) {
        if (typeof deps.onZoomWillChange === 'function') deps.onZoomWillChange(z);
        previous(z, ax, ay);
        if (typeof deps.onZoomDidChange === 'function') deps.onZoomDidChange(z);
      };
    }

    return { registerAllEngines, patchZoomEngine };
  }

  return { createEngineCoreRoutingRegistry };
})();

if (typeof module !== 'undefined') {
  module.exports = { createEngineCoreRoutingRegistry: EngineCoreRoutingRegistry.createEngineCoreRoutingRegistry };
}

if (typeof globalThis !== 'undefined') {
  globalThis.EngineCoreRoutingRegistry = EngineCoreRoutingRegistry;
}
