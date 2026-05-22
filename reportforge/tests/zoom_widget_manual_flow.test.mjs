import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startRuntimeServer,
  launchRuntimePage,
} from './runtime_harness.mjs';

test('zoom widget manual flow', { timeout: 120000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);

  try {
    const readUiEntries = () => page.evaluate(() => window.RF_UI_TRACE?.getEntries?.() ?? []);
    const clearUiEntries = () => page.evaluate(() => window.RF_UI_TRACE?.clear?.());
    const assertUiZoomTrace = (entry, expected) => {
      assert.ok(entry, `missing UI trace for ${expected.event}`);
      assert.equal(entry.kind, 'ui');
      assert.equal(entry.phase, 'after');
      assert.equal(entry.source, expected.source);
      assert.ok(entry.before, 'UI trace must include before snapshot');
      assert.ok(entry.after, 'UI trace must include after snapshot');
      assert.ok(entry.dom, 'UI trace must include live DOM snapshot');
      assert.equal(entry.after.dsZoom, expected.dsZoom);
      assert.equal(entry.after.sliderValue, expected.sliderValue);
      assert.equal(entry.after.pctText, expected.pctText);
      assert.equal(entry.dom.dsZoom, expected.dsZoom);
      assert.equal(entry.dom.sliderValue, expected.sliderValue);
      assert.equal(entry.dom.pctText, expected.pctText);
      assert.equal(entry.after.sliderValue, entry.dom.sliderValue, 'UI trace must reflect the visible slider value');
      assert.equal(entry.after.pctText, entry.dom.pctText, 'UI trace must reflect the visible percent text');
      assert.equal(entry.after.dsZoom, entry.dom.dsZoom, 'UI trace must reflect the visible zoom state');
      assert.ok(entry.after.sliderRect && entry.after.sliderRect.width > 0, 'UI trace must include slider geometry');
      assert.ok(entry.after.sliderStyle, 'UI trace must include slider computed style');
      assert.notEqual(entry.after.sliderStyle.display, 'none', 'slider must be displayed');
      assert.notEqual(entry.after.sliderStyle.visibility, 'hidden', 'slider must be visible');
      assert.notEqual(entry.after.sliderStyle.opacity, '0', 'slider must not be transparent');
      assert.ok(entry.after.visibleElement, 'UI trace must resolve a visible element');
      assert.ok(entry.dom.visibleElement, 'live DOM snapshot must resolve a visible element');
    };

    const readState = () => page.evaluate(() => {
      const slider = document.getElementById('zw-slider');
      const pct = document.getElementById('zw-pct');
      const sb = document.getElementById('sb-zoom');
      const tb = document.getElementById('tb-zoom');
      const panel = document.getElementById('rf-zoom-live-debug');
      const panelText = panel?.textContent?.replace(/\s+/g, ' ').trim();
      const rect = slider?.getBoundingClientRect();
      return {
        zoom: DS.zoom,
        sliderValue: slider?.value,
        pct: pct?.textContent,
        sb: sb?.textContent,
        tb: tb?.selectedOptions?.[0]?.textContent,
        debugZoom: window.RF_DEBUG_ZOOM,
        panelVisible: panel ? (() => {
          const cs = getComputedStyle(panel);
          return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
        })() : false,
        panelText,
        rect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
      };
    });

    const cacheHeaders = await page.evaluate(async () => {
      const htmlResp = await fetch(location.href, { cache: 'no-store' });
      const jsResp = await fetch('/engines/ZoomEngine.js', { cache: 'no-store' });
      const buildInfo = window.RF_BUILD_INFO || {};
      const debugZoom = window.RF_DEBUG_ZOOM || {};
      const buildDebug = document.getElementById('rf-build-debug');
      return {
        htmlCacheControl: htmlResp.headers.get('cache-control'),
        jsCacheControl: jsResp.headers.get('cache-control'),
        buildInfo,
        debugZoom,
        buildText: buildDebug?.textContent?.replace(/\s+/g, ' ').trim(),
        buildVisible: buildDebug ? getComputedStyle(buildDebug).display !== 'none' && getComputedStyle(buildDebug).visibility !== 'hidden' && getComputedStyle(buildDebug).opacity !== '0' : false,
        tbCount: document.querySelectorAll('#tb-zoom').length,
        zwCount: document.querySelectorAll('#zw-slider').length,
      };
    });
    assert.match(cacheHeaders.htmlCacheControl || '', /no-store/i);
    assert.match(cacheHeaders.jsCacheControl || '', /no-store/i);
    assert.match(cacheHeaders.buildInfo.commit || '', /^[0-9a-f]{7,}$/i);
    assert.match(cacheHeaders.buildInfo.assetVersion || '', /\d{4}-\d{2}-\d{2}T/);
    assert.equal(cacheHeaders.buildInfo.jsRoute, '/engines/ZoomEngine.js');
    assert.equal(cacheHeaders.buildInfo.cacheStatus, 'no-store');
    assert.equal(cacheHeaders.buildVisible, true);
    assert.match(cacheHeaders.buildText || '', /commit/i);
    assert.match(cacheHeaders.buildText || '', /asset/i);
    assert.match(cacheHeaders.buildText || '', /js/i);
    assert.match(cacheHeaders.buildText || '', /cache/i);
    assert.match(cacheHeaders.debugZoom.commit || '', /^[0-9a-f]{7,}$/i);
    assert.equal(cacheHeaders.debugZoom.assetVersion, cacheHeaders.buildInfo.assetVersion);
    assert.equal(cacheHeaders.tbCount, 1);
    assert.equal(cacheHeaders.zwCount, 1);
    const debugState0 = await readState();
    assert.equal(debugState0.panelVisible, true);
    assert.match(debugState0.panelText || '', /EVENT/i);
    assert.match(debugState0.panelText || '', /FN/i);
    await clearUiEntries();

    const shotSlider = async () => page.locator('#zw-slider').screenshot({ animations: 'disabled' });

    const expectDifferentShots = (a, b, label) => {
      assert.ok(!a.equals(b), `${label}: slider screenshot must change`);
    };

    let state = await readState();
    assert.equal(state.pct, '100%');
    assert.equal(state.sliderValue, '100');
    const shot100 = await shotSlider();

    await page.locator('#zw-in').click();
    await page.waitForFunction(() => document.getElementById('zw-pct')?.textContent === '150%');
    state = await readState();
    let uiEntries = await readUiEntries();
    let zoomTrace = uiEntries.filter((entry) => entry.kind === 'ui' && entry.phase === 'after' && entry.source === 'DesignZoomEngine._apply').at(-1);
    assertUiZoomTrace(zoomTrace, {
      event: 'plus',
      source: 'DesignZoomEngine._apply',
      dsZoom: 1.5,
      sliderValue: '150',
      pctText: '150%',
    });
    assert.equal(state.pct, '150%');
    assert.equal(state.sliderValue, '150');
    assert.equal(state.sb, '150%');
    assert.equal(state.debugZoom.tbValue, '150%');
    const shot150 = await shotSlider();
    expectDifferentShots(shot100, shot150, '100% vs 150%');

    await page.locator('#zw-out').click();
    await page.waitForFunction(() => document.getElementById('zw-pct')?.textContent === '100%');
    state = await readState();
    uiEntries = await readUiEntries();
    zoomTrace = uiEntries.filter((entry) => entry.kind === 'ui' && entry.phase === 'after' && entry.source === 'DesignZoomEngine._apply').at(-1);
    assertUiZoomTrace(zoomTrace, {
      event: 'minus',
      source: 'DesignZoomEngine._apply',
      dsZoom: 1.0,
      sliderValue: '100',
      pctText: '100%',
    });
    assert.equal(state.pct, '100%');
    assert.equal(state.sliderValue, '100');
    assert.equal(state.tb, '100%');
    assert.equal(state.debugZoom.tbValue, '100%');
    const shot100b = await shotSlider();
    expectDifferentShots(shot150, shot100b, '150% vs 100%');

    await page.locator('#zw-out').click();
    await page.waitForFunction(() => document.getElementById('zw-pct')?.textContent === '75%');
    state = await readState();
    uiEntries = await readUiEntries();
    zoomTrace = uiEntries.filter((entry) => entry.kind === 'ui' && entry.phase === 'after' && entry.source === 'DesignZoomEngine._apply').at(-1);
    assertUiZoomTrace(zoomTrace, {
      event: 'minus',
      source: 'DesignZoomEngine._apply',
      dsZoom: 0.75,
      sliderValue: '75',
      pctText: '75%',
    });
    assert.equal(state.pct, '75%');
    assert.equal(state.sliderValue, '75');
    assert.equal(state.tb, '75%');
    assert.equal(state.debugZoom.tbValue, '75%');
    const shot75 = await shotSlider();
    expectDifferentShots(shot100b, shot75, '100% vs 75%');

    const box = await page.locator('#zw-slider').boundingBox();
    assert.ok(box, 'slider box missing');
    const beforeDrag = await readState();
    await page.mouse.move(box.x + 3, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.85, box.y + box.height / 2, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    state = await readState();
    uiEntries = await readUiEntries();
    zoomTrace = uiEntries.filter((entry) => entry.kind === 'ui' && entry.phase === 'after' && entry.source === 'DesignZoomEngine._apply').at(-1);
    assertUiZoomTrace(zoomTrace, {
      event: 'slider',
      source: 'DesignZoomEngine._apply',
      dsZoom: state.zoom,
      sliderValue: state.sliderValue,
      pctText: `${state.sliderValue}%`,
    });
    assert.notEqual(state.sliderValue, beforeDrag.sliderValue, 'drag must move slider value');
    assert.equal(state.pct, `${state.sliderValue}%`);
    assert.equal(state.debugZoom.tbValue, `${state.sliderValue}%`);
    const shotDrag = await shotSlider();
    expectDifferentShots(shot75, shotDrag, '75% vs drag');

    const docBefore = await page.evaluate(() => document.getElementById('canvas-layer').getBoundingClientRect().width);
    await page.mouse.move(500, 400);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -300);
    await page.keyboard.up('Control');
    await page.waitForTimeout(200);
    state = await readState();
    const docAfter = await page.evaluate(() => document.getElementById('canvas-layer').getBoundingClientRect().width);
    uiEntries = await readUiEntries();
    zoomTrace = uiEntries.filter((entry) => entry.kind === 'ui' && entry.phase === 'after' && entry.source === 'DesignZoomEngine._apply').at(-1);
    assertUiZoomTrace(zoomTrace, {
      event: 'wheel',
      source: 'DesignZoomEngine._apply',
      dsZoom: state.zoom,
      sliderValue: state.sliderValue,
      pctText: `${Math.round(state.zoom * 100)}%`,
    });
    assert.equal(state.pct, `${Math.round(state.zoom * 100)}%`);
    assert.notEqual(docBefore, docAfter, 'Ctrl+wheel must change document scale');
    assert.equal(state.debugZoom.tbValue, `${Math.round(state.zoom * 100)}%`);
    const shotWheel = await shotSlider();
    expectDifferentShots(shotDrag, shotWheel, 'drag vs ctrlwheel');
  } finally {
    await browser.close();
    await server.stop();
  }
});
