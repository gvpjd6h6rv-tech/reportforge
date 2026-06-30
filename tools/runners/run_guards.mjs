'use strict';
/**
 * tools/runners/run_guards.mjs — Modular guard runner (Phase 6)
 *
 * Responsibility: orchestration only.
 *   collect guards from guards-map.json → execute each → gather results →
 *   optional legacy comparison → emit report.
 *
 * Modes:
 *   --mode=modular   (default) run only tools/guards/**
 *   --mode=legacy    run only audit/*_guard.mjs (via child process)
 *   --mode=dual      run both, compare, flag divergences
 *
 * No rule logic lives here. No file mutation. Exit 0 always
 * (blocking is not enabled in Phase 6).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectModularGuards } from '../collectors/collect_modular_guards.mjs';
import { collectLegacyGuards } from '../collectors/collect_legacy_guards.mjs';
import { executeModularGuard } from '../executors/execute_modular_guard.mjs';
import { executeLegacyGuard } from '../executors/execute_legacy_guard.mjs';
import { compareResults } from '../comparators/compare_results.mjs';
import { buildReport } from '../reporters/build_report.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MAP_PATH = path.join(ROOT, 'tools/guards/maps/guards-map.json');

export async function runGuards({ mode = 'modular', reportPath = null, root = ROOT } = {}) {
  const map = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
  const modularCandidates = collectModularGuards(map);
  const legacyCandidates  = collectLegacyGuards(root);

  const results = [];

  if (mode === 'modular' || mode === 'dual') {
    for (const g of modularCandidates) {
      const r = await executeModularGuard(g, root);
      results.push({ ...r, mode: 'modular' });
    }
  }

  if (mode === 'legacy' || mode === 'dual') {
    for (const g of legacyCandidates) {
      const r = await executeLegacyGuard(g, root);
      results.push({ ...r, mode: 'legacy' });
    }
  }

  const comparisons = mode === 'dual' ? compareResults(results) : [];
  const report = buildReport({ mode, results, comparisons, mapPath: MAP_PATH });

  if (reportPath) {
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  }

  return report;
}
