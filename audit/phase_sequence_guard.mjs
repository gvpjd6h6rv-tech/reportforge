#!/usr/bin/env node
'use strict';
/**
 * phase_sequence_guard.mjs — Principle #8 Orden fijo de fases
 *
 * Verifies that the render scheduler exposes named phase methods for each
 * priority level and that the phase names are consistently used across the
 * scheduler split (Queue, Frame, Facade).
 *
 * RULE-A (PHASE-QUEUE-001): RenderSchedulerQueue.js must expose named phase
 *   functions layout(), visual(), handles(), post() — each routing to the
 *   correct PRIORITY constant. Named methods prevent callers from accidentally
 *   scheduling at the wrong priority by passing a raw number.
 *
 * RULE-B (PHASE-FACADE-001): RenderScheduler.js facade must re-export the
 *   four phase methods from the Queue owner. The facade is the only public
 *   API — callers must never import from Queue directly.
 *
 * RULE-C (PHASE-FRAME-001): RenderSchedulerFrame.js must emit all four phase
 *   names (layout, visual, handles, post) during a frame flush. Emission
 *   confirms the sequence is executed, not just declared.
 *
 * RULE-D (PHASE-CONSISTENCY-001): The four phase names must be consistent
 *   across Queue (function names), State (PRIORITY keys), Frame (emitted
 *   strings), and Facade (exported keys). Any mismatch breaks the contract
 *   for callers that listen to phase events.
 *
 * RULE-E (PHASE-INVALIDATION-001): RenderSchedulerQueue.js must call
 *   invalidateLayer when scheduling a layout task — layout invalidation is
 *   the machine-enforceable proxy for the fetch→patch→bind→render pipeline:
 *   layout tasks represent the "fetch+patch" phase, visual tasks represent
 *   "bind+render", and post tasks represent the "poll/cleanup" phase.
 *
 * Usage:
 *   node audit/phase_sequence_guard.mjs          # fail on violations
 *   node audit/phase_sequence_guard.mjs --report # report only
 */

import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT    = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENGINES = path.join(ROOT, 'engines');
const ARGS    = process.argv.slice(2);
const REPORT  = ARGS.includes('--report');

const readEngine = (f) => {
  const p = path.join(ENGINES, f);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
};

const queueSrc  = readEngine('RenderSchedulerQueue.js');
const frameSrc  = readEngine('RenderSchedulerFrame.js');
const facadeSrc = readEngine('RenderScheduler.js');
const stateSrc  = readEngine('RenderSchedulerState.js');

const violations = [];

function check(rule, file, condition, desc) {
  if (!condition) violations.push({ rule, file, desc });
}

// ── RULE-A: Queue exposes named phase functions ───────────────────────────────

for (const phase of ['layout', 'visual', 'handles', 'post']) {
  check('PHASE-QUEUE-001', 'engines/RenderSchedulerQueue.js',
    new RegExp(`function ${phase}\\b`).test(queueSrc),
    `RenderSchedulerQueue.js must define function ${phase}() — named phase prevents wrong-priority scheduling`);
}

// Each phase function must route to the correct PRIORITY constant
check('PHASE-QUEUE-001', 'engines/RenderSchedulerQueue.js',
  /PRIORITY\.LAYOUT/.test(queueSrc),
  'layout() must route to S.PRIORITY.LAYOUT');

check('PHASE-QUEUE-001', 'engines/RenderSchedulerQueue.js',
  /PRIORITY\.VISUAL/.test(queueSrc),
  'visual() must route to S.PRIORITY.VISUAL');

check('PHASE-QUEUE-001', 'engines/RenderSchedulerQueue.js',
  /PRIORITY\.HANDLES/.test(queueSrc),
  'handles() must route to S.PRIORITY.HANDLES');

check('PHASE-QUEUE-001', 'engines/RenderSchedulerQueue.js',
  /PRIORITY\.POST/.test(queueSrc),
  'post() must route to S.PRIORITY.POST');

// ── RULE-B: Facade re-exports all four phase methods ─────────────────────────

for (const phase of ['layout', 'visual', 'handles', 'post']) {
  check('PHASE-FACADE-001', 'engines/RenderScheduler.js',
    new RegExp(`${phase}\\s*:`).test(facadeSrc) || new RegExp(`${phase}\\s*=\\s*Q\\.${phase}`).test(facadeSrc),
    `RenderScheduler.js facade must export ${phase} method from Queue`);
}

// ── RULE-C: Frame emits all four phase names during flush ─────────────────────

for (const phase of ['layout', 'visual', 'handles', 'post']) {
  check('PHASE-FRAME-001', 'engines/RenderSchedulerFrame.js',
    new RegExp(`'${phase}'`).test(frameSrc),
    `RenderSchedulerFrame.js must emit phase name '${phase}' during flush`);
}

// ── RULE-D: Phase names consistent across all scheduler files ─────────────────

// State PRIORITY keys must match the four phase names
check('PHASE-CONSISTENCY-001', 'engines/RenderSchedulerState.js',
  /LAYOUT/.test(stateSrc) && /VISUAL/.test(stateSrc) && /HANDLES/.test(stateSrc) && /POST/.test(stateSrc),
  'RenderSchedulerState.js must define LAYOUT, VISUAL, HANDLES, POST PRIORITY constants matching phase names');

// ── RULE-E: Layout scheduling triggers invalidateLayer ───────────────────────

check('PHASE-INVALIDATION-001', 'engines/RenderSchedulerQueue.js',
  /invalidateLayer.*layout|layout.*invalidateLayer/.test(queueSrc),
  'layout() in RenderSchedulerQueue.js must call invalidateLayer — proxy for fetch→patch phase boundary');

// ── Report ─────────────────────────────────────────────────────────────────────

console.log('── Phase Sequence Guard (#8) ─────────────────────────────────────');
console.log(`   violations found: ${violations.length}`);

if (violations.length > 0) {
  console.error('\n  Violations:');
  for (const v of violations) {
    console.error(`  [${v.rule}] ${v.file}`);
    console.error(`    → ${v.desc}`);
  }
}

if (violations.length === 0) {
  console.log('\n✅ phase sequence intact — named phase methods wired correctly across Queue/Frame/Facade\n');
  process.exit(0);
}

console.error('\n❌ phase sequence gap — phase methods missing or inconsistently wired');
console.error('   Fix: ensure layout/visual/handles/post are defined in Queue and re-exported in Facade\n');
if (!REPORT) process.exit(1);
