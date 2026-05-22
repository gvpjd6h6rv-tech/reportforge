import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startRuntimeServer,
  launchRuntimePage,
  enterPreview,
  assertNoConsoleErrors,
} from './runtime_harness.mjs';

function makeZoomEntry(overrides = {}) {
  return {
    kind: 'ui',
    timestamp: '2026-05-22T10:00:00.000Z',
    source: 'DesignZoomEngine._apply',
    action: 'wheel',
    fn: 'PreviewZoomEngine.set',
    phase: 'after',
    before: { dsZoom: 1, sliderValue: '100', pctText: '100%' },
    after: { dsZoom: 1.5, sliderValue: '150', pctText: '150%' },
    state: { dsZoom: 1.5 },
    dom: { dsZoom: 1.5, sliderValue: '150', pctText: '150%' },
    result: 'ok',
    ...overrides,
  };
}

async function readPanel(page) {
  return page.evaluate(() => {
    const host = document.getElementById('rf-debug-center-root');
    const shadow = host?.shadowRoot;
    const text = (id) => shadow?.getElementById(id)?.textContent?.replace(/\s+/g, ' ').trim() || '';
    return {
      title: text('rf-debug-center-zoom-status'),
      meta: text('rf-debug-center-zoom-meta'),
      body: text('rf-debug-center-zoom-body'),
      hostVisible: host ? (() => {
        const cs = getComputedStyle(host);
        return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
      })() : false,
    };
  });
}

async function readZoom(page) {
  return page.evaluate(() => window.RFDebugCenter?.getState?.()?.zoom || null);
}

async function applyFixture(page, fixture = {}) {
  return page.evaluate(async (next) => {
    window.__rfSavedDS ||= window.DS;
    window.__rfZoomTraceClearCalls = 0;
    window.DS = next.useSavedDS === false ? undefined : window.__rfSavedDS;
    if (window.DS && next.dsPatch && window.DS.state) {
      if ('zoom' in next.dsPatch) window.DS.state.zoom = next.dsPatch.zoom;
      if ('zoomDesign' in next.dsPatch) window.DS.state.zoomDesign = next.dsPatch.zoomDesign;
      if ('previewZoom' in next.dsPatch || 'zoomPreview' in next.dsPatch) {
        const previewValue = 'previewZoom' in next.dsPatch ? next.dsPatch.previewZoom : next.dsPatch.zoomPreview;
        window.DS.state.previewZoom = previewValue;
        window.DS.state.zoomPreview = previewValue;
      }
      if ('previewMode' in next.dsPatch) window.DS.state.previewMode = next.dsPatch.previewMode;
    }

    const slider = document.getElementById('zw-slider');
    const pct = document.getElementById('zw-pct');
    const tb = document.getElementById('tb-zoom');
    const canvas = document.getElementById('canvas-layer');
    if (slider) {
      if (next.sliderMin != null) slider.min = String(next.sliderMin);
      if (next.sliderMax != null) slider.max = String(next.sliderMax);
      if (next.sliderStep != null) slider.step = String(next.sliderStep);
      if (next.sliderValue != null) slider.value = String(next.sliderValue);
    }
    if (pct && next.pctText != null) pct.textContent = String(next.pctText);
    if (tb && next.tbZoomValue != null) tb.value = String(next.tbZoomValue);
    if (canvas && next.transform !== undefined) {
      canvas.style.transform = next.transform;
      canvas.style.transformOrigin = 'top left';
    }
    const before = window.DS ? {
      zoom: window.DS.zoom,
      zoomDesign: window.DS.zoomDesign,
      zoomPreview: window.DS.zoomPreview,
      previewMode: window.DS.previewMode,
    } : null;

    if (next.traceMode === 'absent') {
      window.RF_UI_TRACE = undefined;
    } else if (next.traceMode === 'invalid') {
      window.RF_UI_TRACE = {
        getEntries: () => ({ nope: true }),
        snapshot: () => null,
        clear: () => { window.__rfZoomTraceClearCalls += 1; },
      };
    } else {
      let entries = [];
      window.RF_UI_TRACE = {
        getEntries: () => entries,
        snapshot: () => next.traceSnapshot || null,
        clear: () => { window.__rfZoomTraceClearCalls += 1; },
      };
      await window.RFDebugCenter.clearTimeline();
      entries = next.traceEntries || [];
      await window.RFDebugCenter.refresh();
      const state = window.RFDebugCenter.getState().zoom;
      return {
        state,
        clearCalls: window.__rfZoomTraceClearCalls,
        before,
        ds: window.DS ? {
          zoom: window.DS.zoom,
          zoomDesign: window.DS.zoomDesign,
          zoomPreview: window.DS.zoomPreview,
          previewMode: window.DS.previewMode,
        } : null,
      };
    }

    await window.RFDebugCenter.clearTimeline();
    await window.RFDebugCenter.refresh();

    const state = window.RFDebugCenter.getState().zoom;
    return {
      state,
      clearCalls: window.__rfZoomTraceClearCalls,
      before,
      ds: window.DS ? {
        zoom: window.DS.zoom,
        zoomDesign: window.DS.zoomDesign,
        zoomPreview: window.DS.zoomPreview,
        previewMode: window.DS.previewMode,
      } : null,
    };
  }, fixture);
}

