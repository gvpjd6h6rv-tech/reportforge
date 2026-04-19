'use strict';

(function initCanvasLayoutSize(global) {
  const C = global.CanvasLayoutContracts;
  let _lastCanvasSignature = null;

  function _px(value) {
    return `${Math.round(value)}px`;
  }

  function _trace(event, payload) {
    if (typeof window === 'undefined' || typeof window.rfTrace !== 'function') return;
    if (!window.DebugTrace?.isEnabled('runtime')) return;
    const frame = (typeof RenderScheduler !== 'undefined' && typeof RenderScheduler.frame === 'number')
      ? RenderScheduler.frame
      : null;
    window.rfTrace('runtime', event, {
      frame,
      source: 'CanvasLayoutEngine',
      phase: 'layout',
      payload: payload || null,
    });
  }

  function _computeLayoutContract() {
    if (typeof DS === 'undefined') {
      return { ready: false, width: 0, height: 0, minHeight: 0, maxHeight: 0 };
    }

    const height = DS.sections.reduce((s, sec) => s + Math.round(RF.Geometry.scale(sec.height)), 0);
    return {
      ready: true,
      width: Math.round(RF.Geometry.scale(CFG.PAGE_W)),
      height,
      minHeight: 0,
      maxHeight: height,
    };
  }

  function _applyCLSize() {
    const cl = document.getElementById('canvas-layer');
    if (!cl || typeof DS === 'undefined') return;
    const contract = _computeLayoutContract();
    const signature = JSON.stringify(contract);
    if (_lastCanvasSignature === signature) return;
    _lastCanvasSignature = signature;
    _trace('updateSync-apply', {
      width: contract.width,
      height: contract.height,
      minHeight: contract.minHeight,
      maxHeight: contract.maxHeight,
    });
    const nextWidth = _px(contract.width);
    const nextHeight = _px(contract.height);
    const nextMinHeight = _px(contract.minHeight);
    const nextMaxHeight = _px(contract.maxHeight);
    if (cl.style.width !== nextWidth) cl.style.width = nextWidth;
    if (cl.style.minHeight !== nextMinHeight) cl.style.minHeight = nextMinHeight;
    if (cl.style.height !== nextHeight) cl.style.height = nextHeight;
    if (cl.style.maxHeight !== nextMaxHeight) cl.style.maxHeight = nextMaxHeight;
  }

  function _scheduleSize() {
    if (typeof RenderScheduler !== 'undefined') {
      RenderScheduler.invalidateLayer('canvas', 'CanvasLayoutEngine');
    }
    if (typeof RenderScheduler !== 'undefined') {
      RenderScheduler.layout(_applyCLSize, 'CanvasLayoutEngine.size');
    } else {
      requestAnimationFrame(_applyCLSize);
    }
  }

  function update() {
    const contract = _computeLayoutContract();
    _trace('update-schedule', {
      width: contract.width,
      height: contract.height,
    });
    _scheduleSize();
  }

  function updateSync() {
    if (typeof RenderScheduler !== 'undefined') {
      RenderScheduler.assertDomWriteAllowed('CanvasLayoutEngine.updateSync');
    }
    const contract = _computeLayoutContract();
    _trace('updateSync-enter', {
      width: contract.width,
      height: contract.height,
    });
    _applyCLSize();
  }

  function getMetrics() {
    return {
      scaledW: RF.Geometry.scale(CFG.PAGE_W),
      scaledH: RF.Geometry.scale(typeof DS !== 'undefined' ? DS.getTotalHeight() : 0),
      modelW: CFG.PAGE_W,
      modelH: typeof DS !== 'undefined' ? DS.getTotalHeight() : 0,
      zoom: RF.Geometry.zoom(),
    };
  }

  function getLayoutContract() {
    return _computeLayoutContract();
  }

  global.CanvasLayoutSize = {
    update,
    updateSync,
    getMetrics,
    getLayoutContract,
    applyCLSize: _applyCLSize,
    scheduleSize: _scheduleSize,
  };
})(window);
