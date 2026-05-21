#!/usr/bin/env node
'use strict';
/**
 * render_scheduler_observability_guard.mjs — SS-03 observability SSOT compliance gate
 *
 * Verifies that RenderSchedulerObservability.js is a pure, side-effect-free
 * observability module — no DOM references, no singleton state — so it can be
 * tested and reused without browser context.
 *
 * RULE-A (RSO-EXIST-001): RenderSchedulerObservability.js must exist in engines/.
 *
 * RULE-B (RSO-EXPORT-001): RenderSchedulerObservability.js must have module.exports
 *   for node:test testability.
 *
 * RULE-C (RSO-API-001): RenderSchedulerObservability.js must export all 7 canonical
 *   functions: now, recordFrameTime, recordHotspot, getFrameRate, clearStorm,
 *   getHotspots, clearHotspots.
 *
 * RULE-D (RSO-PURITY-001): RenderSchedulerObservability.js must NOT reference DOM or
 *   mutable singleton state: no document, no DS, no S.locked (singleton access).
 *
 * RULE-E (RSO-NODEP-001): RenderSchedulerObservability.js must NOT use
 *   requestAnimationFrame or cancelAnimationFrame — scheduling belongs to
 *   RenderScheduler.js, not the observability layer.
 *
 * Usage:
 *   node audit/render_scheduler_observability_guard.mjs          # fail on violations
 *   node audit/render_scheduler_observability_guard.mjs --report # report only
 */

import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT    = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENGINES = path.join(ROOT, 'engines');
const ARGS    = process.argv.slice(2);
const REPORT  = ARGS.includes('--report');

const violations = [];

function check(rule, file, condition, desc) {
  if (!condition) violations.push({ rule, file: `engines/${file}`, desc });
}

const exists = (f) => fs.existsSync(path.join(ENGINES, f));
const read   = (f) => fs.readFileSync(path.join(ENGINES, f), 'utf8');

// ── RULE-A: RenderSchedulerObservability.js must exist ───────────────────────

check('RSO-EXIST-001', 'RenderSchedulerObservability.js',
  exists('RenderSchedulerObservability.js'),
  'RenderSchedulerObservability.js must exist — pure observability layer for render scheduler');

if (exists('RenderSchedulerObservability.js')) {
  const src = read('RenderSchedulerObservability.js');

  // ── RULE-B: module.exports ─────────────────────────────────────────────────
  check('RSO-EXPORT-001', 'RenderSchedulerObservability.js',
    /module\.exports/.test(src),
    'RenderSchedulerObservability.js must have module.exports for node:test testability');

  // ── RULE-C: 7 canonical API methods exported ───────────────────────────────
  const REQUIRED_METHODS = [
    'now',
    'recordFrameTime',
    'recordHotspot',
    'getFrameRate',
    'clearStorm',
    'getHotspots',
    'clearHotspots',
  ];

  for (const method of REQUIRED_METHODS) {
    check('RSO-API-001', 'RenderSchedulerObservability.js',
      new RegExp(`\\b${method}\\b`).test(src),
      `RenderSchedulerObservability.js must export: ${method}`);
  }

  // ── RULE-D: no DOM or mutable singleton references ────────────────────────
  const FORBIDDEN_PATTERNS = [
    { pattern: /\bdocument\b/,   label: 'document' },
    { pattern: /\bDS\b/,          label: 'DS' },
    { pattern: /\bS\.locked\b/,   label: 'S.locked (singleton state access)' },
  ];

  for (const { pattern, label } of FORBIDDEN_PATTERNS) {
    check('RSO-PURITY-001', 'RenderSchedulerObservability.js',
      !pattern.test(src),
      `RenderSchedulerObservability.js must not reference: ${label} (pure observability — no DOM/singleton)`);
  }

  // ── RULE-E: no scheduling API (rAF/cAF) ──────────────────────────────────
  const SCHEDULING_PATTERNS = [
    { pattern: /\brequestAnimationFrame\b/, label: 'requestAnimationFrame' },
    { pattern: /\bcancelAnimationFrame\b/,  label: 'cancelAnimationFrame' },
  ];

  for (const { pattern, label } of SCHEDULING_PATTERNS) {
    check('RSO-NODEP-001', 'RenderSchedulerObservability.js',
      !pattern.test(src),
      `RenderSchedulerObservability.js must not use: ${label} (scheduling belongs to RenderScheduler.js)`);
  }
}

// ── Report ────────────────────────────────────────────────────────────────────

const rulesChecked = 1 + (exists('RenderSchedulerObservability.js') ? 1 + 7 + 3 + 2 : 0);
console.log('── Render Scheduler Observability Guard ───────────────────────');
console.log(`   rules checked: ${rulesChecked}  violations found: ${violations.length}`);

if (violations.length > 0) {
  console.error('\n  Violations:');
  for (const v of violations) {
    console.error(`  [${v.rule}] ${v.file}`);
    console.error(`    → ${v.desc}`);
  }
  console.error('\n❌ render-scheduler-observability purity contract compromised\n');
  if (!REPORT) process.exit(1);
} else {
  console.log('\n✅ RenderSchedulerObservability pure-layer contract intact — API + purity + no-scheduling verified\n');
  process.exit(0);
}
