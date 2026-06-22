'use strict';
/**
 * orphan_test_target_guard.test.mjs — P29B guard #2
 *
 * "no tests contra archivos huerfanos si produccion usa otro owner" —
 * a test that loads engines/X.js via fs.readFileSync should target a file
 * production actually loads. If X.js is never reachable from any designer
 * HTML, the test may be exercising a zombie implementation instead of the
 * real owner (the exact P19C/P21A failure mode of this campaign: testing
 * AlignmentEngine.js while the real, loaded logic lived in
 * CommandRuntimeSelection.js).
 *
 * This is a WARNING-only guard (exit 0 even with findings) because some
 * orphan test targets are legitimate documented fallbacks (e.g.
 * ClipboardState.js is tested as ClipboardEngine's fallback dependency, not
 * as a standalone zombie) — the guard surfaces candidates for human review,
 * it does not auto-classify intent.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  collectHtmlScriptSrcs,
  collectTestTargetFiles,
  findOrphanTestTargets,
} from '../../audit/orphan_test_target_guard.mjs';

// ── pure-function unit tests ────────────────────────────────────────────────

test('collectHtmlScriptSrcs — extracts /engines/X.js script src filenames', () => {
  const html = `<script src="/engines/A.js"></script><script src="/engines/B.js"></script>`;
  assert.deepEqual([...collectHtmlScriptSrcs([html])].sort(), ['A.js', 'B.js']);
});

test('collectTestTargetFiles — maps each referenced engines/X.js to the test file(s) that reference it', () => {
  const sources = {
    'foo.test.mjs': `readFileSync(resolve(ROOT, 'engines/A.js'))`,
    'bar.test.mjs': `readFileSync(resolve(ROOT, 'engines/A.js'))\nreadFileSync(resolve(ROOT, 'engines/B.js'))`,
  };
  const targets = collectTestTargetFiles(sources);
  assert.deepEqual([...targets.get('A.js')].sort(), ['bar.test.mjs', 'foo.test.mjs']);
  assert.deepEqual([...targets.get('B.js')], ['bar.test.mjs']);
});

test('findOrphanTestTargets — flags a test target never loaded by HTML', () => {
  const targets = new Map([
    ['A.js', new Set(['foo.test.mjs'])],
    ['B.js', new Set(['bar.test.mjs'])],
  ]);
  const loaded = new Set(['A.js']);
  const orphans = findOrphanTestTargets(targets, loaded);
  assert.deepEqual(orphans, [{ file: 'B.js', testFiles: ['bar.test.mjs'] }]);
});

test('findOrphanTestTargets — a target loaded by HTML is never flagged', () => {
  const targets = new Map([['A.js', new Set(['foo.test.mjs'])]]);
  const loaded = new Set(['A.js']);
  assert.deepEqual(findOrphanTestTargets(targets, loaded), []);
});

test('findOrphanTestTargets — empty targets produce no orphans', () => {
  assert.deepEqual(findOrphanTestTargets(new Map(), new Set()), []);
});

// ── integration: real repo data ──────────────────────────────────────────

test('REAL REPO — guard exits 0 (warning-only) and lists real orphan test targets', () => {
  const output = execFileSync('node', ['audit/orphan_test_target_guard.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  // RuntimeWriteLog.js, SnapCore.js, SnapState.js, KeyboardRegistry.js,
  // DragState.js, RuntimeGeometry.js, AlignmentGeometry.js, ClipboardState.js
  // are confirmed (via exhaustive <script> enumeration across all 4
  // designer/*.html files) to never be loaded by any production HTML, yet
  // are tested directly. This is the guard's real first catch.
  assert.match(output, /RuntimeWriteLog\.js/);
  assert.match(output, /SnapCore\.js/);
  assert.match(output, /ClipboardState\.js/);
});
