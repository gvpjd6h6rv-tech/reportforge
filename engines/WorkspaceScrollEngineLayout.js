'use strict';

const WorkspaceScrollEngineLayout = (() => {
  const SCROLL_PADDING = 32;

  function computeLayoutContract() {
    const canvasContract = (typeof CanvasLayoutEngine !== 'undefined' &&
      CanvasLayoutEngine &&
      typeof CanvasLayoutEngine.getLayoutContract === 'function')
      ? CanvasLayoutEngine.getLayoutContract()
      : null;
    const sectionContract = (typeof SectionLayoutEngine !== 'undefined' &&
      SectionLayoutEngine &&
      typeof SectionLayoutEngine.getLayoutContract === 'function')
      ? SectionLayoutEngine.getLayoutContract()
      : null;
    const fallbackTotalH = (typeof DS !== 'undefined')
      ? Math.round(RF.Geometry.scale(DS.getTotalHeight()))
      : 0;
    return {
      ready: !!(canvasContract || sectionContract || typeof DS !== 'undefined'),
      scaledW: canvasContract && canvasContract.ready !== false
        ? canvasContract.width
        : sectionContract && sectionContract.ready !== false
          ? sectionContract.pageWidth
          : Math.round(RF.Geometry.scale(CFG.PAGE_W)),
      scaledH: canvasContract && canvasContract.ready !== false
        ? canvasContract.height
        : sectionContract && sectionContract.ready !== false
          ? sectionContract.totalHeight
          : fallbackTotalH,
      padding: SCROLL_PADDING,
    };
  }

  function adjustForZoom(prevZoom, newZoom) {
    const ws = document.getElementById('workspace');
    if (!ws || prevZoom === newZoom) return;
    const centreX = ws.scrollLeft + ws.clientWidth / 2;
    const centreY = ws.scrollTop + ws.clientHeight / 2;
    const modelX = centreX / prevZoom;
    const modelY = centreY / prevZoom;
    const newScrollLeft = modelX * newZoom - ws.clientWidth / 2;
    const newScrollTop = modelY * newZoom - ws.clientHeight / 2;
    ws.scrollLeft = Math.max(0, newScrollLeft);
    ws.scrollTop = Math.max(0, newScrollTop);
  }

  return {
    SCROLL_PADDING,
    computeLayoutContract,
    adjustForZoom,
  };
})();

if (typeof module !== 'undefined') module.exports = WorkspaceScrollEngineLayout;
