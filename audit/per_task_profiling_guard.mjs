#!/usr/bin/env node
'use strict';
/**
 * per_task_profiling_guard.mjs — Principle #52 Profiling por Operación
 *
 * Static analysis verifying that per-task profiling instrumentation is complete
 * and produces a persistent cross-frame hotspot log in RenderSchedulerFrame.js.
 *
 * RULE-A (PROF-TASK-001): RenderSchedulerFrame.js must use performance.now()
 *   (or Date.now() fallback) inside the per-task loop — not only at phase level.
 *   Phase-level timing alone cannot identify the single slowest task.
 *
 * RULE-B (PROF-SLOWEST-001): Each phase entry in frameMeta.phases must carry
 *   slowestMs and slowestKey. These fields are the per-phase profiling contract.
 *
 * RULE-C (PROF-HOTSPOT-001): RenderSchedulerState.js must declare hotspots[]
 *   and hotspotThresholdMs. Tasks exceeding the threshold must be pushed to the
 *   ring; oldest entry dropped when ring reaches capacity (100).
 *
 * RULE-D (PROF-HOTSPOT-API-001): RenderSchedulerFrame.js must export
 *   getHotspots() and clearHotspots() so consumers can inspect and reset the
 *   cross-frame slow-task log.
 *
 * Usage:
 *   node audit/per_task_profiling_guard.mjs          # fail on violations
 *   node audit/per_task_profiling_guard.mjs --report # report only
 */

import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT    = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENGINES = path.join(ROOT, 'engines');
const ARGS    = process.argv.slice(2);
const REPORT  = ARGS.includes('--report');

const read = (f) => fs.readFileSync(path.join(ENGINES, f), 'utf8');

const frame = read('RenderSchedulerFrame.js');
const state = read('RenderSchedulerState.js');

const violations = [];

function check(rule, file, condition, desc) {
  if (!condition) violations.push({ rule, file: `engines/${file}`, desc });
}

// RULE-A: per-task performance.now() inside the task loop.
// Must contain taskT0 = perfNow() and taskMs = perfNow() - taskT0 inside the for loop.
check('PROF-TASK-001', 'RenderSchedulerFrame.js',
  /taskT0\s*=\s*perfNow\s*\(\s*\)/.test(frame),
  'per-task profiling: must capture taskT0 = perfNow() inside the task loop');

check('PROF-TASK-001', 'RenderSchedulerFrame.js',
  /taskMs\s*=\s*perfNow\s*\(\s*\)\s*-\s*taskT0/.test(frame),
  'per-task profiling: must compute taskMs = perfNow() - taskT0 after each task');

// RULE-B: slowestMs and slowestKey on phase entries.
check('PROF-SLOWEST-001', 'RenderSchedulerFrame.js',
  /slowestMs/.test(frame),
  'frameMeta.phases entries must carry slowestMs per phase');

check('PROF-SLOWEST-001', 'RenderSchedulerFrame.js',
  /slowestKey/.test(frame),
  'frameMeta.phases entries must carry slowestKey per phase');

// RULE-C: hotspots ring in state.
check('PROF-HOTSPOT-001', 'RenderSchedulerState.js',
  /hotspotThresholdMs/.test(state),
  'RenderSchedulerState must define hotspotThresholdMs — slow-task threshold in ms');

check('PROF-HOTSPOT-001', 'RenderSchedulerState.js',
  /hotspots\s*:\s*\[\]/.test(state),
  'RenderSchedulerState must declare hotspots: [] — cross-frame slow-task ring');

check('PROF-HOTSPOT-001', 'RenderSchedulerFrame.js',
  /S\.hotspots\.push\s*\(/.test(frame),
  'RenderSchedulerFrame must push slow tasks to S.hotspots when taskMs > S.hotspotThresholdMs');

check('PROF-HOTSPOT-001', 'RenderSchedulerFrame.js',
  /S\.hotspots\.shift\s*\(\s*\)/.test(frame),
  'RenderSchedulerFrame must shift() the oldest entry when hotspots ring reaches capacity');

// RULE-D: getHotspots / clearHotspots exported.
check('PROF-HOTSPOT-API-001', 'RenderSchedulerFrame.js',
  /getHotspots\s*:/.test(frame),
  'RenderSchedulerFrame must export getHotspots for consumers to inspect the slow-task log');

check('PROF-HOTSPOT-API-001', 'RenderSchedulerFrame.js',
  /clearHotspots\s*:/.test(frame),
  'RenderSchedulerFrame must export clearHotspots to allow log reset between test runs');

// ── Report ─────────────────────────────────────────────────────────────────────

console.log('── Per-Task Profiling Guard (#52) ───────────────────────────────');
console.log(`   violations found: ${violations.length}`);

if (violations.length > 0) {
  console.error('\n  Violations:');
  for (const v of violations) {
    console.error(`  [${v.rule}] ${v.file}`);
    console.error(`    → ${v.desc}`);
  }
}

if (violations.length === 0) {
  console.log('\n✅ per-task profiling complete — task timer, phase slowest, hotspot ring, API exported\n');
  process.exit(0);
}

console.error('\n❌ per-task profiling gap — slow-task log incomplete or not exported');
console.error('   Fix: ensure taskT0/taskMs timing, slowestMs/Key on phases, hotspots[] ring, getHotspots/clearHotspots exported\n');
if (!REPORT) process.exit(1);
