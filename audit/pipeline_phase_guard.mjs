#!/usr/bin/env node
'use strict';
/**
 * pipeline_phase_guard.mjs — Principle #34 Tests de pipeline
 *
 * Verifies that the render pipeline processes phases in a fixed, documented
 * order: LAYOUT → VISUAL → HANDLES → POST. Shuffling phase order would
 * corrupt canvas state (visual reads layout output; handles read visual output).
 *
 * RULE-A (PIPELINE-PRIORITY-001): RenderSchedulerState.js must define
 *   PRIORITY with LAYOUT=0, VISUAL=1, HANDLES=2, POST=3 — in exactly that
 *   numeric order. Any other assignment breaks the flush loop order contract.
 *
 * RULE-B (PIPELINE-LOOP-001): RenderSchedulerFrame.js must iterate the queues
 *   with a sequential for-loop (for (let i = 0; i < S.queues.length; i++))
 *   rather than a shuffled or random access pattern. The loop body must index
 *   S.queues[i] — not a reordered subset.
 *
 * RULE-C (PIPELINE-NAMES-001): RenderSchedulerFrame.js must emit phase names
 *   in the correct priority index order:
 *     i=0 → 'layout', i=1 → 'visual', i=2 → 'handles', i=3 → 'post'
 *   The ternary chain or if-else that maps index to name must cover all four.
 *
 * RULE-D (PIPELINE-PHASE-PUSH-001): RenderSchedulerFrame.js must push phase
 *   timing into frameMeta.phases[] — providing a machine-readable phase-order
 *   audit trail for post-hoc analysis.
 *
 * Usage:
 *   node audit/pipeline_phase_guard.mjs          # fail on violations
 *   node audit/pipeline_phase_guard.mjs --report # report only
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

const stateSrc = readEngine('RenderSchedulerState.js');
const frameSrc = readEngine('RenderSchedulerFrame.js');

const violations = [];

function check(rule, file, condition, desc) {
  if (!condition) violations.push({ rule, file, desc });
}

// ── RULE-A: PRIORITY constants are in correct numeric order ──────────────────

check('PIPELINE-PRIORITY-001', 'engines/RenderSchedulerState.js',
  /LAYOUT\s*:\s*0/.test(stateSrc),
  'PRIORITY.LAYOUT must be 0 (first phase)');

check('PIPELINE-PRIORITY-001', 'engines/RenderSchedulerState.js',
  /VISUAL\s*:\s*1/.test(stateSrc),
  'PRIORITY.VISUAL must be 1 (second phase)');

check('PIPELINE-PRIORITY-001', 'engines/RenderSchedulerState.js',
  /HANDLES\s*:\s*2/.test(stateSrc),
  'PRIORITY.HANDLES must be 2 (third phase)');

check('PIPELINE-PRIORITY-001', 'engines/RenderSchedulerState.js',
  /POST\s*:\s*3/.test(stateSrc),
  'PRIORITY.POST must be 3 (fourth phase)');

// Confirm the four constants are all in a single object (not scattered)
check('PIPELINE-PRIORITY-001', 'engines/RenderSchedulerState.js',
  /PRIORITY\s*=\s*\{[^}]*LAYOUT[^}]*VISUAL[^}]*HANDLES[^}]*POST[^}]*\}/.test(stateSrc),
  'PRIORITY object must declare LAYOUT, VISUAL, HANDLES, POST in that order');

// ── RULE-B: Frame loop iterates sequentially ──────────────────────────────────

check('PIPELINE-LOOP-001', 'engines/RenderSchedulerFrame.js',
  /for\s*\(\s*let\s+i\s*=\s*0\s*;\s*i\s*<\s*S\.queues\.length\s*;\s*i\+\+\s*\)/.test(frameSrc),
  'RenderSchedulerFrame.js must iterate phases with sequential for-loop over S.queues (i=0 to length-1)');

check('PIPELINE-LOOP-001', 'engines/RenderSchedulerFrame.js',
  /S\.queues\[i\]/.test(frameSrc),
  'Frame loop must index S.queues[i] to preserve phase order');

// ── RULE-C: Phase names map correctly to indices ──────────────────────────────

// The ternary/if-else must cover all four names
check('PIPELINE-NAMES-001', 'engines/RenderSchedulerFrame.js',
  /'layout'/.test(frameSrc) && /'visual'/.test(frameSrc) &&
  /'handles'/.test(frameSrc) && /'post'/.test(frameSrc),
  'RenderSchedulerFrame.js must emit all four phase names: layout, visual, handles, post');

// Priority mapping must associate LAYOUT (0) with 'layout'
check('PIPELINE-NAMES-001', 'engines/RenderSchedulerFrame.js',
  /S\.PRIORITY\.LAYOUT[^?]*'layout'|PRIORITY\.LAYOUT.*layout/.test(frameSrc) ||
  /i\s*===\s*S\.PRIORITY\.LAYOUT\s*\?\s*'layout'/.test(frameSrc),
  "Phase name for S.PRIORITY.LAYOUT must be 'layout'");

// ── RULE-D: Phase timing pushed to frameMeta.phases[] ────────────────────────

check('PIPELINE-PHASE-PUSH-001', 'engines/RenderSchedulerFrame.js',
  /frameMeta\.phases\.push\(/.test(frameSrc),
  'RenderSchedulerFrame.js must push phase timing to frameMeta.phases[] for audit trail');

check('PIPELINE-PHASE-PUSH-001', 'engines/RenderSchedulerFrame.js',
  /durationMs/.test(frameSrc),
  'Phase timing entry must include durationMs for performance analysis');

// ── Report ─────────────────────────────────────────────────────────────────────

console.log('── Pipeline Phase Guard (#34) ────────────────────────────────────');
console.log(`   violations found: ${violations.length}`);

if (violations.length > 0) {
  console.error('\n  Violations:');
  for (const v of violations) {
    console.error(`  [${v.rule}] ${v.file}`);
    console.error(`    → ${v.desc}`);
  }
}

if (violations.length === 0) {
  console.log('\n✅ pipeline phase order intact — LAYOUT→VISUAL→HANDLES→POST enforced statically\n');
  process.exit(0);
}

console.error('\n❌ pipeline phase order gap — phase constants or loop order may be wrong');
console.error('   Fix: restore PRIORITY values and sequential loop in RenderSchedulerFrame\n');
if (!REPORT) process.exit(1);
