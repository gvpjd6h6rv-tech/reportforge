#!/usr/bin/env node
'use strict';
/**
 * writer_conflict_guard.mjs — Principles #54 / #55 Writer Tracking & Conflict Detection
 *
 * Static analysis verifying that guarded DOM targets are only mutated by their
 * canonical owner file. A "write operation" means any of:
 *   .innerHTML =, .appendChild(), .insertBefore(), .replaceChildren()
 * on a variable that was obtained by getElementById/querySelector of the guarded ID.
 *
 * Additionally checks that:
 *   RULE-A (WRITER-OWNER-001): Non-owner files do not write to guarded DOM targets.
 *   RULE-B (WRITER-CLAIM-001): setOwner calls use only the declared canonical owner name.
 *     Any setOwner('canvas', <something-other-than-CanvasLayoutEngine>) is a conflict.
 *   RULE-C (WRITER-DIRECT-001): Non-owner files do not call innerHTML/appendChild on
 *     a variable holding a guarded target element (variable-alias detection, heuristic).
 *
 * Canonical ownership table (ground truth):
 *   sections-layer    → SectionEngine.js
 *   handles-layer     → SelectionOverlay.js
 *   preview-content   → PreviewEngineRenderer.js
 *   canvas owner slot → CanvasLayoutEngine (via RF.RuntimeServices.setOwner)
 *   preview owner slot→ PreviewEngineV19   (via RF.RuntimeServices.setOwner)
 *   selection owner   → SelectionEngine    (via RF.RuntimeServices.setOwner)
 *
 * Usage:
 *   node audit/writer_conflict_guard.mjs          # fail on violations
 *   node audit/writer_conflict_guard.mjs --report # report only
 *
 * Exit codes:
 *   0 — no writer conflicts detected
 *   1 — violations found (unless --report)
 */

import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT    = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENGINES = path.join(ROOT, 'engines');
const ARGS    = process.argv.slice(2);
const REPORT  = ARGS.includes('--report');

// ── Ownership table ────────────────────────────────────────────────────────────

// DOM target IDs and their canonical sole-writer file.
const DOM_OWNERS = {
  'sections-layer':  'SectionEngine.js',
  'handles-layer':   'SelectionOverlay.js',
  'preview-content': 'PreviewEngineRenderer.js',
};

// setOwner('kind', 'value') — expected canonical values.
const OWNER_SLOT_VALUES = {
  canvas:    'CanvasLayoutEngine',
  preview:   'PreviewEngineV19',
  selection: 'SelectionEngine',
};

// Files that may legitimately call setOwner (boot sequence only).
const SET_OWNER_ALLOWED = new Set([
  'SectionEngine.js',       // _canonicalCanvasWriter guard
  'ZoomEngine.js',          // _canonicalPreviewWriter guard
  'DeferredBootstrap.js',   // deferred ownership registration
  'RuntimeBootstrap.js',    // early boot
]);

// ── Patterns ───────────────────────────────────────────────────────────────────

// Match getElementById / querySelector fetching a guarded target on the same line.
// e.g.: document.getElementById('sections-layer')
//        const x = document.getElementById('handles-layer')
const ID_FETCH = (id) =>
  new RegExp(`getElementById\\s*\\(\\s*['"\`]${id}['"\`]\\s*\\)|querySelector\\s*\\(\\s*['"\`]#${id}['"\`]\\s*\\)`);

// Write operations that mutate DOM structure.
const WRITE_OPS = /\.innerHTML\s*=(?!=)|\.appendChild\s*\(|\.insertBefore\s*\(|\.replaceChildren\s*\(/;

// setOwner call: setOwner('kind', 'value')
const SET_OWNER_CALL = /\bsetOwner\s*\(\s*['"`](\w+)['"`]\s*,\s*['"`]([^'"`]+)['"`]\s*\)/g;

// ── Scan ───────────────────────────────────────────────────────────────────────

const violations = [];
const files = fs.readdirSync(ENGINES)
  .filter(f => f.endsWith('.js'))
  .map(f => ({
    name: f,
    abs:  path.join(ENGINES, f),
    src:  fs.readFileSync(path.join(ENGINES, f), 'utf8'),
  }));

for (const { name, src } of files) {
  const lines = src.split('\n');

  // RULE-A / RULE-C: guarded DOM targets only written by their canonical owner.
  for (const [targetId, owner] of Object.entries(DOM_OWNERS)) {
    if (name === owner) continue; // canonical owner is always allowed

    const fetchPat = ID_FETCH(targetId);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!fetchPat.test(line)) continue;

      // The line fetches the guarded target. Check if it also immediately writes to it,
      // OR look at the next 3 lines for a write operation on the same fetched variable.
      const window = lines.slice(i, Math.min(i + 4, lines.length)).join(' ');
      if (WRITE_OPS.test(window)) {
        violations.push({
          rule: 'WRITER-OWNER-001',
          file: `engines/${name}`,
          line: i + 1,
          text: line.trim().slice(0, 100),
          desc: `non-owner access to '${targetId}' with write op — only ${owner} may mutate this target`,
        });
      }
    }
  }

  // RULE-B: setOwner must use the canonical value for each slot.
  SET_OWNER_CALL.lastIndex = 0;
  let m;
  while ((m = SET_OWNER_CALL.exec(src)) !== null) {
    const kind  = m[1];
    const value = m[2];
    const lineNo = src.slice(0, m.index).split('\n').length;

    // Check the value is the canonical one.
    if (Object.prototype.hasOwnProperty.call(OWNER_SLOT_VALUES, kind)) {
      const expected = OWNER_SLOT_VALUES[kind];
      if (value !== expected) {
        violations.push({
          rule: 'WRITER-CLAIM-001',
          file: `engines/${name}`,
          line: lineNo,
          text: m[0].trim(),
          desc: `setOwner('${kind}', '${value}') — expected canonical owner '${expected}': writer conflict`,
        });
      }
    }

    // Check caller is in the allowed boot-sequence set.
    if (!SET_OWNER_ALLOWED.has(name)) {
      violations.push({
        rule: 'WRITER-CLAIM-001',
        file: `engines/${name}`,
        line: lineNo,
        text: m[0].trim(),
        desc: `setOwner called from non-boot file '${name}' — only boot/canonical-writer files may claim owner slots`,
      });
    }
  }
}

// ── Report ─────────────────────────────────────────────────────────────────────

console.log('── Writer Conflict Guard (#54/#55) ──────────────────────────────');
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
  console.log('\n✅ no writer conflicts — all guarded targets written by sole canonical owner\n');
  process.exit(0);
}

console.error('\n❌ writer conflict — guarded DOM target accessed by non-owner or non-canonical claim');
console.error('   Fix: route writes through the canonical writer (CanvasLayoutEngine / SelectionOverlay / PreviewEngineRenderer)');
console.error('   Runtime detection: RF.RuntimeServices.setOwner() will emit rf:writer-conflict + enterSafeMode on conflict\n');
if (!REPORT) process.exit(1);
