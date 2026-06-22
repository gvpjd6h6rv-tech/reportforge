'use strict';
/**
 * orphan_test_target_guard.test.mjs — P29B guard #2, formalized P31B
 *
 * "no tests contra archivos huerfanos si produccion usa otro owner" —
 * a test that loads engines/X.js via fs.readFileSync should target a file
 * production actually loads. If X.js is never reachable from any designer
 * HTML, the test may be exercising a zombie implementation instead of the
 * real owner (the exact P19C/P21A failure mode of this campaign: testing
 * AlignmentEngine.js while the real, loaded logic lived in
 * CommandRuntimeSelection.js).
 *
 * P31B closed every previously-open finding from this guard:
 *   - KeyboardRegistry.js, KeyboardCombo.js, SnapCore.js, SnapState.js were
 *     confirmed zombies (P30A/P31A) and retired (deleted) — they no longer
 *     appear at all, reviewed or not.
 *   - ClipboardState.js, DragState.js (legitimate fallbacks) and
 *     RuntimeWriteLog.js (decided test-only by design) are now formal,
 *     reviewed ENFORCED_EXCEPTIONS — listed separately from unreviewed WARNs
 *     so a genuinely new zombie can never hide among them.
 *
 * The guard still always exits 0 (WARNING-only character preserved), but
 * "0 unreviewed findings" is now a property the integration test below
 * actually asserts, not just prose in a JSON note.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  collectHtmlScriptSrcs,
  collectTestTargetFiles,
  findOrphanTestTargets,
  ENFORCED_EXCEPTIONS,
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

// ── P30B: false-positive fix (comment-only mentions must not count) ────────

test('collectTestTargetFiles — a // line comment mentioning engines/X.js is NOT a real target (P30B root cause)', () => {
  const sources = {
    'migration_note.test.mjs': `// Migrated in P15E from engines/RuntimeGeometry.js to engines/RuntimeGlobals.js\nconst x = 1;`,
  };
  const targets = collectTestTargetFiles(sources);
  assert.equal(targets.has('RuntimeGeometry.js'), false);
  assert.equal(targets.has('RuntimeGlobals.js'), false);
});

test('collectTestTargetFiles — a /* block comment */ mentioning engines/X.js is NOT a real target', () => {
  const sources = {
    'migration_note.test.mjs': `/**\n * Migrated in P17D from engines/AlignmentGeometry.js to engines/AlignmentEngine.js\n */\nconst x = 1;`,
  };
  const targets = collectTestTargetFiles(sources);
  assert.equal(targets.has('AlignmentGeometry.js'), false);
  assert.equal(targets.has('AlignmentEngine.js'), false);
});

test('collectTestTargetFiles — still catches a real readFileSync(resolve(ROOT, ...)) load alongside an unrelated comment', () => {
  const sources = {
    'mixed.test.mjs': `// historical note: engines/Retired.js is gone\nconst src = fs.readFileSync(resolve(ROOT, 'engines/Real.js'), 'utf8');`,
  };
  const targets = collectTestTargetFiles(sources);
  assert.equal(targets.has('Retired.js'), false);
  assert.deepEqual([...targets.get('Real.js')], ['mixed.test.mjs']);
});

test('collectTestTargetFiles — still catches require(...) and template-literal dynamic import(...) loads', () => {
  const sources = {
    'require.test.mjs': `const X = require('../../engines/Foo.js');`,
    'dynamic.test.mjs': "const { X } = await import(`\${ROOT}/engines/Bar.js`);",
  };
  const targets = collectTestTargetFiles(sources);
  assert.deepEqual([...targets.get('Foo.js')], ['require.test.mjs']);
  assert.deepEqual([...targets.get('Bar.js')], ['dynamic.test.mjs']);
});

test('findOrphanTestTargets — flags an unreviewed test target never loaded by HTML', () => {
  const targets = new Map([
    ['A.js', new Set(['foo.test.mjs'])],
    ['B.js', new Set(['bar.test.mjs'])],
  ]);
  const loaded = new Set(['A.js']);
  const { enforced, unreviewed } = findOrphanTestTargets(targets, loaded);
  assert.deepEqual(enforced, []);
  assert.deepEqual(unreviewed, [{ file: 'B.js', testFiles: ['bar.test.mjs'] }]);
});

test('findOrphanTestTargets — a target loaded by HTML is never flagged in either list', () => {
  const targets = new Map([['A.js', new Set(['foo.test.mjs'])]]);
  const loaded = new Set(['A.js']);
  const { enforced, unreviewed } = findOrphanTestTargets(targets, loaded);
  assert.deepEqual(enforced, []);
  assert.deepEqual(unreviewed, []);
});

test('findOrphanTestTargets — empty targets produce no orphans in either list', () => {
  const { enforced, unreviewed } = findOrphanTestTargets(new Map(), new Set());
  assert.deepEqual(enforced, []);
  assert.deepEqual(unreviewed, []);
});

// ── ENFORCED_EXCEPTIONS allowlist (P31B) ────────────────────────────────────

test('findOrphanTestTargets — separates enforced exceptions from unreviewed warnings', () => {
  const targets = new Map([
    ['ClipboardState.js', new Set(['some.test.mjs'])],
    ['TrulyNewZombie.js', new Set(['other.test.mjs'])],
  ]);
  const loaded = new Set();
  const { enforced, unreviewed } = findOrphanTestTargets(targets, loaded);
  assert.deepEqual(enforced.map((o) => o.file), ['ClipboardState.js']);
  assert.deepEqual(unreviewed.map((o) => o.file), ['TrulyNewZombie.js']);
});

test('ENFORCED_EXCEPTIONS — exactly the 3 reviewed P31B exceptions, each with a justification', () => {
  assert.deepEqual([...ENFORCED_EXCEPTIONS.keys()].sort(), [
    'ClipboardState.js',
    'DragState.js',
    'RuntimeWriteLog.js',
  ]);
  for (const reason of ENFORCED_EXCEPTIONS.values()) {
    assert.ok(typeof reason === 'string' && reason.length > 0);
  }
});

// ── integration: real repo data ──────────────────────────────────────────

test('REAL REPO — 0 unreviewed orphan test targets after P31B closure', () => {
  const output = execFileSync('node', ['audit/orphan_test_target_guard.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  // ClipboardState.js, DragState.js, RuntimeWriteLog.js are still never
  // loaded by any designer/*.html — but they are now formally reviewed,
  // enforced exceptions (P31B), not open findings.
  assert.match(output, /ENFORCED EXCEPTION/);
  assert.match(output, /ClipboardState\.js/);
  assert.match(output, /DragState\.js/);
  assert.match(output, /RuntimeWriteLog\.js/);
  // KeyboardRegistry.js / KeyboardCombo.js / SnapCore.js / SnapState.js were
  // retired (deleted) in P31B — they must not appear at all, not even as a
  // reviewed exception, because there is nothing left to review.
  assert.doesNotMatch(output, /KeyboardRegistry\.js/);
  assert.doesNotMatch(output, /KeyboardCombo\.js/);
  assert.doesNotMatch(output, /SnapCore\.js/);
  assert.doesNotMatch(output, /SnapState\.js/);
  // RuntimeGeometry.js / AlignmentGeometry.js were P30A/B-confirmed comment-
  // only false positives — must still not appear (regression guard).
  assert.doesNotMatch(output, /RuntimeGeometry\.js/);
  assert.doesNotMatch(output, /AlignmentGeometry\.js/);
  // The headline claim of P31B: zero unreviewed findings remain.
  assert.match(output, /0 unreviewed/);
});
