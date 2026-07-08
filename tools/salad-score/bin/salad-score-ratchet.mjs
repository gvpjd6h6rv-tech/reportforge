#!/usr/bin/env node
'use strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSaladScore } from '../runner/run_salad_score.mjs';
import { loadBaseline, saveBaseline } from '../ci/salad_score_baseline_store.mjs';
import { checkRatchet } from '../ci/salad_score_ratchet_check.mjs';

/**
 * salad-score-ratchet — CI entry point. Orchestrates ONLY: run the scorer,
 * load the committed baseline, compare, print a report, exit non-zero on
 * regression. No scoring formulas and no comparison logic live here — see
 * runner/run_salad_score.mjs and ci/salad_score_ratchet_check.mjs.
 *
 * This is a RATCHET, not a hard ceiling (RF-ARCH-SP-SCORE-RATCHET-1):
 * pre-existing bad scores never fail the build on their own — only a
 * file's score getting WORSE than its own recorded baseline does. This is
 * intentional while the SQL Commands epic is underway: it protects
 * against NEW god-files/regressions without blocking on the debt already
 * accepted at the ratchet's introduction.
 *
 * Usage:
 *   node salad-score-ratchet.mjs                 # check against baseline
 *   node salad-score-ratchet.mjs --update-baseline  # write a new baseline
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const BASELINE_PATH = path.join(REPO_ROOT, 'audit/salad_score_baseline.json');

function main() {
  const updateBaseline = process.argv.includes('--update-baseline');

  const config = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'salad-score.config.json'), 'utf8'));
  const roots = config.scanRoots.map((r) => path.join(REPO_ROOT, r));
  const { files: rawFiles } = runSaladScore({
    roots,
    config,
    ownershipMapPath: path.join(REPO_ROOT, 'audit/subsystem_ownership_map.json'),
  });
  // Baseline keys must be REPO-RELATIVE, not absolute — an absolute path
  // baked in from this machine's checkout dir would never match a CI
  // runner's different checkout path, silently turning every file into a
  // "new file" and making the ratchet check nothing.
  const files = rawFiles.map((f) => ({ ...f, path: path.relative(REPO_ROOT, f.path) }));

  if (updateBaseline) {
    saveBaseline(BASELINE_PATH, files);
    console.log(`Baseline written: ${BASELINE_PATH} (${files.length} files)`);
    process.exitCode = 0;
    return;
  }

  const baseline = loadBaseline(BASELINE_PATH);
  const { regressions, improvements, newFiles, ok } = checkRatchet(files, baseline);

  console.log(`Salad Score ratchet — ${files.length} files checked, baseline has ${Object.keys(baseline).length} entries.`);
  if (newFiles.length) console.log(`  ${newFiles.length} new file(s) not yet in baseline (added on next --update-baseline, not blocking).`);
  if (improvements.length) console.log(`  ${improvements.length} file(s) improved since baseline.`);

  if (!ok) {
    console.error(`\nREGRESSION: ${regressions.length} file(s) got worse than their baseline score:`);
    for (const r of regressions) {
      console.error(`  ${r.path}: ${r.before} -> ${r.after} (+${r.delta})`);
    }
    console.error('\nIf this regression is accepted deliberately, run with --update-baseline after review.');
    process.exitCode = 1;
    return;
  }

  console.log('\nNo regressions. PASS.');
  process.exitCode = 0;
}

main();
