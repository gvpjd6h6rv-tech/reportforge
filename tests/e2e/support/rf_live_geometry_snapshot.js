'use strict';

async function captureCanvasGeometry(page, label) {
  return page.evaluate((label) => {
    const px = (n) => Math.round(Number(n || 0) * 100) / 100;

    const canvas = document.getElementById('canvas-layer');
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
