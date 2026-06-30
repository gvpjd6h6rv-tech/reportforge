#!/usr/bin/env node
'use strict';
/**
 * tools/cli/guards_cli.mjs — CLI entry point (I/O only).
 * Translates argv to runGuards() invocation, then maps result to exit code.
 * No rule logic. No orchestration logic.
 *
 * Usage:
 *   node tools/cli/guards_cli.mjs [--mode=modular|legacy|dual] [--report=<path>]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runGuards } from '../runners/run_guards.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_REPORT = path.join(ROOT, 'reports/guards_migration_report.json');

const args = process.argv.slice(2);
const mode = (args.find(a => a.startsWith('--mode=')) ?? '--mode=modular').split('=')[1];
const reportArg = args.find(a => a.startsWith('--report='));
const reportPath = reportArg ? reportArg.split('=').slice(1).join('=') : DEFAULT_REPORT;

const report = await runGuards({ mode, reportPath, root: ROOT });

const { summary } = report;
console.log(`\nRF Guard Runner — mode: ${summary.mode} @ ${summary.timestamp}`);
if (summary.modularTotal > 0)
  console.log(`  modular: ${summary.modularPass}/${summary.modularTotal} pass`);
if (summary.legacyTotal > 0)
  console.log(`  legacy:  ${summary.legacyPass}/${summary.legacyTotal} pass`);
if (summary.comparisonsTotal > 0) {
  console.log(`  dual:    ${summary.comparisonsEquiv}/${summary.comparisonsTotal} equivalent`);
  if (summary.comparisonsDivergent > 0) {
    console.error(`\n  DIVERGENCES (${summary.comparisonsDivergent}):`);
    for (const c of report.comparisons.filter(c => !c.equivalent)) {
      console.error(`    ${c.legacyId}: legacy=${c.legacyPass} modular=${c.modularPass}`);
      if (c.divergence?.detail) console.error(`      ${c.divergence.detail}`);
    }
  }
}
if (reportPath) console.log(`\n  report → ${reportPath}`);

// blocking:false — always exit 0 in Phase 6
process.exit(0);
