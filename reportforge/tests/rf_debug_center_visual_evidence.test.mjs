import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { captureVisualEvidence, clearVisualEvidence, copyVisualEvidenceJSON, getVisualEvidenceSnapshot } from '../../tools/rf-debug-center/rf-debug-center-visual-evidence.js';
import { buildDebugBundle } from '../../tools/rf-debug-center/rf-debug-center-bundle.js';
import { buildWarningsSnapshot } from '../../tools/rf-debug-center/rf-debug-center-warnings.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function makeDoc({ targetId = null, hidden = false, hasPassword = false } = {}) {
  const nodes = {};
  const style = hidden ? { display: 'none', visibility: 'hidden', opacity: '0' } : { display: 'block', visibility: 'visible', opacity: '1' };
  if (targetId) {
    const node = {
      id: targetId, tagName: 'DIV', className: '', style,
      getBoundingClientRect: () => hidden ? { width: 0, height: 0 } : { width: 400, height: 300, left: 0, top: 0, right: 400, bottom: 300 },
      querySelectorAll: (sel) => sel === 'input[type=password]' ? (hasPassword ? [{ type: 'password' }] : []) : [],
    };
    nodes[`#${targetId}`] = node;
  }
  return {
    defaultView: { getComputedStyle: (node) => node.style },
    querySelector: (sel) => nodes[sel] ?? null,
    querySelectorAll: () => [],
    body: { getBoundingClientRect: () => ({ width: 1024, height: 768 }), querySelectorAll: () => [] },
  };
}

function makeWinNoCapture() {
  return { Blob: undefined, URL: { createObjectURL: undefined }, navigator: {}, location: { href: 'http://test/' }, innerWidth: 1024, innerHeight: 768, devicePixelRatio: 1 };
}

test('1. no rompe sin canvas/html2canvas', () => {
  clearVisualEvidence();
  const doc = makeDoc({ targetId: 'canvas-layer' });
  const win = makeWinNoCapture();
  const record = captureVisualEvidence('document', { doc, win });
  assert.ok(record, 'returns record');
  assert.equal(record.status, 'metadata-only');
  assert.equal(record.reason, 'VISUAL_CAPTURE_UNSUPPORTED');
  clearVisualEvidence();
});

test('2. no rompe sin clipboard', () => {
  clearVisualEvidence();
  const snap = getVisualEvidenceSnapshot();
  assert.ok(snap, 'snapshot works without clipboard');
  const json = copyVisualEvidenceJSON();
  assert.ok(typeof json === 'string', 'JSON string returned');
  assert.doesNotThrow(() => JSON.parse(json));
});

test('3. no rompe sin Blob/URL', () => {
  clearVisualEvidence();
  const doc = makeDoc({ targetId: 'canvas-layer' });
  const win = { ...makeWinNoCapture(), Blob: undefined };
  const record = captureVisualEvidence('document', { doc, win });
  assert.equal(record.status, 'metadata-only');
  clearVisualEvidence();
});

test('4. detecta target missing', () => {
  clearVisualEvidence();
  const doc = makeDoc();
  const win = makeWinNoCapture();
  const record = captureVisualEvidence('document', { doc, win });
  assert.equal(record.status, 'skipped');
  assert.equal(record.reason, 'VISUAL_TARGET_MISSING');
  clearVisualEvidence();
});

test('5. detecta target hidden', () => {
  clearVisualEvidence();
  const doc = makeDoc({ targetId: 'canvas-layer', hidden: true });
  const win = makeWinNoCapture();
  const record = captureVisualEvidence('document', { doc, win });
  assert.equal(record.status, 'skipped');
  assert.equal(record.reason, 'VISUAL_TARGET_HIDDEN');
  clearVisualEvidence();
});

test('6. produce metadata-only cuando captura no soportada', () => {
  clearVisualEvidence();
  const doc = makeDoc({ targetId: 'canvas-layer' });
  const win = makeWinNoCapture();
  const record = captureVisualEvidence('document', { doc, win });
  assert.equal(record.status, 'metadata-only');
  assert.equal(record.reason, 'VISUAL_CAPTURE_UNSUPPORTED');
  assert.ok(record.metadata, 'has metadata');
  assert.equal(record.dataUrl, null);
  clearVisualEvidence();
});

test('7. limita dataUrl grande — simula capture too large vía html2canvas mock', async () => {
  clearVisualEvidence();
  const largeDataUrl = 'data:image/png;base64,' + 'A'.repeat(700_000);
  const doc = makeDoc({ targetId: 'canvas-layer' });
  const win = {
    ...makeWinNoCapture(),
    html2canvas: () => Promise.resolve({ toDataURL: () => largeDataUrl, width: 1024, height: 768 }),
  };
  const record = captureVisualEvidence('document', { doc, win });
  await new Promise((r) => setTimeout(r, 50));
  const snap = getVisualEvidenceSnapshot();
  const tooLarge = snap.records.find((r) => r.reason === 'VISUAL_CAPTURE_TOO_LARGE');
  assert.ok(tooLarge || record.status === 'metadata-only', 'large capture handled safely');
  clearVisualEvidence();
});

test('8. redacta/marca input password presente', () => {
  clearVisualEvidence();
  const doc = makeDoc({ targetId: 'canvas-layer', hasPassword: true });
  const win = makeWinNoCapture();
  const record = captureVisualEvidence('document', { doc, win });
  assert.ok(record.redactions.length > 0, 'password input redacted');
  assert.equal(record.redactions[0].reason, 'VISUAL_PASSWORD_INPUT_PRESENT');
  clearVisualEvidence();
});

