import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startRuntimeServer,
  launchRuntimePage,
  setZoom,
  enterPreview,
  exitPreview,
  assertNoConsoleErrors,
} from './runtime_harness.mjs';

test('design preview zoom/logo smoke', { timeout: 120000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);

  try {
    const imageId = 'tmp-logo-smoke';
    const imageSrc = `data:image/svg+xml;charset=utf-8,${encodeURIComponent([
      '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="64">',
      '<rect width="160" height="64" fill="#0b62d6"/>',
      '<text x="80" y="40" font-family="Arial" font-size="24" text-anchor="middle" fill="#fff">LOGO</text>',
      '</svg>',
    ].join(''))}`;

    await page.evaluate(({ imageId, imageSrc }) => {
      const section = DS.sections[0];
      const next = {
        id: imageId,
        type: 'image',
        sectionId: section.id,
        x: 24,
        y: 18,
        w: 160,
        h: 64,
        src: imageSrc,
        srcFit: 'contain',
        content: 'Logo smoke',
        zIndex: 9,
      };
      DS.elements.push(next);
      if (typeof CanvasLayoutEngine !== 'undefined' && typeof CanvasLayoutEngine.renderAll === 'function') {
        CanvasLayoutEngine.renderAll();
      }
    }, { imageId, imageSrc });

    await page.waitForFunction((id) => !!document.querySelector(`.cr-element[data-id="${id}"] img.el-content`), imageId);
    const designLogo = await page.evaluate((id) => {
      const node = document.querySelector(`.cr-element[data-id="${id}"]`);
      const img = node?.querySelector('img.el-content');
      return {
        exists: !!node,
        hasImg: !!img,
        src: img?.getAttribute('src') || null,
      };
    }, imageId);
    assert.ok(designLogo.exists, 'design logo element missing');
    assert.ok(designLogo.hasImg, 'design logo must render as <img>');
    assert.ok(designLogo.src?.startsWith('data:image/svg+xml'), 'design logo src missing');

    const sampleId = await page.evaluate(() => {
      const sample = DS.elements.find((el) => el.type !== 'image');
      return sample ? sample.id : null;
    });
    assert.ok(sampleId, 'zoom sample missing');
    const before = await page.evaluate((id) => {
      const node = document.querySelector(`.cr-element[data-id="${id}"]`);
      const rect = node?.getBoundingClientRect();
      return rect ? { width: rect.width, height: rect.height } : null;
    }, sampleId);
    assert.ok(before, 'zoom sample rect missing');
    await setZoom(page, 2.0);
    const after = await page.evaluate((id) => {
      const node = document.querySelector(`.cr-element[data-id="${id}"]`);
      const rect = node?.getBoundingClientRect();
      return rect ? { width: rect.width, height: rect.height } : null;
    }, sampleId);
    assert.ok(after, 'zoomed sample rect missing');
    assert.ok(after.width > before.width * 1.7, `zoom width did not scale: ${after.width} vs ${before.width}`);
    assert.ok(after.height > before.height * 1.7, `zoom height did not scale: ${after.height} vs ${before.height}`);

    await setZoom(page, 1.0);
    await enterPreview(page);
    await page.waitForFunction(() => !!document.querySelector('#preview-content .preview-render-layer img'));
    const previewLogo = await page.evaluate(() => {
      const img = document.querySelector('#preview-content .preview-render-layer img[src^="data:image/svg+xml"]');
      return {
        hasImg: !!img,
        src: img?.getAttribute('src') || null,
      };
    });
    assert.ok(previewLogo.hasImg, 'preview logo must render as <img>');
    assert.ok(previewLogo.src?.startsWith('data:image/svg+xml'), 'preview logo src missing');
    await exitPreview(page);

    await assertNoConsoleErrors(consoleErrors, 'design preview zoom/logo smoke');
  } finally {
    await browser.close();
    await server.stop();
  }
});
