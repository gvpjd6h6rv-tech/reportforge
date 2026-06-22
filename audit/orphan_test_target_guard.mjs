#!/usr/bin/env node
/**
 * audit/orphan_test_target_guard.mjs — Orphan test target gate (P29B #2)
 *
 * "no tests contra archivos huerfanos si produccion usa otro owner" — a test
 * that loads engines/X.js (via fs.readFileSync) should target a file
 * production actually loads. If X.js is never reachable from any
 * designer/*.html <script src="...">, the test may be exercising a zombie
 * implementation instead of the real owner — the exact failure mode this
 * campaign hit with AlignmentEngine.js (P21A: real logic lived in
 * CommandRuntimeSelection.js instead) and almost hit with TestRunnerUI.js
 * (P19C: a different directory than the one being audited).
 *
 * P31B: every file this guard ever flagged is now formally closed.
 * KeyboardRegistry.js/KeyboardCombo.js/SnapCore.js/SnapState.js were
 * confirmed zombies and retired (deleted) — they cannot appear here again.
 * ClipboardState.js, DragState.js, and RuntimeWriteLog.js are legitimate,
 * reviewed, permanent exceptions (ENFORCED_EXCEPTIONS below) — they are
 * never loaded by production HTML by design, not by oversight. They are
 * reported separately from genuinely unreviewed findings so a future zombie
 * can never hide among them.
 *
 * Still WARNING-only by design (always exits 0): this guard surfaces
 * candidates for human review, it does not auto-classify intent on its own
 * — ENFORCED_EXCEPTIONS is the explicit record of intent once a human has
 * reviewed a finding.
 *
 * Usage:
 *   node audit/orphan_test_target_guard.mjs
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SEP  = '─'.repeat(70);

// Files confirmed (P23A/P25C/P31A/P31B) to be legitimate, permanent
// production-unreachable test targets — reviewed, not forgotten. Adding to
// this list is a deliberate architectural decision, not a way to silence a
// new, unreviewed finding: every entry must cite the audit that reviewed it.
export const ENFORCED_EXCEPTIONS = new Map([
  ['ClipboardState.js', 'P23A/P31A: fallback dependency of ClipboardEngine.js (typeof ClipboardState !== "undefined" ? ClipboardState : inline closure), confirmed identical API. Never loaded in production by design; the inline closure is the real implementation.'],
  ['DragState.js', 'P31A: fallback dependency of DragEngine.js (typeof DragState !== "undefined" ? DragState : inline closure), confirmed identical API. Never loaded in production by design; the inline closure is the real implementation.'],
  ['RuntimeWriteLog.js', 'P31B (SS-21): decided test-only by design. Activating write-log governance in production would be a first-ever exercise of every DS-mutation path with no observed governance failure motivating that risk. Revisit by adding a real <script> tag in designer-v4.html if that decision changes.'],
]);

// ── pure logic (exported for unit tests) ────────────────────────────────────

export function collectHtmlScriptSrcs(htmlSources) {
  const set = new Set();
  const re = /<script\s+src="\/engines\/([^"]+)"/g;
  for (const html of htmlSources) {
    let m;
    while ((m = re.exec(html))) set.add(m[1]);
  }
  return set;
}

// Strips // line comments and /* */ block comments before scanning for
// engine-file references (P30B). Root cause this fixes: RuntimeGeometry.js
// and AlignmentGeometry.js were flagged as orphan test targets solely
// because of migration-history comments like "Migrated in P15E from
// engines/RuntimeGeometry.js to engines/RuntimeGlobals.js" — bare text
// mentions, never an actual readFileSync/require/import call. Neither file
// exists on disk at all; they were retired in P15E/P17D per those same
// comments. A `//`/`/* */` mention is documentation, not evidence of use.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/([^:])\/\/.*$/gm, '$1'); // trailing // comments; ([^:]) avoids eating "http://"
}

