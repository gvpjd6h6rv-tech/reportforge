'use strict';

const EngineCoreRoutingRegistry = (() => {
  function createEngineCoreRoutingRegistry(deps = {}) {
    const registry = deps.registry || null;
    const registrations = [
      ['RulerEngine', () => typeof RulerEngine !== 'undefined' ? RulerEngine : null],
      ['GridEngine', () => typeof GridEngine !== 'undefined' ? GridEngine : null],
      ['WorkspaceScrollEngine', () => typeof WorkspaceScrollEngine !== 'undefined' ? WorkspaceScrollEngine : null],
      ['RenderScheduler', () => typeof RenderScheduler !== 'undefined' ? RenderScheduler : null],
      ['ZoomEngineV19', () => typeof ZoomEngineV19 !== 'undefined' ? ZoomEngineV19 : null],
      ['HitTestEngine', () => typeof HitTestEngine !== 'undefined' ? HitTestEngine : null],
      ['DragEngine', () => typeof DragEngine !== 'undefined' ? DragEngine : null],
      ['HandlesEngine', () => typeof HandlesEngine !== 'undefined' ? HandlesEngine : null],
      ['GuideEngine', () => typeof GuideEngine !== 'undefined' ? GuideEngine : null],
      ['AlignmentEngine', () => typeof AlignmentEngine !== 'undefined' ? AlignmentEngine : null],
      ['CanvasLayoutEngine', () => typeof CanvasLayoutEngine !== 'undefined' ? CanvasLayoutEngine : null],
      ['SectionLayoutEngine', () => typeof SectionLayoutEngine !== 'undefined' ? SectionLayoutEngine : null],
      ['ElementLayoutEngine', () => typeof ElementLayoutEngine !== 'undefined' ? ElementLayoutEngine : null],
      ['PreviewEngineV19', () => typeof PreviewEngineV19 !== 'undefined' ? PreviewEngineV19 : null],
      ['OverlayEngine', () => typeof OverlayEngine !== 'undefined' ? OverlayEngine : null],
      ['HistoryEngine', () => typeof HistoryEngine !== 'undefined' ? HistoryEngine : null],
      ['KeyboardEngine', () => typeof KeyboardEngine !== 'undefined' ? KeyboardEngine : null],
      ['ClipboardEngine', () => typeof ClipboardEngine !== 'undefined' ? ClipboardEngine : null],
      ['EngineCore', () => typeof EngineCore !== 'undefined' ? EngineCore : null],
      ['EngineRegistry', () => typeof EngineRegistry !== 'undefined' ? EngineRegistry : null],
      ['SelectionEngine', () => typeof SelectionEngine !== 'undefined' ? SelectionEngine : null],
      ['SectionResizeEngine', () => typeof SectionResizeEngine !== 'undefined' ? SectionResizeEngine : null],
      ['DesignZoomEngine', () => typeof DesignZoomEngine !== 'undefined' ? DesignZoomEngine : null],
      ['PreviewZoomEngine', () => typeof PreviewZoomEngine !== 'undefined' ? PreviewZoomEngine : null],
      ['InsertEngine', () => typeof InsertEngine !== 'undefined' ? InsertEngine : null],
      ['CommandEngine', () => typeof CommandEngine !== 'undefined' ? CommandEngine : null],
      ['FormatEngine', () => typeof FormatEngine !== 'undefined' ? FormatEngine : null],
      ['PropertiesEngine', () => typeof PropertiesEngine !== 'undefined' ? PropertiesEngine : null],
      ['ZoomWidget', () => typeof ZoomWidget !== 'undefined' ? ZoomWidget : null],
      ['RF', () => typeof RF !== 'undefined' ? RF : null],
      ['DS', () => typeof DS !== 'undefined' ? DS : null],
      ['CFG', () => typeof CFG !== 'undefined' ? CFG : null],
    ];

    function reg(key, instance) {
      if (instance != null && registry && typeof registry.register === 'function') registry.register(key, instance);
    }

    function registerAllEngines() {
      for (const [key, getInstance] of registrations) reg(key, getInstance());
      console.log(`[EngineCore] Registered ${registry.list().length} engines`);
    }

    function patchZoomEngine() {
      const DesignZoomEngine = registry && typeof registry.get === 'function' ? registry.get('DesignZoomEngine') : null;
      if (!DesignZoomEngine) return;
      const current = DesignZoomEngine._apply;
      if (current._rfEngineCoreRoutingPatched) return;
      const previous = current.bind(DesignZoomEngine);
      DesignZoomEngine._apply = function(z, ax, ay) {
        if (typeof deps.onZoomWillChange === 'function') deps.onZoomWillChange(z);
        previous(z, ax, ay);
        if (typeof deps.onZoomDidChange === 'function') deps.onZoomDidChange(z);
      };
      DesignZoomEngine._apply._rfEngineCoreRoutingPatched = true;
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
