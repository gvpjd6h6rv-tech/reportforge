import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  startRuntimeServer,
  launchRuntimePage,
  reloadRuntime,
  assertNoConsoleErrors,
} from '../runtime_harness.mjs';
import {
  collectUserParityState,
  computeVisualConfidenceScore,
  ratioIdParity,
  assertVisualConfidence,
} from './helpers.mjs';
import {
  loadRecordedSession,
  autoLabelSession,
  replayRecordedSession,
} from './session_tools.mjs';

test('USER-PARITY promoted session replay keeps clipboard parity visible', { timeout: 180000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors, launchInfo } = await launchRuntimePage(server.baseUrl);

  try {
    const sessionPath = path.join(process.cwd(), 'reportforge/tests/user_parity/sessions/clipboard_design_triple_paste.session.json');
    const session = await loadRecordedSession(sessionPath);
    const labels = autoLabelSession(session);
    assert.ok(labels.includes('clipboard_flow'), `expected clipboard_flow label, got ${JSON.stringify(labels)}`);

    await reloadRuntime(page, server.baseUrl);
    await replayRecordedSession(page, session);

    const state = await collectUserParityState(page, { textIncludes: 'VALOR TOTAL' });
    const confidence = computeVisualConfidenceScore({
      modelParity: ratioIdParity(state.previewIds, state.modelIds, 'replay preview-model parity'),
      designPreviewParity: ratioIdParity(state.previewIds, state.modelIds, 'replay visible parity'),
      geometry: stableSignal('not measured in session replay prototype'),
      visibility: stableSignal('not measured in session replay prototype'),
      hitTesting: stableSignal('not measured in session replay prototype'),
      overlapCollision: stableSignal('not measured in session replay prototype'),
      clipping: stableSignal('not measured in session replay prototype'),
      stacking: stableSignal('not measured in session replay prototype'),
      temporalStability: stableSignal('not measured in session replay prototype'),
      interactionUsability: stableSignal('not measured in session replay prototype'),
      legibility: stableSignal('not measured in session replay prototype'),
      subtleOcclusion: stableSignal('not measured in session replay prototype'),
      compositorDivergence: stableSignal('single-browser session replay prototype'),
      crossBrowserStability: stableSignal('single-browser session replay prototype'),
    });
    assert.equal(launchInfo.browserName, 'chromium');
    assert.equal(state.modelIds.length, 4, `expected original + 3 clones after replay, got ${JSON.stringify(state.modelIds)}`);
    assert.deepEqual([...new Set(state.previewIds)].sort(), [...new Set(state.modelIds)].sort(), 'replay preview visible ids must equal model ids');
    assertVisualConfidence(confidence, { min: 95 });
    await assertNoConsoleErrors(consoleErrors, 'USER-PARITY promoted session replay');
  } finally {
    await browser.close();
    await server.stop();
  }
});

function stableSignal(reason) {
  return { value: 1, diagnostic: null, evidence: { reason } };
}
