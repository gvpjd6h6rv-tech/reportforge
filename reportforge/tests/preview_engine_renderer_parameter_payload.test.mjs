'use strict';
/**
 * Fase 9 — RF-CR-PARAMS-PANEL-1 regression/contract.
 *
 * PreviewEngineRenderer._buildPayload() (internal, not exported) now
 * prefers DS.parameterValues[name] over layout.parameters[].defaultValue
 * when a current value exists. Since _buildPayload isn't exported, this
 * intercepts the fetch('/designer-preview', {body}) that refresh() sends
 * and inspects the payload it actually built — proving the CONTRACT
 * (what preview receives), not the implementation detail.
 */
import test   from 'node:test';
import assert from 'node:assert/strict';
import fs     from 'node:fs';
import vm     from 'node:vm';
import { resolve, dirname } from 'node:path';
import { fileURLToPath }    from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function makeElement() {
  return {
    style: {},
    children: [],
    replaceChildren() { this.children = []; },
    appendChild(child) { this.children.push(child); },
    querySelectorAll() { return []; },
  };
}

async function runRefresh(DS) {
  const src = fs.readFileSync(resolve(ROOT, 'engines/PreviewEngineRenderer.js'), 'utf8');
  const previewContent = makeElement();
  const elements = { 'preview-layer': makeElement(), 'preview-content': previewContent };

  let capturedBody = null;
  const ctx = {
    window: {},
    DS,
    CustomEvent: class CustomEvent { constructor(type, opts) { this.type = type; this.detail = opts?.detail; } },
    document: {
      getElementById: (id) => elements[id] || null,
      createElement: () => makeElement(),
      dispatchEvent: () => {},
    },
    fetch: async (_url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return { ok: true, text: async () => '<div></div>' };
    },
    PreviewEngineContracts: {
      assertSelectionState: () => {},
      assertZoomContract: () => {},
      assertPreviewDomContract: () => {
        if (!elements['preview-layer'] || !elements['preview-content']) throw new Error('missing DOM');
      },
    },
    PreviewEngineRendererLayout: {
      _previewPageWidth: () => 800,
      _previewPageHeight: () => 1100,
      _preparePreviewStageWidth: () => {},
      _resetPreviewStageWidth: () => {},
      _applyCleanHtml: () => {},
      PREVIEW_STYLE_ID: 'preview-style-stub',
    },
    PreviewEngineMode: { isActive: () => true },
    PreviewEngineData: { renderWithData: () => '' },
  };
  ctx.window = ctx;
  vm.runInNewContext(src, ctx);
  await ctx.PreviewEngineRenderer.refresh();
  return capturedBody;
}

test('refresh — payload.params uses current parameterValues over defaultValue', async () => {
  const DS = {
    zoom: 1,
    selection: null,
    previewMode: true,
    layout: { parameters: [{ name: 'FechaDesde', defaultValue: '2026-01-01' }] },
    parameterValues: { FechaDesde: '2026-03-15' },
    getTotalHeight: () => 0,
  };
  const body = await runRefresh(DS);
  assert.equal(body.params.FechaDesde, '2026-03-15');
});

test('refresh — payload.params falls back to defaultValue when no current value set (no regression)', async () => {
  const DS = {
    zoom: 1,
    selection: null,
    previewMode: true,
    layout: { parameters: [{ name: 'FechaDesde', defaultValue: '2026-01-01' }] },
    parameterValues: {},
    getTotalHeight: () => 0,
  };
  const body = await runRefresh(DS);
  assert.equal(body.params.FechaDesde, '2026-01-01');
});

test('refresh — report with NO parameters produces empty params object (pre-Fase-9 behavior unchanged)', async () => {
  const DS = {
    zoom: 1,
    selection: null,
    previewMode: true,
    layout: {},
    parameterValues: undefined,
    getTotalHeight: () => 0,
  };
  const body = await runRefresh(DS);
  assert.deepEqual(body.params, {});
});

test('refresh — DS.parameterValues undefined entirely does not throw (safe fallback)', async () => {
  const DS = {
    zoom: 1,
    selection: null,
    previewMode: true,
    layout: { parameters: [{ name: 'X', defaultValue: 'd' }] },
    getTotalHeight: () => 0,
  };
  const body = await runRefresh(DS);
  assert.equal(body.params.X, 'd');
});
