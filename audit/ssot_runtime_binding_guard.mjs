#!/usr/bin/env node
/**
 * audit/ssot_runtime_binding_guard.mjs — SSOT runtime binding gate (P29B #1)
 *
 * Every engines/*.js file claimed as owned in audit/subsystem_ownership_map.json
 * (domain: designer-runtime, plus the top-level sharedFiles) must be bound to
 * something real: either loaded by a real production designer HTML
 * (<script src="/engines/X.js">) or referenced by a real test under
 * reportforge/tests/*.test.mjs. A file claimed as SSOT/owned but neither
 * loaded nor tested is a paper claim, not a verified one.
 *
 * Exit codes:
 *   0 = every claimed file is bound to runtime or test
 *   1 = one or more claimed files are unbound
 *
 * Usage:
 *   node audit/ssot_runtime_binding_guard.mjs
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT    = fileURLToPath(new URL('..', import.meta.url));
const MAP_REL = 'audit/subsystem_ownership_map.json';
const SEP     = '─'.repeat(70);

// ── pure logic (exported for unit tests) ────────────────────────────────────

export function collectClaimedEngineFiles(map) {
  const { subsystems = [], sharedFiles = [] } = map;
  const claimed = new Set(sharedFiles);
  for (const ss of subsystems) {
    if (ss.domain !== 'designer-runtime') continue;
    for (const f of (ss.allowedFiles || [])) claimed.add(f);
  }
  return claimed;
}

export function collectHtmlScriptSrcs(htmlSources) {
  const set = new Set();
  const re = /<script\s+src="\/engines\/([^"]+)"/g;
  for (const html of htmlSources) {
    let m;
    while ((m = re.exec(html))) set.add(m[1]);
  }
  return set;
}

export function collectTestReferencedFiles(testSources) {
  const set = new Set();
  const re = /engines\/([A-Za-z0-9_.-]+\.js)/g;
  for (const src of testSources) {
    let m;
    while ((m = re.exec(src))) set.add(m[1]);
  }
  return set;
}

export function findUnboundFiles(claimed, loadedByHtml, referencedByTests) {
  const violations = [];
  for (const f of claimed) {
    if (!loadedByHtml.has(f) && !referencedByTests.has(f)) violations.push(f);
  }
  return violations.sort();
}

// ── CLI ──────────────────────────────────────────────────────────────────

function main() {
  const map = JSON.parse(readFileSync(join(ROOT, MAP_REL), 'utf8'));
  const claimed = collectClaimedEngineFiles(map);

  const htmlDir = join(ROOT, 'designer');
  const htmlFiles = readdirSync(htmlDir).filter((f) => extname(f) === '.html');
  const htmlSources = htmlFiles.map((f) => readFileSync(join(htmlDir, f), 'utf8'));
  const loadedByHtml = collectHtmlScriptSrcs(htmlSources);

  // Excludes both new P29B guards' own meta-test files: they use synthetic
  // placeholder names like 'engines/A.js' in unit-test fixtures to test the
  // guards' OWN logic, not real engine source — those literals would
  // otherwise be indistinguishable from a genuine test-target reference.
  const SELF_TESTS = new Set(['ssot_runtime_binding_guard.test.mjs', 'orphan_test_target_guard.test.mjs']);
  const testsDir = join(ROOT, 'reportforge/tests');
  const testFiles = readdirSync(testsDir).filter((f) => f.endsWith('.test.mjs') && !SELF_TESTS.has(f));
  const testSources = testFiles.map((f) => readFileSync(join(testsDir, f), 'utf8'));
  const referencedByTests = collectTestReferencedFiles(testSources);

  const violations = findUnboundFiles(claimed, loadedByHtml, referencedByTests);

  console.log(`\n${SEP}`);
  console.log('🔗  SSOT Runtime Binding Guard');
  console.log(`    map: ${MAP_REL}  |  claimed: ${claimed.size}  |  loaded: ${loadedByHtml.size}  |  tested: ${referencedByTests.size}`);
  console.log(SEP);

  if (violations.length > 0) {
    console.log(`\n❌  FAIL — ${violations.length} unbound SSOT claim(s)\n`);
    for (const f of violations) {
      console.log(`  ❌  engines/${f} — claimed as owned, but no <script src="/engines/${f}"> in designer/*.html and no reference in reportforge/tests/*.test.mjs`);
    }
    console.log('');
    process.exitCode = 1;
    return;
  }

  console.log('\n✅  PASS — every claimed file is loaded by production HTML or referenced by a real test.');
}

const isMain = process.argv[1] && process.argv[1].endsWith('ssot_runtime_binding_guard.mjs');
if (isMain) main();
