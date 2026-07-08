'use strict';

async function captureCanvasGeometry(page, label) {
  return page.evaluate((label) => {
    const px = (n) => Math.round(Number(n || 0) * 100) / 100;

    const canvas = document.getElementById('canvas-layer');
    const viewport = document.getElementById('viewport');
    const workspace = document.getElementById('workspace');
    const rect = canvas.getBoundingClientRect();
    const computed = getComputedStyle(canvas);
    const pageW = Number(CFG.PAGE_W);
    const zoom = Number(DS.zoom || 1);

    return {
      label,
      mode: document.body.getAttribute('data-render-mode') || 'design',
      pageW,
      zoom,
      inlineWidth: canvas.style.width,
      computedWidth: computed.width,
      rectWidth: px(rect.width),
      expectedRectWidth: px(pageW * zoom),
      // RF-ZOOM-VIEWPORT-OWNER-1: DesignZoomEngine._apply() (since
      // 333fc920, "Stabilize preview parity and harden overlay
      // ownership") applies scale(z) to #viewport and deliberately
      // leaves #canvas-layer's own transform at 'none' to avoid double
      // scaling — #viewport is the real owner of the zoom transform.
      // `transform` (canvas-layer) is kept as supporting evidence only.
      viewportTransform: viewport ? viewport.style.transform : null,
      transform: canvas.style.transform,
      workspaceClientWidth: workspace.clientWidth,
      workspaceScrollWidth: workspace.scrollWidth,
      workspaceSlack: workspace.scrollWidth - workspace.clientWidth,
    };
  }, label);
}

async function captureRulerHGeometry(page, label) {
  return page.evaluate((label) => {
    const px = (n) => Math.round(Number(n || 0) * 100) / 100;

    const canvas = document.getElementById('canvas-layer');
    const rulerBox = document.getElementById('ruler-h-canvas');
    const rulerInner = document.getElementById('ruler-h-inner');

    const canvasRect = canvas.getBoundingClientRect();
    const boxRect = rulerBox.getBoundingClientRect();
    const innerRect = rulerInner.getBoundingClientRect();
    const boxComputed = getComputedStyle(rulerBox);

    return {
      label,
      mode: document.body.getAttribute('data-render-mode') || 'design',
      pageW: Number(CFG.PAGE_W),
      canvas: {
        inlineWidth: canvas.style.width,
        rectWidth: px(canvasRect.width),
        transform: canvas.style.transform,
      },
      rulerBox: {
        attrStyle: rulerBox.getAttribute('style') || '',
        inlineWidth: rulerBox.style.width,
        inlineFlex: rulerBox.style.flex,
        computedFlex: boxComputed.flex,
        rectWidth: px(boxRect.width),
      },
      rulerInner: {
        attrStyle: rulerInner.getAttribute('style') || '',
        inlineWidth: rulerInner.style.width,
        rectWidth: px(innerRect.width),
        backingWidth: rulerInner.width,
      },
    };
  }, label);
}

module.exports = {
  captureCanvasGeometry,
  captureRulerHGeometry,
};
