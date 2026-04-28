'use strict';

const WorkspaceScrollEngineRuntime = (() => {
  let _rafId = null;
  let _lastGeometrySignature = null;

  function _trace(event, payload) {
    if (typeof window === 'undefined' || typeof window.rfTrace !== 'function') return;
    if (!window.DebugTrace?.isEnabled('scroll')) return;
    const frame = (typeof RenderScheduler !== 'undefined' && typeof RenderScheduler.frame === 'number')
      ? RenderScheduler.frame
      : null;
    window.rfTrace('scroll', event, {
      frame,
      source: 'WorkspaceScrollEngine',
      phase: 'layout',
      payload: payload || null,
    });
  }

  function scheduleUpdate() {
    const contract = WorkspaceScrollEngineLayout.computeLayoutContract();
    _trace('update-schedule', contract);
    if (typeof RenderScheduler !== 'undefined') {
      RenderScheduler.invalidateLayer('scroll', 'WorkspaceScrollEngine');
      RenderScheduler.post(_apply, 'WorkspaceScrollEngine.apply');
      return;
    }
    if (_rafId) return;
    _rafId = requestAnimationFrame(() => {
      _rafId = null;
      _apply();
    });
  }

  function _apply() {
    const ws = document.getElementById('workspace');
    if (!ws) return;
    const contract = WorkspaceScrollEngineLayout.computeLayoutContract();
    const signature = JSON.stringify(contract);
    _trace('updateSync-apply', contract);
    if (_lastGeometrySignature === signature) return;
    _lastGeometrySignature = signature;
    const vp = document.getElementById('viewport');
    if (vp) {
      const nextMarginBottom = `${contract.padding}px`;
      if (vp.style.marginBottom !== nextMarginBottom) {
        vp.style.marginBottom = nextMarginBottom;
      }
    }
    ws.dispatchEvent(new CustomEvent('rf:scroll-geometry', {
      detail: { scaledW: contract.scaledW, scaledH: contract.scaledH, padding: contract.padding },
      bubbles: false,
    }));
  }

  return {
    init() {
      const ws = document.getElementById('workspace');
      if (ws) {
        ws.addEventListener('rf:zoom-changed', () => this.update());
        ws.addEventListener('scroll', () => {
          if (typeof OverlayEngine !== 'undefined') OverlayEngine.render();
        });
      }
      if (typeof ResizeObserver !== 'undefined') {
        const cl = document.getElementById('canvas-layer');
        if (cl) {
          new ResizeObserver(() => this.update()).observe(cl);
        }
      }
      window.addEventListener('resize', () => this.update());
    },

    updateSync() {
      if (typeof RenderScheduler !== 'undefined') {
        RenderScheduler.assertDomWriteAllowed('WorkspaceScrollEngine.updateSync');
      }
      if (typeof RenderScheduler !== 'undefined') {
        RenderScheduler.invalidateLayer('scroll', 'WorkspaceScrollEngine');
      }
      _trace('updateSync-enter', WorkspaceScrollEngineLayout.computeLayoutContract());
      _apply();
    },

    update() { scheduleUpdate(); },
    adjustForZoom: WorkspaceScrollEngineLayout.adjustForZoom,
    getGeometry() { return WorkspaceScrollEngineLayout.computeLayoutContract(); },
    getLayoutContract() { return WorkspaceScrollEngineLayout.computeLayoutContract(); },
  };
})();

if (typeof module !== 'undefined') module.exports = WorkspaceScrollEngineRuntime;