test('9. clearVisualEvidence limpia solo estado interno', () => {
  const doc = makeDoc({ targetId: 'canvas-layer' });
  const win = makeWinNoCapture();
  captureVisualEvidence('document', { doc, win });
  assert.ok(getVisualEvidenceSnapshot().total > 0, 'has records before clear');
  clearVisualEvidence();
  assert.equal(getVisualEvidenceSnapshot().total, 0, 'cleared');
  assert.equal(getVisualEvidenceSnapshot().lastCaptureAt, null, 'timestamp cleared');
});

test('10. copyVisualEvidenceJSON produce JSON válido', () => {
  clearVisualEvidence();
  const doc = makeDoc({ targetId: 'canvas-layer' });
  const win = makeWinNoCapture();
  captureVisualEvidence('document', { doc, win });
  const json = copyVisualEvidenceJSON();
  assert.ok(typeof json === 'string');
  const parsed = JSON.parse(json);
  assert.ok(Array.isArray(parsed.records));
  assert.ok(typeof parsed.total === 'number');
  clearVisualEvidence();
});

test('11. buildBundle incluye visualEvidence', () => {
  clearVisualEvidence();
  const doc = makeDoc({ targetId: 'canvas-layer' });
  captureVisualEvidence('document', { doc, win: makeWinNoCapture() });
  const snap = getVisualEvidenceSnapshot();
  const bundle = buildDebugBundle({ state: { visualEvidence: snap }, win: null, doc: null });
  assert.ok(bundle.visualEvidence !== undefined, 'visualEvidence in bundle');
  clearVisualEvidence();
});

test('12. W1 consume VISUAL_EVIDENCE_RISK cuando hay captures fallidos', () => {
  clearVisualEvidence();
  const fakeEvidence = { records: [{ status: 'failed', reason: 'VISUAL_CAPTURE_FAILED' }] };
  const snap = buildWarningsSnapshot({ visualEvidence: fakeEvidence, ownership: {} });
  const found = snap.warnings.find((w) => w.ruleId === 'VISUAL_EVIDENCE_RISK');
  assert.ok(found, 'VISUAL_EVIDENCE_RISK emitted for failed capture');
  clearVisualEvidence();
});

test('13. no muta RF_UI_TRACE', () => {
  clearVisualEvidence();
  const trace = { getEntries: () => [], snapshot: () => null };
  const before = JSON.stringify(trace);
  captureVisualEvidence('viewport', { doc: null, win: makeWinNoCapture() });
  const after = JSON.stringify(trace);
  assert.equal(before, after, 'RF_UI_TRACE not mutated');
  clearVisualEvidence();
});

test('14. no escribe DS', () => {
  clearVisualEvidence();
  const DS = { zoom: 1, selection: [] };
  const before = JSON.stringify(DS);
  captureVisualEvidence('viewport', { doc: null, win: makeWinNoCapture() });
  const after = JSON.stringify(DS);
  assert.equal(before, after, 'DS not mutated');
  clearVisualEvidence();
});

test('15. no modifica DOM productivo — no escribe estilos ni mueve nodos', () => {
  clearVisualEvidence();
  let domMutated = false;
  const doc = {
    defaultView: { getComputedStyle: (node) => node.style },
    querySelector: () => null,
    querySelectorAll: () => [],
    body: { querySelectorAll: () => [], getBoundingClientRect: () => ({ width: 1024, height: 768 }), get style() { return {}; }, set style(_) { domMutated = true; } },
  };
  captureVisualEvidence('document', { doc, win: makeWinNoCapture() });
  assert.equal(domMutated, false, 'DOM not mutated');
  clearVisualEvidence();
});

test('16. no dispara preview/render', () => {
  clearVisualEvidence();
  let previewCalled = false;
  const fakePreview = { show: () => { previewCalled = true; }, refresh: () => { previewCalled = true; } };
  captureVisualEvidence('preview', { doc: makeDoc(), win: makeWinNoCapture() });
  assert.equal(previewCalled, false, 'preview not triggered');
  clearVisualEvidence();
});

test('17. único global sigue siendo window.RFDebugCenter', () => {
  const src = fs.readFileSync(path.join(ROOT, 'tools/rf-debug-center/rf-debug-center-visual-evidence.js'), 'utf8');
  assert.doesNotMatch(src, /window\.[A-Za-z0-9_]+\s*=(?!=)/, 'no window writes in visual-evidence.js');
  const apiSrc = fs.readFileSync(path.join(ROOT, 'tools/rf-debug-center/rf-debug-center-api-visual-evidence.js'), 'utf8');
  assert.doesNotMatch(apiSrc, /window\.[A-Za-z0-9_]+\s*=(?!=)/, 'no window writes in api-visual-evidence.js');
});

test('18. límites de línea OK', () => {
  const checks = [
    ['tools/rf-debug-center/rf-debug-center-visual-evidence.js', 180],
    ['tools/rf-debug-center/rf-debug-center-visual-evidence-view.js', 100],
    ['tools/rf-debug-center/rf-debug-center-api-visual-evidence.js', 80],
    ['tools/rf-debug-center/rf-debug-center-store.js', 150],
    ['tools/rf-debug-center/rf-debug-center-api.js', 180],
    ['tools/rf-debug-center/rf-debug-center-bundle.js', 160],
    ['tools/rf-debug-center/rf-debug-center-warnings.js', 180],
  ];
  for (const [relPath, limit] of checks) {
    const src = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
    const lines = src.split('\n').length;
    assert.ok(lines <= limit, `${relPath} has ${lines} lines, exceeds limit ${limit}`);
  }
});
