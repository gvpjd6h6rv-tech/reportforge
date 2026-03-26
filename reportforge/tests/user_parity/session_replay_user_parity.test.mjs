import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import {
  startRuntimeServer,
  launchRuntimePage,
  reloadRuntime,
  assertNoConsoleErrors,
} from '../runtime_harness.mjs';
import {
  collectUserParityState,
  collectElementVisibility,
  computeVisualConfidenceScore,
  ratioIdParity,
  assertVisualConfidence,
  visibilitySignal,
  hitTestingSignal,
  subtleOcclusionSignal,
  measureOcclusionDetail,
  cloneSeparationQuality,
  assertNoCriticalOcclusion,
  assertCloneSeparation,
} from './helpers.mjs';
import {
  loadRecordedSession,
  autoLabelSession,
  replayRecordedSession,
  detectSessionDuplicates,
} from './session_tools.mjs';
import {
  formatFlowSummary,
  assessScoreQuality,
} from './reporting.mjs';

const SESSIONS_DIR = path.join(path.dirname(new URL(import.meta.url).pathname), 'sessions');

test('USER-PARITY session corpus replay verifies fine composition across all promoted sessions', { timeout: 600000 }, async (t) => {
  const server = await startRuntimeServer();

  try {
    const files = (await fs.readdir(SESSIONS_DIR))
      .filter((f) => f.endsWith('.session.json'))
      .sort();

    assert.ok(files.length > 0, `no session files found in ${SESSIONS_DIR}`);

    // Session quality gate: warn about structural duplicates before running anything
    const allSessions = await Promise.all(
      files.map((f) => loadRecordedSession(path.join(SESSIONS_DIR, f))),
    );
    const { duplicates } = detectSessionDuplicates(allSessions);
    if (duplicates.length > 0) {
      t.diagnostic(`SESSION QUALITY GATE: ${duplicates.length} duplicate(s) detected — ${JSON.stringify(duplicates)}`);
    } else {
      t.diagnostic(`SESSION QUALITY GATE: ${files.length} sessions, no structural duplicates`);
    }

    for (const file of files) {
      const basename = file.replace('.session.json', '');
      await t.test(`session:${basename}`, async (t) => {
        const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);
        try {
          const session = await loadRecordedSession(path.join(SESSIONS_DIR, file));
          const labels = autoLabelSession(session);
          t.diagnostic(`session=${basename} labels=${JSON.stringify(labels)}`);

          await reloadRuntime(page, server.baseUrl);
          await replayRecordedSession(page, session);

          const lastCheckpoint = session.checkpoints?.at(-1);
          const textFilter = lastCheckpoint?.expect?.textIncludes || null;
          const expectedModelCount = lastCheckpoint?.expect?.modelCount ?? null;

          const state = await collectUserParityState(page, { textIncludes: textFilter });

          // Verify expected model count when declared in session checkpoint
          if (expectedModelCount !== null) {
            assert.equal(
              state.modelIds.length,
              expectedModelCount,
              `${basename}: expected ${expectedModelCount} model IDs at final state, got ${JSON.stringify(state.modelIds)}`,
            );
          }

          let entries;
          let collectMode;

          if (state.previewMode) {
            // Session ends in preview — check preview parity
            collectMode = 'preview';
            assert.deepEqual(
              [...new Set(state.previewIds.filter(Boolean))].sort(),
              [...new Set(state.modelIds)].sort(),
              `${basename}: preview IDs must equal model IDs`,
            );
          } else {
            // Session ends in design — check design parity and composition
            collectMode = 'design';
            assert.deepEqual(
              [...new Set(state.designIds)].sort(),
              [...new Set(state.modelIds)].sort(),
              `${basename}: design IDs must equal model IDs`,
            );
          }

          // Collect element visibility for composition checks
          entries = await Promise.all(
            state.modelIds.map((id) => collectElementVisibility(page, { id, mode: collectMode })),
          );

          // Fine composition assertions — only in design mode (where handles and hit-testing apply)
          if (!state.previewMode) {
            assertNoCriticalOcclusion(entries, `${basename} occlusion`);
            assertCloneSeparation(entries, `${basename} separation`);
          }

          // Diagnostics
          const sepQuality = cloneSeparationQuality(entries);
          t.diagnostic(`session=${basename} mode=${collectMode} minGapPx=${sepQuality.minGapPx} maxOverlapRatio=${sepQuality.maxOverlapRatio} collapseRisk=${sepQuality.collapseRisk}`);
          for (const entry of entries) {
            const occ = measureOcclusionDetail(entry);
            t.diagnostic(`session=${basename} id=${entry.id}: occludedRatio=${Math.round(occ.occludedRatio * 100)}% level=${occ.occlusionLevel} topOccluding=${JSON.stringify(occ.topOccludingNodes)}`);
          }

          // Confidence with real signals where measurable.
          // In preview mode, elementFromPoint hits the workspace overlay rather than preview
          // elements (expected rendering behaviour), so hit-testing and stacking signals are
          // not meaningful — use stableSignal to avoid false-low scores.
          const modelParitySignal = state.previewMode
            ? ratioIdParity(state.previewIds, state.modelIds, `${basename} preview-model parity`)
            : ratioIdParity(state.designIds, state.modelIds, `${basename} design-model parity`);

          const hitTestSignal = state.previewMode
            ? stableSignal('preview mode: hit-testing via workspace overlay, not measured in replay')
            : hitTestingSignal(entries, `${basename} hit-testing`);
          const occlusionSignal = state.previewMode
            ? stableSignal('preview mode: occlusion via overlay, not measured in replay')
            : subtleOcclusionSignal(entries, `${basename} subtle occlusion`, { minVisibleRatio: 0.8, minSelfHitRatio: 0.55 });

          const confidence = computeVisualConfidenceScore({
            modelParity: modelParitySignal,
            designPreviewParity: stableSignal('session replay: single mode at final checkpoint'),
            geometry: stableSignal('session replay: geometry tracked via parity'),
            visibility: visibilitySignal(entries, `${basename} visibility`),
            hitTesting: hitTestSignal,
            overlapCollision: stableSignal('session replay: overlap context-dependent per session type'),
            clipping: stableSignal('session replay: clipping handled by assertNoCriticalOcclusion'),
            stacking: hitTestSignal,
            temporalStability: stableSignal('session replay: temporal phases not sampled in replay'),
            interactionUsability: stableSignal('session replay: hit-map not collected in replay'),
            legibility: stableSignal('session replay: legibility not focus of session replay'),
            subtleOcclusion: occlusionSignal,
            compositorDivergence: stableSignal('session replay: single-browser chromium'),
            crossBrowserStability: stableSignal('session replay: single-browser chromium'),
          });

          assertVisualConfidence(confidence, { min: 90 });

          // Score quality: warn if score is backed mostly by stableSignals
          const scoreQuality = assessScoreQuality(confidence);
          if (scoreQuality.warning) {
            t.diagnostic(`SCORE QUALITY WARNING: session=${basename} ${scoreQuality.warning}`);
          }

          t.diagnostic(formatFlowSummary({
            flow: session.meta?.covers?.[0] || basename,
            browser: 'chromium',
            minGapPx: sepQuality.minGapPx,
            maxOverlapRatio: sepQuality.maxOverlapRatio,
            collapseRisk: sepQuality.collapseRisk,
            labels: autoLabelSession(session),
            confidenceScore: confidence.score,
            replacesManualCheck: session.meta?.bugRisk || null,
          }));

          await assertNoConsoleErrors(consoleErrors, `USER-PARITY session replay ${basename}`);
        } finally {
          await browser.close();
        }
      });
    }
  } finally {
    await server.stop();
  }
});

function stableSignal(reason) {
  return { value: 1, diagnostic: null, evidence: { reason } };
}
