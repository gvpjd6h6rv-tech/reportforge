#!/usr/bin/env node
'use strict';
/**
 * shadow_dom_isolation_guard.mjs — Principle #48 / #49 Shadow DOM Isolation
 *
 * Verifies that invasive body-injecting overlay engines use Shadow DOM
 * encapsulation instead of exposing raw DOM IDs/classes to the global cascade.
 *
 * RULE-A (SHADOW-HOST-001): Required files must call attachShadow().
 *   Files listed in REQUIRED_SHADOW are expected to contain:
 *     host.attachShadow({ mode: 'open' })
 *   A file that injects UI into document.body WITHOUT a shadow root bleeds
 *   its CSS into the global cascade and is flagged.
 *
 * RULE-B (SHADOW-QUERY-001): Shadow-DOM files must not use document.getElementById
 *   or document.querySelector to reach elements that belong to their own shadow
 *   tree. Internal queries must go through the shadow root.
 *   Heuristic: look for document.getElementById/querySelector where the ID/class
 *   starts with a known shadow-internal prefix for that file.
 *
 * RULE-C (SHADOW-BODY-001): Non-exempt overlay engines that call document.body.appendChild
 *   must have a corresponding attachShadow() in the same file. Engines that inject
 *   content but skip the shadow boundary are flagged.
 *
 * Exempt from RULE-C (inline-style or non-visual patterns):
 *   - FormulaEditorDialog.js  (scoped inline styles, modal overlay)
 *   - AlignmentGuides.js      (SVG overlay, no cascade bleed risk)
 *   - rf-command-registry files (display:none, not visual)
 *
 * Usage:
 *   node audit/shadow_dom_isolation_guard.mjs          # fail on violations
 *   node audit/shadow_dom_isolation_guard.mjs --report # report only
 *
 * Exit codes:
 *   0 — all overlays properly shadow-isolated
 *   1 — violations found (unless --report)
 */

import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT    = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENGINES = path.join(ROOT, 'engines');
const ARGS    = process.argv.slice(2);
const REPORT  = ARGS.includes('--report');

// ── Configuration ─────────────────────────────────────────────────────────────

// Files that MUST use attachShadow (hard requirement).
const REQUIRED_SHADOW = [
  'DebugOverlay.js',
  'DebugChannelsPanel.js',
];

// Files exempt from RULE-C body-injection check.
const BODY_INJECT_EXEMPT = new Set([
  'FormulaEditorDialog.js',
  'AlignmentGuides.js',
  'RuntimeBootstrap.js',    // injects #rf-command-registry (display:none, non-visual)
]);

// Shadow-internal ID/class prefixes per file (for RULE-B).
// Any document.getElementById/querySelector call in these files that references
// these prefixes is a violation (should go through shadow root instead).
// Host element IDs (ending in -host) are exempt — they live in the regular DOM.
const SHADOW_INTERNAL_PREFIXES = {
  'DebugOverlay.js':       ['rf-debug-overlay-head', 'rf-debug-overlay-frame', 'rf-debug-overlay-layers', 'rf-debug-layer'],
  'DebugChannelsPanel.js': ['rf-debug-panel-head', 'rf-debug-presets', 'rf-debug-channels'],
};

// ── Patterns ──────────────────────────────────────────────────────────────────

const ATTACH_SHADOW     = /attachShadow\s*\(\s*\{/;
const BODY_APPEND       = /document\.body\.(appendChild|insertBefore|append)\s*\(/;
const DOC_QUERY_ID      = /document\.getElementById\s*\(\s*['"`]([^'"`]+)['"`]\)/g;
const DOC_QUERY_SEL     = /document\.querySelector\s*\(\s*['"`][#.]?([^'"`]+)['"`]\)/g;

// ── Scan ──────────────────────────────────────────────────────────────────────

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

  // RULE-A: required files must have attachShadow
  if (REQUIRED_SHADOW.includes(name)) {
    if (!ATTACH_SHADOW.test(src)) {
      violations.push({
        rule: 'SHADOW-HOST-001',
        file: `engines/${name}`,
        line: 1,
        text: '(whole file)',
        desc: `required shadow root missing — ${name} must call attachShadow({mode:'open'})`,
      });
    }
  }

  // RULE-B: shadow files must not use document.getElementById/querySelector
  //         for their own internal elements
  const internalPrefixes = SHADOW_INTERNAL_PREFIXES[name];
  if (internalPrefixes && ATTACH_SHADOW.test(src)) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let m;

      DOC_QUERY_ID.lastIndex = 0;
      while ((m = DOC_QUERY_ID.exec(line)) !== null) {
        if (internalPrefixes.some(p => m[1].startsWith(p))) {
          violations.push({
            rule: 'SHADOW-QUERY-001',
            file: `engines/${name}`,
            line: i + 1,
            text: line.trim().slice(0, 100),
            desc: `document.getElementById('${m[1]}') reaches into own shadow tree — use shadow.getElementById()`,
          });
        }
      }

      DOC_QUERY_SEL.lastIndex = 0;
      while ((m = DOC_QUERY_SEL.exec(line)) !== null) {
        if (internalPrefixes.some(p => m[1].startsWith(p) || m[1].startsWith(p.replace(/^[#.]/, '')))) {
          violations.push({
            rule: 'SHADOW-QUERY-001',
            file: `engines/${name}`,
            line: i + 1,
            text: line.trim().slice(0, 100),
            desc: `document.querySelector('${m[1]}') reaches into own shadow tree — use shadow.querySelector()`,
          });
        }
      }
    }
  }

  // RULE-C: non-exempt files that append to body must also have attachShadow
  if (!BODY_INJECT_EXEMPT.has(name) && !REQUIRED_SHADOW.includes(name)) {
    if (BODY_APPEND.test(src) && !ATTACH_SHADOW.test(src)) {
      // Only flag files that inject visual content (heuristic: also write innerHTML or createElement)
      if (/\.innerHTML\s*=|createElement\s*\(/.test(src)) {
        const lineNo = lines.findIndex(l => BODY_APPEND.test(l)) + 1;
        violations.push({
          rule: 'SHADOW-BODY-001',
          file: `engines/${name}`,
          line: lineNo,
          text: lines[lineNo - 1]?.trim().slice(0, 100) || '',
          desc: 'document.body.appendChild without shadow root — overlay may bleed CSS into global cascade',
        });
      }
    }
  }
}

// ── Report ─────────────────────────────────────────────────────────────────────

console.log('── Shadow DOM Isolation Guard (#48/#49) ─────────────────────────');
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
  console.log('\n✅ all invasive overlays use Shadow DOM encapsulation\n');
  process.exit(0);
}

console.error('\n❌ shadow DOM isolation gap — overlay CSS may bleed into global cascade');
console.error('   Fix: call attachShadow({mode:"open"}) and move CSS into shadow root');
console.error('   Principle #48: Shadow DOM selectivo / #49: Encapsulación de features invasivas\n');
if (!REPORT) process.exit(1);