// Requires the engines/X.js reference to sit inside an actual quoted string
// literal (single, double, or template-literal backtick) — the shape every
// real loader in this repo uses: readFileSync('engines/X.js', ...),
// readFileSync(resolve(ROOT, 'engines/X.js')), require('../../engines/X.js'),
// or await import(`${ROOT}/engines/X.js`). A bare comment mention is never
// inside a string literal, so this is a second, independent layer of
// protection beyond stripComments() — neither layer alone is assumed
// sufficient.
const QUOTED_ENGINE_FILE_RE = /['"`][^'"`]*?engines\/([A-Za-z0-9_.-]+\.js)['"`]/g;

/**
 * sources: { [testFileName]: testFileContent }
 * returns: Map<engineFileName, Set<testFileName>>
 */
export function collectTestTargetFiles(sources) {
  const targets = new Map();
  for (const [testFile, src] of Object.entries(sources)) {
    const clean = stripComments(src);
    let m;
    const re = new RegExp(QUOTED_ENGINE_FILE_RE);
    while ((m = re.exec(clean))) {
      const engineFile = m[1];
      if (!targets.has(engineFile)) targets.set(engineFile, new Set());
      targets.get(engineFile).add(testFile);
    }
  }
  return targets;
}

/**
 * Splits orphan test targets into `enforced` (in ENFORCED_EXCEPTIONS — a
 * reviewed, intentional exception) and `unreviewed` (a genuinely new
 * finding requiring human classification). Both are sorted by file name.
 */
export function findOrphanTestTargets(targets, loadedByHtml) {
  const enforced = [];
  const unreviewed = [];
  for (const [file, testFiles] of targets.entries()) {
    if (loadedByHtml.has(file)) continue;
    const entry = { file, testFiles: [...testFiles].sort() };
    if (ENFORCED_EXCEPTIONS.has(file)) enforced.push(entry);
    else unreviewed.push(entry);
  }
  const byFile = (a, b) => a.file.localeCompare(b.file);
  return { enforced: enforced.sort(byFile), unreviewed: unreviewed.sort(byFile) };
}

// ── CLI ──────────────────────────────────────────────────────────────────

function main() {
  const htmlDir = join(ROOT, 'designer');
  const htmlFiles = readdirSync(htmlDir).filter((f) => extname(f) === '.html');
  const htmlSources = htmlFiles.map((f) => readFileSync(join(htmlDir, f), 'utf8'));
  const loadedByHtml = collectHtmlScriptSrcs(htmlSources);

  // Excludes meta-test files that use synthetic placeholder paths like
  // 'engines/A.js' / 'engines/Missing.js' / '/repo/engines/X.js' in unit-test
  // fixtures to test guard/metric logic itself, not real engine source —
  // those literals would otherwise be indistinguishable from a genuine test
  // target (same class of self-reference contamination, recurring since P30B).
  const SELF_TESTS = new Set([
    'orphan_test_target_guard.test.mjs',
    'ssot_runtime_binding_guard.test.mjs',
    'subsystem_ownership_guard_rule_exist.test.mjs',
    'salad_score_metric_file_type.test.mjs',
    'salad_score_template_dashboard.test.mjs',
  ]);
  const testsDir = join(ROOT, 'reportforge/tests');
  const testFiles = readdirSync(testsDir).filter((f) => f.endsWith('.test.mjs') && !SELF_TESTS.has(f));
  const sources = {};
  for (const f of testFiles) sources[f] = readFileSync(join(testsDir, f), 'utf8');
  const targets = collectTestTargetFiles(sources);

  const { enforced, unreviewed } = findOrphanTestTargets(targets, loadedByHtml);

  console.log(`\n${SEP}`);
  console.log('🧪  Orphan Test Target Guard');
  console.log(`    designer/*.html loaded: ${loadedByHtml.size}  |  engine files tested: ${targets.size}`);
  console.log(SEP);

  if (enforced.length > 0) {
    console.log(`\n✅  ENFORCED EXCEPTION (${enforced.length}, reviewed — not open findings):\n`);
    for (const o of enforced) {
      console.log(`  ✅  engines/${o.file} — tested by: ${o.testFiles.join(', ')}`);
      console.log(`      reason: ${ENFORCED_EXCEPTIONS.get(o.file)}\n`);
    }
  }

  if (unreviewed.length > 0) {
    console.log(`⚠   WARN — ${unreviewed.length} unreviewed test target(s) never loaded by any designer/*.html\n`);
    for (const o of unreviewed) {
      console.log(`  ⚠   engines/${o.file} — tested by: ${o.testFiles.join(', ')}`);
    }
    console.log('\n   Review each: legitimate documented fallback (add to ENFORCED_EXCEPTIONS) vs. zombie under test instead of the real owner (retarget or retire the test).\n');
  } else {
    console.log('\n✅  0 unreviewed orphan test targets.\n');
  }
}

const isMain = process.argv[1] && process.argv[1].endsWith('orphan_test_target_guard.mjs');
if (isMain) main();
