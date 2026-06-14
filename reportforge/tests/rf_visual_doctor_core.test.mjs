import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildVisualBaseline,
  diffVisualBaseline,
} from '../../tools/rf-debug-center/visual-doctor/visual_baseline_diff.js';
import {
  buildBaselineDownloadPayload,
  validateVisualBaselineShape,
} from '../../tools/rf-debug-center/visual-doctor/visual_baseline_io.js';
import {
  buildVisualForensicBundle,
  serializeVisualForensicBundle,
} from '../../tools/rf-debug-center/visual-doctor/visual_forensic_bundle.js';
import {
  buildSafeCssSimulationPlan,
} from '../../tools/rf-debug-center/visual-doctor/visual_fix_simulator.js';
import {
  buildVisualLabArtifact,
  sanitizeVisualLabArtifact,
} from '../../tools/rf-debug-center/visual-doctor/visual_lab_artifact_contract.js';
import {
  VISUAL_COMPONENT_CATALOG,
} from '../../tools/rf-debug-center/visual-doctor/visual_component_catalog.js';

test('rf visual doctor component catalog is RF-specific', () => {
  assert.ok(VISUAL_COMPONENT_CATALOG.length >= 5);
  assert.ok(VISUAL_COMPONENT_CATALOG.some((item) => item.id === 'rf-canvas'));
  assert.equal(
    VISUAL_COMPONENT_CATALOG.some((item) => JSON.stringify(item).includes(['SA', 'P'].join(''))),
    false
  );
});

test('rf visual baseline export payload validates and detects changed geometry', () => {
  const before = [{
    selector: '#canvas-area',
    id: 'canvas',
    rect: { x: 0, y: 0, width: 100, height: 100 },
    styles: { display: 'block', overflow: 'visible' },
    interactive: true,
  }];

  const after = [{
    selector: '#canvas-area',
    id: 'canvas',
    rect: { x: 0, y: 0, width: 50, height: 100 },
    styles: { display: 'block', overflow: 'hidden' },
    interactive: true,
  }];

  const baseline = buildVisualBaseline(before, {
    generatedAt: '2026-01-01T00:00:00.000Z',
  });

  const payload = buildBaselineDownloadPayload(baseline, {
    source: 'rf-debug-center',
    createdAt: '2026-01-01T00:00:00.000Z',
  });

  const validation = validateVisualBaselineShape(payload.baseline || payload);
  const normalizedBaseline = validation.baseline || payload.baseline || payload;
  const diff = diffVisualBaseline(normalizedBaseline, after);

  assert.equal(validation.valid, true);
  assert.equal(normalizedBaseline.schema, 'rf-debug-visual-baseline/v1');
  assert.ok(diff.findings.length >= 1);
  assert.equal(JSON.stringify(diff).includes('data:image'), false);
  assert.equal(JSON.stringify(diff).includes('base64'), false);
});

test('rf visual forensic bundle strips unsafe image payloads and preserves evidence chain', () => {
  const bundle = buildVisualForensicBundle(
    {
      id: 'rf-case',
      diagnosticId: 'rf-case',
      type: 'RF_VISUAL_CASE',
      image: 'data:image/png;base64,AAA',
      evidence: { selector: '#canvas-area' },
    },
    { owner: 'rf-canvas' },
    [{ label: 'why', value: 'geometry changed' }],
    { generatedAt: '2026-01-01T00:00:00.000Z' }
  );

  const serialized = serializeVisualForensicBundle(bundle);
  const parsed = JSON.parse(serialized);

  assert.equal(serialized.includes('data:image'), false);
  assert.equal(serialized.includes('base64'), false);
  assert.equal(parsed.probableOwner.owner, 'rf-canvas');
  assert.deepEqual(parsed.whyChain, [{ label: 'why', value: 'geometry changed' }]);
});

test('rf visual fix simulator is runtime-only and rollback-required', () => {
  const plan = buildSafeCssSimulationPlan(
    { affectedElement: '#canvas-area' },
    { expectedHeight: 120 },
    { cssText: '#canvas-area{min-height:120px}' }
  );

  assert.equal(plan.safety.runtimeOnly, true);
  assert.equal(plan.safety.writesFiles, false);
  assert.equal(plan.safety.rollbackRequired, true);
  assert.equal(plan.safety.autopatch, false);
});

test('rf visual lab artifact never embeds screenshots', () => {
  const artifact = buildVisualLabArtifact({
    diagnosticId: 'rf-lab',
    selector: '#canvas-area',
    captures: [{
      selector: '#canvas-area',
      browserName: 'chrome-official',
      phase: 'before',
      cropHash: 'sha256:abc',
      screenshotRef: 'artifact://rf-visual-lab/chrome/before',
    }],
  });

  const clean = sanitizeVisualLabArtifact(artifact);
  assert.equal(clean.safety.embedsImage, false);
  assert.equal(JSON.stringify(clean).includes('data:image'), false);
  assert.equal(JSON.stringify(clean).includes('base64'), false);
});