test('rf debug center zoom diagnostics live preview', { timeout: 120000 }, async () => {
  const server = await startRuntimeServer();
  const debugUrl = new URL(server.baseUrl);
  debugUrl.searchParams.set('rfDebugCenter', '1');
  const { browser, page, consoleErrors } = await launchRuntimePage(debugUrl.toString());

  try {
    await page.waitForFunction(() => window.RFDebugCenter?.enabled === true);
    await page.waitForFunction(() => !!document.getElementById('rf-debug-center-root')?.shadowRoot);

    let panel = await readPanel(page);
    assert.equal(panel.hostVisible, true);
    assert.match(panel.title, /unknown|warning|synced/i);
    assert.match(panel.body, /ds\.zoom/i);

    await enterPreview(page);
    await page.evaluate(() => window.RF_UI_TRACE?.clear?.());
    await page.evaluate(() => window.RFDebugCenter?.clearTimeline?.());

    await page.mouse.move(500, 400);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -300);
    await page.keyboard.up('Control');
    await page.waitForFunction(() => (window.RFDebugCenter?.getState?.()?.zoom?.traceCount || 0) > 0);
    let zoom = await readZoom(page);
    panel = await readPanel(page);
    assert.match(panel.body, /effectiveZoom/i);
    assert.equal(zoom.mode, 'preview');
    assert.equal(zoom.status, 'synced');
    assert.equal(zoom.traceState, 'present');
    assert.ok(zoom.controls.sliderVisible);
    assert.ok(zoom.controls.pctVisible);
    assert.ok(zoom.controls.tbZoomVisible);
    assert.ok(zoom.dom.visible);
    assert.ok(Math.abs((zoom.dom.scale || 0) - (zoom.zoom.effectiveZoom || 0)) < 0.01);
    assert.equal(zoom.divergences.length, 0);
    assert.ok(zoom.lastZoomEvent);
    assert.match(zoom.evidence.join(' '), /mode preview/);

    await assertNoConsoleErrors(consoleErrors, 'rf debug center zoom diagnostics live preview');
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('rf debug center zoom diagnostics fixtures and divergences', { timeout: 120000 }, async () => {
  const server = await startRuntimeServer();
  const debugUrl = new URL(server.baseUrl);
  debugUrl.searchParams.set('rfDebugCenter', '1');
  const { browser, page, consoleErrors } = await launchRuntimePage(debugUrl.toString());

  try {
    await page.waitForFunction(() => window.RFDebugCenter?.enabled === true);

    const cases = [
      { name: 'DS missing', fixture: { useSavedDS: false, traceMode: 'absent' }, expect: (zoom) => { assert.equal(zoom.status, 'unknown'); assert.ok(zoom.divergences.includes('ds-missing')); } },
      { name: 'RF_UI_TRACE empty', fixture: { dsPatch: { zoom: 1, zoomDesign: 1, zoomPreview: 1, previewMode: false }, traceEntries: [], traceSnapshot: { dsZoom: 1, sliderValue: '100', pctText: '100%', visibleElement: { tag: 'DIV', id: 'canvas-layer' } }, sliderValue: '100', sliderStep: '25', pctText: '100%', tbZoomValue: '100%', transform: 'matrix(1,0,0,1,0,0)' }, expect: (zoom) => { assert.equal(zoom.traceState, 'empty'); assert.ok(zoom.divergences.includes('trace-empty')); } },
      { name: 'synced', fixture: { dsPatch: { zoom: 1.5, zoomDesign: 1.5, zoomPreview: 1, previewMode: false }, traceEntries: [makeZoomEntry({ fn: 'PreviewZoomEngine.set', after: { dsZoom: 1.5, sliderValue: '150', pctText: '150%' }, dom: { dsZoom: 1.5, sliderValue: '150', pctText: '150%' } })], traceSnapshot: { dsZoom: 1.5, sliderValue: '150', pctText: '150%', visibleElement: { tag: 'DIV', id: 'canvas-layer' } }, sliderValue: '150', sliderStep: '25', pctText: '150%', tbZoomValue: '150%', transform: 'matrix(1.5,0,0,1.5,0,0)' }, expect: (zoom) => { assert.equal(zoom.status, 'synced'); assert.equal(zoom.controls.sliderValue, '150'); assert.equal(zoom.controls.pctText, '150%'); } },
      { name: 'slider mismatch', fixture: { dsPatch: { zoom: 1.1, zoomDesign: 1.1, zoomPreview: 1, previewMode: false }, traceEntries: [makeZoomEntry({ after: { dsZoom: 1.1, sliderValue: '100', pctText: '100%' }, dom: { dsZoom: 1.1, sliderValue: '100', pctText: '100%' } })], traceSnapshot: { dsZoom: 1.1, sliderValue: '100', pctText: '100%', visibleElement: { tag: 'DIV', id: 'canvas-layer' } }, sliderValue: '100', sliderStep: '25', pctText: '100%', tbZoomValue: '100%', transform: 'matrix(1.1,0,0,1.1,0,0)' }, expect: (zoom) => { assert.equal(zoom.status, 'error'); assert.ok(zoom.divergences.includes('slider-mismatch')); } },
      { name: 'pct mismatch', fixture: { dsPatch: { zoom: 1.5, zoomDesign: 1.5, zoomPreview: 1, previewMode: false }, traceEntries: [makeZoomEntry({ after: { dsZoom: 1.5, sliderValue: '150', pctText: '100%' }, dom: { dsZoom: 1.5, sliderValue: '150', pctText: '100%' } })], traceSnapshot: { dsZoom: 1.5, sliderValue: '150', pctText: '100%', visibleElement: { tag: 'DIV', id: 'canvas-layer' } }, sliderValue: '150', sliderStep: '25', pctText: '100%', tbZoomValue: '150%', transform: 'matrix(1.5,0,0,1.5,0,0)' }, expect: (zoom) => { assert.equal(zoom.status, 'error'); assert.ok(zoom.divergences.includes('pct-mismatch')); } },
      { name: 'step incompatible', fixture: { dsPatch: { zoom: 1.1, zoomDesign: 1.1, zoomPreview: 1, previewMode: false }, traceEntries: [makeZoomEntry({ after: { dsZoom: 1.1, sliderValue: '110', pctText: '110%' }, dom: { dsZoom: 1.1, sliderValue: '110', pctText: '110%' } })], traceSnapshot: { dsZoom: 1.1, sliderValue: '110', pctText: '110%', visibleElement: { tag: 'DIV', id: 'canvas-layer' } }, sliderValue: '110', sliderStep: '25', pctText: '110%', tbZoomValue: '110%', transform: 'matrix(1.1,0,0,1.1,0,0)' }, expect: (zoom) => { assert.equal(zoom.status, 'error'); assert.ok(zoom.divergences.includes('step-incompatible') || zoom.divergences.includes('slider-mismatch')); } },
      { name: 'preview bridge', fixture: { dsPatch: { zoom: 1.1, zoomDesign: 1, zoomPreview: 1.1, previewMode: true }, traceEntries: [makeZoomEntry({ source: 'DesignZoomEngine._apply', action: 'wheel', fn: 'GlobalEventHandlers.wheel', after: { dsZoom: 1.1, sliderValue: '110', pctText: '110%' }, dom: { dsZoom: 1.1, sliderValue: '110', pctText: '110%' } })], traceSnapshot: { dsZoom: 1.1, sliderValue: '110', pctText: '110%', visibleElement: { tag: 'DIV', id: 'canvas-layer' } }, sliderValue: '110', sliderStep: '1', pctText: '110%', tbZoomValue: '110%', transform: 'matrix(1.1,0,0,1.1,0,0)' }, expect: (zoom) => { assert.equal(zoom.status, 'synced'); assert.match(zoom.evidence.join(' '), /preview bridge/); assert.equal(zoom.lastZoomEvent.source, 'DesignZoomEngine._apply'); assert.equal(zoom.lastZoomEvent.writerActual, 'GlobalEventHandlers.wheel'); } },
      { name: 'invalid trace', fixture: { dsPatch: { zoom: 1, zoomDesign: 1, zoomPreview: 1, previewMode: false }, traceMode: 'invalid', sliderValue: '100', sliderStep: '25', pctText: '100%', tbZoomValue: '100%', transform: 'matrix(1,0,0,1,0,0)' }, expect: (zoom) => { assert.equal(zoom.traceState, 'invalid'); assert.equal(zoom.status, 'unknown'); } },
    ];

    for (const testCase of cases) {
      const result = await applyFixture(page, testCase.fixture);
      testCase.expect(result.state);
      assert.equal(result.clearCalls, 0, `${testCase.name}: RF_UI_TRACE.clear must not be called`);
      assert.deepEqual(result.before, result.ds, `${testCase.name}: debug center must not write DS`);
    }

    await assertNoConsoleErrors(consoleErrors, 'rf debug center zoom diagnostics fixtures and divergences');
  } finally {
    await browser.close();
    await server.stop();
  }
});
