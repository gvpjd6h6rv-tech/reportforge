#!/usr/bin/env node
'use strict';
/**
 * render_storm_guard.mjs — Principles #50-#53 Observability: Metrics, Timeline,
 *                          Profiling, Render Storm Detection
 *
 * Static analysis verifying that the render scheduler is instrumented with the
 * minimum observability required to turn "it feels slow" into measurable traces.
 *
 * RULE-A (OBS-METRICS-001): RenderSchedulerFrame.js must compute per-phase durationMs
 *   and total flush durationMs via performance.now(). Asserts both exist.
 *
 * RULE-B (OBS-TIMELINE-001): frameMeta must carry a `phases` array with ordered
 *   per-phase entries (layout → visual → handles → post). Asserts the push exists.
 *
 * RULE-C (OBS-PROFILING-001): Per-task profiling (slowestMs / slowestKey) must be
 *   tracked inside at least one phase loop. Ensures hotspot visibility exists.
 *
 * RULE-D (OBS-STORM-001): Render storm detection must be present — a stormThreshold
 *   in RenderSchedulerState and a rf:render-storm event dispatch in RenderSchedulerFrame.
 *
 * Usage:
 *   node audit/render_storm_guard.mjs          # fail on violations
 *   node audit/render_storm_guard.mjs --report # report only
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
  if (!condition) {
    violations.push({ rule, file: `engines/${file}`, desc });
  }
}

// RULE-A: per-phase durationMs and total durationMs via performance.now()
check('OBS-METRICS-001', 'RenderSchedulerFrame.js',
  /performance\.now\s*\(\s*\)/.test(frame) && /durationMs/.test(frame),
  'RenderSchedulerFrame.js must use performance.now() and produce durationMs for phases and total flush');

check('OBS-METRICS-001', 'RenderSchedulerFrame.js',
  /frameMeta\.durationMs\s*=/.test(frame),
  'frameMeta.durationMs must be assigned (total flush duration)');

// RULE-B: phases array with ordered entries
check('OBS-TIMELINE-001', 'RenderSchedulerFrame.js',
  /phases\s*:\s*\[\]/.test(frame) || /frameMeta\.phases\s*=\s*\[\]/.test(frame),
  'frameMeta.phases must be initialised as []');

check('OBS-TIMELINE-001', 'RenderSchedulerFrame.js',
  /frameMeta\.phases\.push\s*\(/.test(frame),
  'frameMeta.phases.push must be called per phase to build ordered timeline');

// RULE-C: per-task profiling (slowestMs / slowestKey)
check('OBS-PROFILING-001', 'RenderSchedulerFrame.js',
  /slowestMs/.test(frame) && /slowestKey/.test(frame),
  'RenderSchedulerFrame.js must track slowestMs and slowestKey per phase for hotspot detection');

// RULE-D: storm state in RenderSchedulerState
check('OBS-STORM-001', 'RenderSchedulerState.js',
  /stormThreshold\s*:/.test(state),
  'RenderSchedulerState.js must define stormThreshold');

check('OBS-STORM-001', 'RenderSchedulerState.js',
  /recentFrameTimes\s*:/.test(state),
  'RenderSchedulerState.js must define recentFrameTimes rolling ring');

check('OBS-STORM-001', 'RenderSchedulerState.js',
  /stormActive\s*:/.test(state),
  'RenderSchedulerState.js must define stormActive latch');

// RULE-D: storm dispatch in RenderSchedulerFrame
check('OBS-STORM-001', 'RenderSchedulerFrame.js',
  /rf:render-storm/.test(frame),
  'RenderSchedulerFrame.js must dispatch rf:render-storm CustomEvent on storm detection');

check('OBS-STORM-001', 'RenderSchedulerFrame.js',
  /stormThreshold/.test(frame) && /recentFrameTimes/.test(frame),
  'RenderSchedulerFrame.js must reference stormThreshold and recentFrameTimes');

// ── Report ─────────────────────────────────────────────────────────────────────

console.log('── Render Storm & Observability Guard (#50-#53) ─────────────────');
console.log(`   violations found: ${violations.length}`);

if (violations.length > 0) {
  console.error('\n  Violations:');
  for (const v of violations) {
    console.error(`  [${v.rule}] ${v.file}`);
    console.error(`    → ${v.desc}`);
  }
}

if (violations.length === 0) {
  console.log('\n✅ observability instrumentation verified (metrics, timeline, profiling, storm)\n');
  process.exit(0);
}

console.error('\n❌ observability gap — render pipeline missing measurable traces');
console.error('   Principles #50-#53: metrics per phase, timeline, profiling, render storm detection\n');
if (!REPORT) process.exit(1);
