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
 * WARNING-only by design: some orphan test targets are legitimate documented
 * fallbacks (e.g. ClipboardState.js is tested as ClipboardEngine's fallback
 * dependency, not as a standalone zombie). This guard surfaces candidates
 * for human review — it does not auto-classify intent — so it always exits 0.
 *
 * Usage:
 *   node audit/orphan_test_target_guard.mjs
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SEP  = '─'.repeat(70);

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

/**
 * sources: { [testFileName]: testFileContent }
 * returns: Map<engineFileName, Set<testFileName>>
 */
export function collectTestTargetFiles(sources) {
  const targets = new Map();
  const re = /engines\/([A-Za-z0-9_.-]+\.js)/g;
  for (const [testFile, src] of Object.entries(sources)) {
    let m;
    while ((m = re.exec(src))) {
      const engineFile = m[1];
      if (!targets.has(engineFile)) targets.set(engineFile, new Set());
      targets.get(engineFile).add(testFile);
    }
  }
  return targets;
}

export function findOrphanTestTargets(targets, loadedByHtml) {
  const orphans = [];
  for (const [file, testFiles] of targets.entries()) {
    if (!loadedByHtml.has(file)) {
      orphans.push({ file, testFiles: [...testFiles].sort() });
    }
  }
  return orphans.sort((a, b) => a.file.localeCompare(b.file));
}

// ── CLI ──────────────────────────────────────────────────────────────────

function main() {
  const htmlDir = join(ROOT, 'designer');
  const htmlFiles = readdirSync(htmlDir).filter((f) => extname(f) === '.html');
  const htmlSources = htmlFiles.map((f) => readFileSync(join(htmlDir, f), 'utf8'));
  const loadedByHtml = collectHtmlScriptSrcs(htmlSources);

  // Excludes this guard's own meta-test file and ssot_runtime_binding_guard's:
  // both use synthetic placeholder names like 'engines/A.js' in unit-test
  // fixtures to test guard logic itself, not real engine source — those
  // literals would otherwise be indistinguishable from a genuine test target.
  const SELF_TESTS = new Set(['orphan_test_target_guard.test.mjs', 'ssot_runtime_binding_guard.test.mjs']);
  const testsDir = join(ROOT, 'reportforge/tests');
  const testFiles = readdirSync(testsDir).filter((f) => f.endsWith('.test.mjs') && !SELF_TESTS.has(f));
  const sources = {};
  for (const f of testFiles) sources[f] = readFileSync(join(testsDir, f), 'utf8');
  const targets = collectTestTargetFiles(sources);

  const orphans = findOrphanTestTargets(targets, loadedByHtml);

  console.log(`\n${SEP}`);
  console.log('🧪  Orphan Test Target Guard');
  console.log(`    designer/*.html loaded: ${loadedByHtml.size}  |  engine files tested: ${targets.size}`);
  console.log(SEP);

  if (orphans.length > 0) {
    console.log(`\n⚠   WARN — ${orphans.length} test target(s) never loaded by any designer/*.html\n`);
    for (const o of orphans) {
      console.log(`  ⚠   engines/${o.file} — tested by: ${o.testFiles.join(', ')}`);
    }
    console.log('\n   Review each: legitimate documented fallback (keep) vs. zombie under test instead of the real owner (retarget the test).\n');
  } else {
    console.log('\n✅  No orphan test targets — every tested engine file is also loaded by production HTML.');
  }
}

const isMain = process.argv[1] && process.argv[1].endsWith('orphan_test_target_guard.mjs');
if (isMain) main();
