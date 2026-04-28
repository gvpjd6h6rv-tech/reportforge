#!/usr/bin/env node
'use strict';
/**
 * polling_relapse_guard.mjs — Principle #59 Polling Relapse Detection
 *
 * Detects two anti-patterns that represent a relapse from event-driven to polling:
 *
 *   RULE-A (POLL-SELF-001): Self-calling setTimeout — a function that schedules
 *   itself via setTimeout creates an infinite polling loop. This is the canonical
 *   "ready→blocked relapse": code that was event-driven regresses to busy-polling
 *   because the author didn't know about the appropriate event or RenderScheduler
 *   hook. Examples:
 *     function tick() { ...; setTimeout(tick, 100); }
 *     const loop = () => { ...; setTimeout(loop, 50); };
 *     (function poll() { ...; setTimeout(poll, 200); })();
 *
 *   RULE-B (POLL-BUSY-001): Synchronous busy-wait — a while/do-while loop that
 *   reads DOM state or DS state as a termination condition. These freeze the UI
 *   thread and are always a symptom of missing event/observer wiring.
 *
 *   RULE-C (POLL-INTERVAL-001): Unguarded setInterval — covered in detail by
 *   reset_stability_guard.mjs; flagged here as a companion check for completeness.
 *   Only fires if reset_stability_guard is absent or not run.
 *
 * Allowed patterns (not flagged):
 *   - setTimeout(fn, 0) or setTimeout(fn, N) where fn is an arrow literal that
 *     does NOT reference the enclosing named function (one-shot deferred microtask)
 *   - Single-shot setTimeout for focus/layout defer (PropertiesEngine pattern)
 *   - RenderScheduler.post() — the canonical scheduling mechanism
 *
 * Usage:
 *   node audit/polling_relapse_guard.mjs          # scan engines/
 *   node audit/polling_relapse_guard.mjs --report # report only, no exit 1
 *
 * Exit codes:
 *   0 — no polling relapses detected
 *   1 — violations found (unless --report)
 */

import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT    = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENGINES = path.join(ROOT, 'engines');
const ARGS    = process.argv.slice(2);
const REPORT  = ARGS.includes('--report');

// ── Patterns ──────────────────────────────────────────────────────────────────

// Self-calling setTimeout detection:
// Match: function NAME(...) { ... setTimeout(NAME, ...
// Match: const/let NAME = ... => { ... setTimeout(NAME, ...
// Match: (function NAME() { ... setTimeout(NAME, ...
// We extract all function names from the file and check if any setTimeout
// call inside their body refers back to the same name.

// Simple heuristic: find named functions, then check if the file contains
// setTimeout(<same-name> within ~20 lines of the function declaration.
// Implemented as: find all setTimeout(X, N) calls where X is a non-arrow identifier
// (not a literal arrow), then check if X matches a function name in the file.

const NAMED_FN_DECL = /function\s+(\w+)\s*\(/g;
const NAMED_FN_EXPR = /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:function|\()/g;
// setTimeout call with a reference (not an inline arrow)
const SETTIMEOUT_REF = /setTimeout\s*\(\s*(\w+)\s*[,)]/g;

// Busy-wait: while/do-while reading DOM or DS
const BUSY_WAIT = /\bwhile\s*\([^)]*(?:document\.|DS\.|window\.)\w/;

// Unguarded setInterval (companion — same pattern as reset_stability_guard)
const SET_INTERVAL_CALL   = /\bsetInterval\s*\(/;
const SET_INTERVAL_STORED = /(?:const|let|var|window\.\w+|this\.\w+|\w+)\s*=\s*setInterval\s*\(/;
const TEARDOWN_EXPORT     = /(?:window\.|exports\.|module\.exports\b)[\w.]*(?:destroy|teardown|cleanup|stop)\b/i;

// ── Scan ──────────────────────────────────────────────────────────────────────

const violations = [];
const files = fs.readdirSync(ENGINES)
  .filter(f => f.endsWith('.js'))
  .map(f => ({ name: f, abs: path.join(ENGINES, f), src: fs.readFileSync(path.join(ENGINES, f), 'utf8') }));

for (const { name, src } of files) {
  // Collect all named function identifiers in this file
  const fnNames = new Set();
  for (const re of [NAMED_FN_DECL, NAMED_FN_EXPR]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src)) !== null) fnNames.add(m[1]);
  }

  // RULE-A: find setTimeout(X) where X is a declared function name
  SETTIMEOUT_REF.lastIndex = 0;
  let m;
  while ((m = SETTIMEOUT_REF.exec(src)) !== null) {
    const ref = m[1];
    if (fnNames.has(ref)) {
      // Get line number
      const lineNo = src.slice(0, m.index).split('\n').length;
      violations.push({
        rule: 'POLL-SELF-001',
        file: `engines/${name}`,
        line: lineNo,
        text: m[0].trim(),
        desc: `self-calling setTimeout(${ref}) — polling loop relapse`,
      });
    }
  }

  // RULE-B: synchronous busy-wait reading DOM or DS
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (BUSY_WAIT.test(lines[i])) {
      violations.push({
        rule: 'POLL-BUSY-001',
        file: `engines/${name}`,
        line: i + 1,
        text: lines[i].trim().slice(0, 100),
        desc: 'synchronous busy-wait reading DOM/DS — should use event or MutationObserver',
      });
    }
  }

  // RULE-C: unguarded setInterval (companion to reset_stability_guard)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!SET_INTERVAL_CALL.test(line)) continue;
    if (SET_INTERVAL_STORED.test(line)) continue;
    if (TEARDOWN_EXPORT.test(src)) continue;
    violations.push({
      rule: 'POLL-INTERVAL-001',
      file: `engines/${name}`,
      line: i + 1,
      text: line.trim().slice(0, 100),
      desc: 'unguarded setInterval — handle not stored, no teardown export (zombie timer)',
    });
  }
}

// ── Report ────────────────────────────────────────────────────────────────────

console.log('── Polling Relapse Guard (#59) ───────────────────────────────');
console.log(`   engines scanned:  ${files.length}`);
console.log(`   violations found: ${violations.length}`);

if (violations.length > 0) {
  console.error('\n  Violations:');
  for (const v of violations) {
    console.error(`  [${v.rule}] ${v.file}:${v.line}`);
    console.error(`    ${v.text}`);
    console.error(`    → ${v.desc}`);
  }
}

if (violations.length === 0) {
  console.log('\n✅ no polling relapses, busy-waits, or zombie timers detected\n');
  process.exit(0);
}

console.error('\n❌ polling relapse detected — engine regressed from event-driven to polling');
console.error('   Fix: use RenderScheduler.post(), addEventListener, or MutationObserver');
console.error('   Principle #59: Polling Relapse Detection.\n');
if (!REPORT) process.exit(1);
