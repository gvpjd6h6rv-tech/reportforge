#!/usr/bin/env node
'use strict';
/**
 * incident_replay_guard.mjs — Principle #70 Incident Replay
 *
 * Verifies that the runtime snapshot produced by exportRuntimeState() is
 * structured for incident replay: it contains enough state to reproduce the
 * conditions of a failure without the browser session that triggered it.
 *
 * RULE-A (REPLAY-SNAPSHOT-001): EngineCoreRuntime.js must define
 *   buildRuntimeSnapshot() (or exportRuntimeState()) that includes a version
 *   string, timestamp, safeMode block, pipeline block, and document snapshot
 *   (sections/elements counts or arrays). These five components are the
 *   minimum replay payload.
 *
 * RULE-B (REPLAY-SERIAL-001): The snapshot must be built using
 *   cloneSerializable() — ensuring JSON-roundtrip safety before the snapshot
 *   is stored or transmitted. A non-serializable snapshot cannot be replayed.
 *
 * RULE-C (REPLAY-DEDUP-001): recoverFromPipelineFailure() must check
 *   safeMode.recoveryAttempted before re-entering safe mode — replay must be
 *   idempotent: re-delivering the same incident must not stack recovery calls.
 *
 * RULE-D (REPLAY-EXPORT-001): exportRuntimeState() must be present in the
 *   returned API object so callers can trigger a snapshot at any point — not
 *   only during failures.
 *
 * RULE-E (REPLAY-EVENT-001): The runtime must emit an rf:runtime-recovery
 *   event after a successful recovery attempt — so replay harnesses can
 *   detect that the incident was handled and subscribe to results.
 *
 * Usage:
 *   node audit/incident_replay_guard.mjs          # fail on violations
 *   node audit/incident_replay_guard.mjs --report # report only
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

// Narrow the snapshot builder for targeted checks
const snapshotBuilderIdx = src.indexOf('buildRuntimeSnapshot');
const snapshotSrc = snapshotBuilderIdx !== -1
  ? src.slice(snapshotBuilderIdx, snapshotBuilderIdx + 1200)
  : '';

// ── RULE-A: Snapshot includes the five replay components ─────────────────────

check('REPLAY-SNAPSHOT-001', 'engines/EngineCoreRuntime.js',
  /buildRuntimeSnapshot|exportRuntimeState/.test(src),
  'EngineCoreRuntime.js must define buildRuntimeSnapshot() or exportRuntimeState()');

check('REPLAY-SNAPSHOT-001', 'engines/EngineCoreRuntime.js',
  /version\s*:/.test(snapshotSrc),
  'Runtime snapshot must include a version field — required for forward-compatibility in replay');

check('REPLAY-SNAPSHOT-001', 'engines/EngineCoreRuntime.js',
  /timestamp\s*:/.test(snapshotSrc),
  'Runtime snapshot must include a timestamp field — required to order incidents in replay');

check('REPLAY-SNAPSHOT-001', 'engines/EngineCoreRuntime.js',
  /safeMode/.test(snapshotSrc),
  'Runtime snapshot must include safeMode block — incident state required for replay classification');

check('REPLAY-SNAPSHOT-001', 'engines/EngineCoreRuntime.js',
  /pipeline/.test(snapshotSrc),
  'Runtime snapshot must include pipeline block — pipeline state required for replay context');

check('REPLAY-SNAPSHOT-001', 'engines/EngineCoreRuntime.js',
  /sectionCount|sections/.test(snapshotSrc),
  'Runtime snapshot must include section/element count or arrays — document state required for replay');

// ── RULE-B: Snapshot uses cloneSerializable ───────────────────────────────────

check('REPLAY-SERIAL-001', 'engines/EngineCoreRuntime.js',
  /cloneSerializable/.test(snapshotSrc),
  'buildRuntimeSnapshot() must use cloneSerializable() — ensures JSON-roundtrip safety for replay storage');

// ── RULE-C: Recovery is idempotent (recoveryAttempted guard) ─────────────────

check('REPLAY-DEDUP-001', 'engines/EngineCoreRuntime.js',
  /recoveryAttempted/.test(src),
  'recoverFromPipelineFailure() must check safeMode.recoveryAttempted — replay must not stack recovery calls');

const recoveryFnIdx = src.indexOf('recoverFromPipelineFailure');
const recoverySrc = recoveryFnIdx !== -1 ? src.slice(recoveryFnIdx, recoveryFnIdx + 600) : '';
check('REPLAY-DEDUP-001', 'engines/EngineCoreRuntime.js',
  /recoveryAttempted/.test(recoverySrc),
  'recoverFromPipelineFailure() must short-circuit when recoveryAttempted is already true');

// ── RULE-D: exportRuntimeState is in the return object ───────────────────────

const returnIdx = src.lastIndexOf('return {');
const returnSrc = returnIdx !== -1 ? src.slice(returnIdx, returnIdx + 600) : '';
check('REPLAY-EXPORT-001', 'engines/EngineCoreRuntime.js',
  /exportRuntimeState/.test(returnSrc),
  'EngineCoreRuntime return object must expose exportRuntimeState so callers can snapshot on demand');

// ── RULE-E: rf:runtime-recovery event emitted on recovery ────────────────────

check('REPLAY-EVENT-001', 'engines/EngineCoreRuntime.js',
  /rf:runtime-recovery/.test(src),
  "EngineCoreRuntime must emit 'rf:runtime-recovery' event after successful recovery — replay harnesses need it");

// ── Report ─────────────────────────────────────────────────────────────────────

console.log('── Incident Replay Guard (#70) ───────────────────────────────────');
console.log(`   violations found: ${violations.length}`);

if (violations.length > 0) {
  console.error('\n  Violations:');
  for (const v of violations) {
    console.error(`  [${v.rule}] ${v.file}`);
    console.error(`    → ${v.desc}`);
  }
}

if (violations.length === 0) {
  console.log('\n✅ incident replay intact — snapshot complete, serializable, recovery idempotent\n');
  process.exit(0);
}

console.error('\n❌ incident replay gap — snapshot missing fields or recovery not idempotent');
console.error('   Fix: ensure buildRuntimeSnapshot includes version/timestamp/safeMode/pipeline/doc; add recoveryAttempted guard\n');
if (!REPORT) process.exit(1);
