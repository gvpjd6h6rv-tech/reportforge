#!/usr/bin/env node
'use strict';
/**
 * error_taxonomy_guard.mjs — Principle #69 Error Taxonomy
 *
 * Verifies that the error classification taxonomy is structurally enforced:
 * incidentKey() captures the required diagnostic fields, and the reason
 * string is always recorded so incidents can be classified post-hoc.
 *
 * RULE-A (TAXONOMY-STRUCT-001): EngineCoreRuntime.js must define an
 *   incidentKey() function that includes at minimum: reason, name, message,
 *   phase, and priority — the five diagnostic dimensions that distinguish
 *   error categories (ownership vs. visual vs. runtime vs. backend).
 *
 * RULE-B (TAXONOMY-SAFE-001): enterSafeMode() must always set
 *   state.runtime.safeMode.reason before recording incidentKey — the reason
 *   field is the primary taxonomy classifier.
 *
 * RULE-C (TAXONOMY-FAILURE-001): enterSafeMode() must populate
 *   state.runtime.pipeline.lastFailure with { reason, incidentKey, error,
 *   timestamp } — four fields needed for post-hoc classification without
 *   re-running the incident.
 *
 * RULE-D (TAXONOMY-NORMALIZE-001): EngineCoreRuntime.js must have a
 *   normalizeError() helper that extracts { name, message, stack } from any
 *   thrown value — so classification is consistent regardless of whether the
 *   thrown value is an Error instance or a plain string.
 *
 * RULE-E (TAXONOMY-SNAPSHOT-001): exportRuntimeState() / buildRuntimeSnapshot()
 *   must include the safeMode block in the snapshot — so the incident
 *   classification is preserved in the exported state for replay analysis.
 *
 * Usage:
 *   node audit/error_taxonomy_guard.mjs          # fail on violations
 *   node audit/error_taxonomy_guard.mjs --report # report only
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

const src = readEngine('EngineCoreRuntime.js');

const violations = [];

function check(rule, file, condition, desc) {
  if (!condition) violations.push({ rule, file, desc });
}

// ── RULE-A: incidentKey captures the five diagnostic dimensions ───────────────

check('TAXONOMY-STRUCT-001', 'engines/EngineCoreRuntime.js',
  /function incidentKey/.test(src),
  'EngineCoreRuntime.js must define incidentKey() — the primary taxonomy keying function');

check('TAXONOMY-STRUCT-001', 'engines/EngineCoreRuntime.js',
  /reason/.test(src.slice(src.indexOf('function incidentKey'), src.indexOf('function incidentKey') + 500)),
  'incidentKey() must include reason field — primary taxonomy classifier');

check('TAXONOMY-STRUCT-001', 'engines/EngineCoreRuntime.js',
  /\.name/.test(src.slice(src.indexOf('function incidentKey'), src.indexOf('function incidentKey') + 500)),
  'incidentKey() must include error.name field — distinguishes error categories');

check('TAXONOMY-STRUCT-001', 'engines/EngineCoreRuntime.js',
  /\.message/.test(src.slice(src.indexOf('function incidentKey'), src.indexOf('function incidentKey') + 500)),
  'incidentKey() must include error.message field — distinguishes specific incidents within a category');

check('TAXONOMY-STRUCT-001', 'engines/EngineCoreRuntime.js',
  /phase/.test(src.slice(src.indexOf('function incidentKey'), src.indexOf('function incidentKey') + 500)),
  'incidentKey() must include phase field — identifies which pipeline stage triggered the incident');

check('TAXONOMY-STRUCT-001', 'engines/EngineCoreRuntime.js',
  /priority/.test(src.slice(src.indexOf('function incidentKey'), src.indexOf('function incidentKey') + 500)),
  'incidentKey() must include priority field — identifies the render priority queue context');

// ── RULE-B: enterSafeMode always sets reason before recording incidentKey ─────

const enterSafeModeIdx = src.indexOf('function enterSafeMode') !== -1
  ? src.indexOf('function enterSafeMode')
  : src.indexOf('enterSafeMode');
const enterSafeModeSrc = enterSafeModeIdx !== -1 ? src.slice(enterSafeModeIdx, enterSafeModeIdx + 800) : '';

check('TAXONOMY-SAFE-001', 'engines/EngineCoreRuntime.js',
  /safeMode\.reason\s*=/.test(enterSafeModeSrc),
  'enterSafeMode() must assign state.runtime.safeMode.reason — reason is the primary taxonomy classifier');

check('TAXONOMY-SAFE-001', 'engines/EngineCoreRuntime.js',
  /safeMode\.incidentKey\s*=/.test(enterSafeModeSrc),
  'enterSafeMode() must assign safeMode.incidentKey for deduplication and replay lookup');

// ── RULE-C: lastFailure has the four required fields ─────────────────────────

check('TAXONOMY-FAILURE-001', 'engines/EngineCoreRuntime.js',
  /pipeline\.lastFailure\s*=\s*\{/.test(src) || /pipeline\.lastFailure = {/.test(src),
  'enterSafeMode() must populate pipeline.lastFailure with a structured object');

check('TAXONOMY-FAILURE-001', 'engines/EngineCoreRuntime.js',
  /lastFailure[\s\S]{0,200}reason:/.test(src) && /lastFailure[\s\S]{0,200}incidentKey:/.test(src),
  'pipeline.lastFailure must include reason and incidentKey fields');

check('TAXONOMY-FAILURE-001', 'engines/EngineCoreRuntime.js',
  /lastFailure[\s\S]{0,200}error:/.test(src) && /lastFailure[\s\S]{0,200}timestamp:/.test(src),
  'pipeline.lastFailure must include error and timestamp fields for causal chain analysis');

// ── RULE-D: normalizeError helper extracts consistent fields ──────────────────

check('TAXONOMY-NORMALIZE-001', 'engines/EngineCoreRuntime.js',
  /function normalizeError/.test(src),
  'EngineCoreRuntime.js must define normalizeError() for consistent error field extraction');

check('TAXONOMY-NORMALIZE-001', 'engines/EngineCoreRuntime.js',
  /error\.name/.test(src) && /error\.message/.test(src) && /error\.stack/.test(src),
  'normalizeError() must extract name, message, and stack from the error value');

// ── RULE-E: snapshot includes safeMode block ──────────────────────────────────

check('TAXONOMY-SNAPSHOT-001', 'engines/EngineCoreRuntime.js',
  /safeMode\s*:\s*cloneSerializable\(/.test(src) || /safeMode:/.test(src),
  'buildRuntimeSnapshot() must include safeMode block for incident classification in exported state');

// ── Report ─────────────────────────────────────────────────────────────────────

console.log('── Error Taxonomy Guard (#69) ────────────────────────────────────');
console.log(`   violations found: ${violations.length}`);

if (violations.length > 0) {
  console.error('\n  Violations:');
  for (const v of violations) {
    console.error(`  [${v.rule}] ${v.file}`);
    console.error(`    → ${v.desc}`);
  }
}

if (violations.length === 0) {
  console.log('\n✅ error taxonomy intact — incidentKey captures all five dimensions, lastFailure structured\n');
  process.exit(0);
}

console.error('\n❌ error taxonomy gap — incident classification fields missing or unstructured');
console.error('   Fix: ensure incidentKey includes reason/name/message/phase/priority; lastFailure has all four fields\n');
if (!REPORT) process.exit(1);
