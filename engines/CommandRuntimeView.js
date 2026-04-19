'use strict';

(function initCommandRuntimeView(global) {
  const { setStatus } = global.CommandRuntimeShared;

  function zoomFitPage() {
    const ws = document.getElementById('workspace');
    if (!ws) return;
    const lay = computeLayout();
    const totalH = DS.getTotalHeight();
    const availW = ws.clientWidth - lay.rulerWidth - 32;
    const availH = ws.clientHeight - lay.rulerHeight - 32;
    const scaleW = availW / CFG.PAGE_W;
    const scaleH = availH / Math.max(totalH, 100);
    DesignZoomEngine.setFree(Math.min(scaleW, scaleH));
    setStatus('Ajustar página');
  }

  function zoomFitWidth() {
    const ws = document.getElementById('workspace');
    if (!ws) return;
    const lay = computeLayout();
    const availW = ws.clientWidth - lay.rulerWidth - 32;
    DesignZoomEngine.setFree(availW / CFG.PAGE_W);
    setStatus('Ajustar ancho');
  }

  function addHGuide() {
    const ws = document.getElementById('workspace');
    const overlay = document.getElementById('guide-layer');
    if (!overlay || !ws) return;
    const y = ws.scrollTop + (ws.clientHeight / 2);
    const g = document.createElement('div');
    g.className = 'rf-guide rf-guide-h user-guide';
    g.style.cssText = `position:absolute;top:${Math.round(y)}px;left:0;width:100%;height:1px;background:#0080ff;opacity:0.6;pointer-events:none;`;
    overlay.appendChild(g);
    setStatus('Guía horizontal añadida');
  }

  function addVGuide() {
    const ws = document.getElementById('workspace');
    const overlay = document.getElementById('guide-layer');
    if (!overlay || !ws) return;
    const x = ws.scrollLeft + (ws.clientWidth / 2);
    const g = document.createElement('div');
    g.className = 'rf-guide rf-guide-v user-guide';
    g.style.cssText = `position:absolute;left:${Math.round(x)}px;top:0;width:1px;height:100%;background:#0080ff;opacity:0.6;pointer-events:none;`;
    overlay.appendChild(g);
    setStatus('Guía vertical añadida');
  }

  function removeGuide() {
    const guides = document.querySelectorAll('.user-guide');
    if (guides.length > 0) guides[guides.length - 1].remove();
    setStatus('Guía eliminada');
  }

  global.CommandRuntimeView = { zoomFitPage, zoomFitWidth, addHGuide, addVGuide, removeGuide };
})(window);
