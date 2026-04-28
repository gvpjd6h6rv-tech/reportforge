'use strict';

const RuntimeServicesDeferred = typeof window !== 'undefined'
  ? (window.RF?.RuntimeServices || null)
  : null;

window.__rfTraceLegacy = window.__rfTraceLegacy || function(source, event, payload) {
  if (typeof window.rfTrace !== 'function') return;
  const channel = source.includes('Zoom')
    ? 'zoom'
    : (source.includes('SectionResizeEngine') ? 'resize' : 'runtime');
  if (!window.DebugTrace?.isEnabled(channel)) return;
  const frame = (typeof RenderScheduler !== 'undefined' && typeof RenderScheduler.frame === 'number')
    ? RenderScheduler.frame
    : null;
  window.rfTrace(channel, event, {
    frame,
    source,
    phase: 'legacy',
    payload: payload || null,
  });
};

document.addEventListener('DOMContentLoaded', () => {
  if (typeof RenderScheduler !== 'undefined') {
    RenderScheduler.flushSync(() => {
      if (typeof CanvasLayoutEngine !== 'undefined') CanvasLayoutEngine.updateSync();
      if (typeof SectionLayoutEngine !== 'undefined') SectionLayoutEngine.updateSync();
      if (typeof ElementLayoutEngine !== 'undefined') {
        ElementLayoutEngine.updateSync();
        if (typeof DS !== 'undefined' && !DS._elementLayoutV19) {
          DS._elementLayoutV19 = true;
        }
      }
    }, 'Phase3Boot');
  } else {
    const message = 'updateSync SHOULD NOT BE ACTIVE IN CANONICAL RUNTIME (Phase3Boot)';
    console.error(message);
    throw new Error(message);
  }

  if (typeof HistoryEngine !== 'undefined') {
    if (typeof DS !== 'undefined' && typeof DS.saveHistory === 'function' && !DS.saveHistory._rfPhase3Patched) {
      const _origSave = DS.saveHistory.bind(DS);
      DS.saveHistory = function() {
        _origSave();
      };
      DS.saveHistory._rfPhase3Patched = true;
    }
  }

  if (typeof KeyboardEngine !== 'undefined') KeyboardEngine.init();

  if (typeof DesignZoomEngine !== 'undefined' && !DesignZoomEngine._apply._rfPhase3Patched) {
    const _prevApply3 = DesignZoomEngine._apply.bind(DesignZoomEngine);
    DesignZoomEngine._apply = function(z, ax, ay) {
      if (typeof window !== 'undefined' && typeof window.__rfTraceLegacy === 'function') {
        window.__rfTraceLegacy('ZoomApply', 'phase3-patched-enter', { zoom: z });
      }
      _prevApply3(z, ax, ay);
      if (typeof RenderScheduler !== 'undefined') {
        RenderScheduler.layout(() => {
          if (typeof window !== 'undefined' && typeof window.__rfTraceLegacy === 'function') {
            window.__rfTraceLegacy('ZoomApply', 'phase3-layout-scheduled', { zoom: z });
          }
          if (typeof CanvasLayoutEngine !== 'undefined') CanvasLayoutEngine.update();
          if (typeof SectionLayoutEngine !== 'undefined') SectionLayoutEngine.update();
        });
        RenderScheduler.visual(() => {
          if (typeof window !== 'undefined' && typeof window.__rfTraceLegacy === 'function') {
            window.__rfTraceLegacy('ZoomApply', 'phase3-visual-scheduled', { zoom: z });
          }
          if (typeof OverlayEngine !== 'undefined') OverlayEngine.render();
        });
      }
    };
    DesignZoomEngine._apply._rfPhase3Patched = true;
  }

  console.log('[ReportForge v19.3] Phase 3 engines ready: CanvasLayoutEngine, SectionLayoutEngine, ElementLayoutEngine, PreviewEngineV19, OverlayEngine, HistoryEngine, KeyboardEngine, ClipboardEngine');
});

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if (typeof EngineCore !== 'undefined') {
      EngineCore.init();

      if (typeof ZoomEngineV19 !== 'undefined' && !ZoomEngineV19.set._rfEngineCorePatched) {
        const _origSet = ZoomEngineV19.set.bind(ZoomEngineV19);
        ZoomEngineV19.set = function(z, ax, ay) {
          _origSet(z, ax, ay);
        };
        ZoomEngineV19.set._rfEngineCorePatched = true;
      }

      RuntimeServicesDeferred?.expose('EngineRegistry', EngineCore.registry);

      console.log('[v19.4] EngineCore online. Pipeline: pointer→HitTest→Snap→Drag→Layout→RenderScheduler→Overlay');

      if (typeof CanvasLayoutEngine !== 'undefined') {
        RuntimeServicesDeferred?.setOwner('canvas', 'CanvasLayoutEngine');
        CanvasLayoutEngine.__active = true;
      }

      if (typeof SelectionEngine !== 'undefined') {
        RuntimeServicesDeferred?.setOwner('selection', 'SelectionEngine');
        SelectionEngine.__active = true;
        console.log('[v19.6] SelectionEngine remains canonical owner');
      }

      if (typeof PreviewEngineV19 !== 'undefined') {
        RuntimeServicesDeferred?.setOwner('preview', 'PreviewEngineV19');
        PreviewEngineV19.__active = true;
        console.log('[v19.6] PreviewEngineV19 remains canonical owner');
      }

      console.assert(!!CanvasLayoutEngine.__active,
        '[v19.6] FAIL: CanvasLayoutEngine should be active (canonical runtime owns canvas)');
      console.assert(!!SelectionEngine.__active,
        '[v19.6] FAIL: SelectionEngine should be active (canonical runtime owns selection)');
    }
  }, 0);
});
