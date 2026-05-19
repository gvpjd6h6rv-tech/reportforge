#!/usr/bin/env node
/**
 * E2R Coverage — Evidencia de Ejecución Real, Step 2
 *
 * Inputs:
 *   audit/e2r_run_manifest.json       — real execution results (pass/fail/timeout)
 *   audit/subsystem_ownership_map.json — subsystem definitions with existingTests[]
 *
 * Output:
 *   audit/e2r_coverage.json
 *
 * Rules:
 *   - Only tests with result === "pass" in the manifest count as coverage evidence.
 *   - timeout and fail do NOT contribute coverage.
 *   - If a subsystem's existingTests has no intersection with passing tests → coverageReal = 0.
 *   - No name inference. Association is ONLY via existingTests[] in the ownership map.
 *   - coverageReal = round((passing tests for subsystem / total passing tests) * 100)
 *     This is a conservative relative metric, not absolute line coverage.
 *
 * Limitations (by design):
 *   - browser/playwright tests that timeout → 0 contribution even if they would pass in CI.
 *   - Python test suites (SS-B*) are never in e2r_run_manifest (node:test only) → 0.
 *   - user_parity/* tests are excluded from manifest (non-recursive discovery) → 0.
 *   - run_runtime_regression.mjs is not a *.test.mjs → not in manifest → 0 for those subsystems.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname }            from 'node:path';
import { fileURLToPath }               from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '..');

const manifest     = JSON.parse(readFileSync(resolve(__dirname, 'e2r_run_manifest.json'),      'utf8'));
const ownershipMap = JSON.parse(readFileSync(resolve(__dirname, 'subsystem_ownership_map.json'), 'utf8'));

// ── Passing tests set ─────────────────────────────────────────────────────────
const passingTests = new Set(
  manifest
    .filter((e) => e.result === 'pass')
    .map((e) => e.file)
);

const totalPass = passingTests.size;

// ── Per-subsystem coverage ────────────────────────────────────────────────────
const subsystems = ownershipMap.subsystems ?? [];

const entries = subsystems.map((sub) => {
  const existingTests  = sub.existingTests ?? [];
  // Intersection: only tests that are BOTH declared for this subsystem AND passed.
  const passingForSub  = existingTests.filter((t) => passingTests.has(t));
  const coverageReal   = totalPass > 0
    ? Math.round((passingForSub.length / totalPass) * 100)
    : 0;

  return {
    id:            sub.id,
    name:          sub.name,
    domain:        sub.domain,
    tier:          sub.tier,
    risk:          sub.risk,
    existingTests,
    passingTests:  passingForSub,
    coverageReal,
    // Explicit reason when 0 — no inference allowed.
    coverageNote:  passingForSub.length === 0
      ? sub.coverageExclusion
        ? `BACKLOG: ${sub.coverageExclusion.justification}`
        : existingTests.length === 0
          ? 'no tests declared in existingTests'
          : 'declared tests not in passing manifest (timeout, fail, or not a node:test .mjs)'
      : null,
    coverageExclusion: sub.coverageExclusion ?? null,
  };
});

const output = {
  generatedAt:    new Date().toISOString(),
  manifestFile:   'audit/e2r_run_manifest.json',
  ownershipFile:  'audit/subsystem_ownership_map.json',
  totalPassingTests: totalPass,
  formula:        'coverageReal = round((passingTests.length / totalPassingTests) * 100)',
  limitations: [
    'Only *.test.mjs files in reportforge/tests/ (non-recursive) are included in manifest.',
    'browser/playwright tests timeout → contribute 0 even if they pass in full CI.',
    'Python test suites (SS-B*) are not run by node:test → always 0.',
    'user_parity/* tests are excluded from manifest → 0 for subsystems covered only by them.',
    'run_runtime_regression.mjs is not *.test.mjs → excluded from manifest.',
    'coverageReal is a relative metric (% of total passing tests), not line/branch coverage.',
  ],
  subsystems: entries,
};

writeFileSync(resolve(__dirname, 'e2r_coverage.json'), JSON.stringify(output, null, 2) + '\n');

// ── Console summary ───────────────────────────────────────────────────────────
const withCoverage = entries.filter((e) => e.coverageReal > 0);
const zeroCoverage = entries.filter((e) => e.coverageReal === 0);

console.log(`E2R coverage: ${totalPass} passing tests across ${subsystems.length} subsystems`);
console.log(`  coverageReal > 0 : ${withCoverage.length} subsystems`);
console.log(`  coverageReal = 0 : ${zeroCoverage.length} subsystems`);
console.log('');
console.log('  > 0:');
withCoverage
  .sort((a, b) => b.coverageReal - a.coverageReal)
  .forEach((e) => console.log(`    ${e.id} ${e.name.padEnd(25)} ${String(e.coverageReal).padStart(3)}%  [${e.passingTests.map(t => t.split('/').pop()).join(', ')}]`));
console.log('');
console.log('  = 0:');
zeroCoverage.forEach((e) => console.log(`    ${e.id} ${e.name.padEnd(25)} ${e.coverageNote}`));
