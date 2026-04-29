#!/usr/bin/env node
/**
 * audit/configurational_ssot_guard.mjs
 *
 * Enforces the Configurational SSOT principle:
 *   All ruler/layout/visual constants must derive from engines/RuntimeConfig.js.
 *   No other file may hardcode canonical ruler or layout values.
 *
 * PASS criteria:
 *   - engines/RuntimeConfig.js exists and exports ruler.topPx + ruler.sidePx
 *   - tokens.css --rf-ruler-top and --rf-ruler-side match RuntimeConfig values
 *   - No JS file outside the canonical source hardcodes H_RULER_H, V_TOTAL_W,
 *     V_GUTTER_W, V_TICK_W assignments, or rulerWidth/rulerHeight literals
 *   - No CSS outside tokens.css uses hardcoded ruler px values
 *   - No HTML canvas element has hardcoded width/height attrs for ruler canvases
 *
 * Any line with a trailing comment containing SSOT_ALLOWED is exempt.
 *
 * Usage:  node audit/configurational_ssot_guard.mjs
 * Exit:   0 = PASS,  1 = FAIL
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative, extname, basename } from 'path';
import { fileURLToPath } from 'url';

const ROOT   = fileURLToPath(new URL('..', import.meta.url));
const CANON_JS  = 'engines/RuntimeConfig.js';
const CANON_CSS = 'designer/styles/tokens.css';
const SSOT_ALLOWED = /\/\/.*SSOT_ALLOWED|\/\*.*SSOT_ALLOWED.*\*\//;

// ── Collect results ──────────────────────────────────────────────────────────
const violations = [];
const consumers  = [];
let canonTopPx   = null;
let canonSidePx  = null;
let tokenTopPx   = null;
let tokenSidePx  = null;

function violation(file, line, rule, text) {
  violations.push({ file, line, rule, text: (text || '').trim().slice(0, 120) });
}

// ── Step 1: read canonical JS values ────────────────────────────────────────
const canonPath = join(ROOT, CANON_JS);
if (!existsSync(canonPath)) {
  console.error(`❌ FAIL  Canonical source missing: ${CANON_JS}`);
  process.exit(1);
}

const canonSrc = readFileSync(canonPath, 'utf8');
const topPxM   = canonSrc.match(/topPx\s*:\s*(\d+)/);
const sidePxM  = canonSrc.match(/sidePx\s*:\s*(\d+)/);

if (!topPxM || !sidePxM) {
  console.error(`❌ FAIL  ${CANON_JS} must define ruler.topPx and ruler.sidePx`);
  process.exit(1);
}
canonTopPx  = parseInt(topPxM[1], 10);
canonSidePx = parseInt(sidePxM[1], 10);

// ── Step 2: read CSS token values ────────────────────────────────────────────
const tokensPath = join(ROOT, CANON_CSS);
if (existsSync(tokensPath)) {
  const tokSrc = readFileSync(tokensPath, 'utf8');
  const tTop  = tokSrc.match(/--rf-ruler-top\s*:\s*(\d+)px/);
  const tSide = tokSrc.match(/--rf-ruler-side\s*:\s*(\d+)px/);
  if (tTop)  tokenTopPx  = parseInt(tTop[1], 10);
  if (tSide) tokenSidePx = parseInt(tSide[1], 10);

  if (tokenTopPx !== canonTopPx) {
    violation(CANON_CSS, 0,
      `--rf-ruler-top: ${tokenTopPx}px diverges from RuntimeConfig.ruler.topPx=${canonTopPx}`,
      `--rf-ruler-top: ${tokenTopPx}px`);
  }
  if (tokenSidePx !== canonSidePx) {
    violation(CANON_CSS, 0,
      `--rf-ruler-side: ${tokenSidePx}px diverges from RuntimeConfig.ruler.sidePx=${canonSidePx}`,
      `--rf-ruler-side: ${tokenSidePx}px`);
  }
}

// ── Step 3: walk all project files ───────────────────────────────────────────
function walkDir(dir, cb) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === '__pycache__') continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) walkDir(full, cb);
    else cb(full);
  }
}

// JS patterns forbidden outside canonical source
// Each entry: { re, rule }
const FORBIDDEN_JS = [
  { re: /\bconst\s+H_RULER_H\s*=\s*\d+/,       rule: 'H_RULER_H assigned outside RuntimeConfig' },
  { re: /\bconst\s+V_TOTAL_W\s*=\s*\d+/,        rule: 'V_TOTAL_W assigned outside RuntimeConfig' },
  { re: /\bconst\s+V_GUTTER_W\s*=\s*\d+/,       rule: 'V_GUTTER_W assigned outside RuntimeConfig' },
  { re: /\bconst\s+V_TICK_W\s*=\s*\d+/,         rule: 'V_TICK_W assigned outside RuntimeConfig' },
  { re: /\bRULER_W\s*:\s*\d+/,                  rule: 'RULER_W literal outside RuntimeConfig' },
  { re: /\bRULER_H\s*:\s*\d+/,                  rule: 'RULER_H literal outside RuntimeConfig' },
  { re: /rulerWidth\s*:\s*\d+/,                  rule: 'Hardcoded rulerWidth fallback literal' },
  { re: /rulerHeight\s*:\s*\d+/,                 rule: 'Hardcoded rulerHeight fallback literal' },
  { re: /\bconst\s+cssH\s*=\s*(16|22|24)\s*;/,  rule: 'Hardcoded ruler cssH literal (use RuntimeConfig.ruler.topPx)' },
  { re: /marginBottom\s*[=:]\s*['"](?:16|22)px['"]/,rule: 'Hardcoded ruler marginBottom literal (use RuntimeConfig.ruler.topPx)' },
  { re: /\+\s*(?:16|22)\s*\+\s*['"]px['"]/,     rule: 'Hardcoded ruler px addition in layout' },
];

// CSS patterns forbidden outside tokens.css (must use var(--rf-ruler-*))
const FORBIDDEN_CSS = [
  { re: /^\s*width\s*:\s*22px\s*;/,     rule: 'Hardcoded 22px width (use var(--rf-ruler-side))' },
  { re: /^\s*min-width\s*:\s*22px\s*;/, rule: 'Hardcoded 22px min-width (use var(--rf-ruler-side))' },
  { re: /^\s*max-width\s*:\s*22px\s*;/, rule: 'Hardcoded 22px max-width (use var(--rf-ruler-side))' },
  { re: /^\s*height\s*:\s*(?:16|22)px\s*;/, rule: 'Hardcoded ruler height in CSS (use var(--rf-ruler-top))' },
];

// HTML canvas attr patterns
const FORBIDDEN_HTML = [
  { re: /canvas[^>]+\sheight="(?:16|22)"/, rule: 'Hardcoded canvas height= attr (ruler dimensions set by JS)' },
  { re: /canvas[^>]+\swidth="(?:16|22)"/,  rule: 'Hardcoded canvas width= attr (ruler dimensions set by JS)' },
  { re: /height="(?:16|22)"[^>]*canvas/,   rule: 'Hardcoded canvas height= attr (ruler dimensions set by JS)' },
  { re: /width="(?:16|22)"[^>]*canvas/,    rule: 'Hardcoded canvas width= attr (ruler dimensions set by JS)' },
];

// Directories/files excluded from SSOT enforcement:
//   archive/  — frozen legacy copies; not live code
//   v3 HTML   — separate legacy designer with its own independent constants
const EXCLUDED_PREFIXES = ['archive/', '.git/', 'node_modules/'];
const EXCLUDED_FILES    = ['designer/crystal-reports-designer-v3.html'];

walkDir(ROOT, (filePath) => {
  const rel = relative(ROOT, filePath);
  const ext = extname(filePath).toLowerCase();

  // Skip: this guard itself, canonical source, tokens.css (allowed to have values), node_modules, dist, .git
  if (rel === 'audit/configurational_ssot_guard.mjs') return;
  if (rel === CANON_JS) return;
  if (EXCLUDED_FILES.includes(rel)) return;
  if (EXCLUDED_PREFIXES.some(p => rel.startsWith(p) || rel.includes('/' + p))) return;

  let src;
  try { src = readFileSync(filePath, 'utf8'); } catch { return; }

  if (ext === '.js' || ext === '.mjs') {
    // Track consumers of RuntimeConfig
    if (src.includes('RuntimeConfig') && rel !== CANON_JS) {
      consumers.push(rel);
    }

    // Skip tokens.css, but also skip the canonical source (already excluded above)
    const lines = src.split('\n');
    lines.forEach((line, i) => {
      if (SSOT_ALLOWED.test(line)) return;
      for (const { re, rule } of FORBIDDEN_JS) {
        if (re.test(line)) violation(rel, i + 1, rule, line);
      }
    });
  }

  else if (ext === '.css') {
    // tokens.css is allowed to define the values — only check divergence (done above)
    if (rel === CANON_CSS) return;
    const lines = src.split('\n');
    lines.forEach((line, i) => {
      if (SSOT_ALLOWED.test(line)) return;
      for (const { re, rule } of FORBIDDEN_CSS) {
        if (re.test(line)) violation(rel, i + 1, rule, line);
      }
    });
  }

  else if (ext === '.html') {
    const lines = src.split('\n');
    lines.forEach((line, i) => {
      if (SSOT_ALLOWED.test(line)) return;
      for (const { re, rule } of FORBIDDEN_HTML) {
        if (re.test(line)) violation(rel, i + 1, rule, line);
      }
    });
  }
});

// ── Report ───────────────────────────────────────────────────────────────────
const SEP = '─'.repeat(60);
console.log(`\n${SEP}`);
console.log(`📐 Configurational SSOT Guard`);
console.log(SEP);
console.log(`   Canonical JS   : ${CANON_JS}`);
console.log(`   ruler.topPx    = ${canonTopPx}px   (horizontal ruler height)`);
console.log(`   ruler.sidePx   = ${canonSidePx}px   (vertical ruler width)`);
console.log(`   CSS tokens     : ${CANON_CSS}`);
console.log(`     --rf-ruler-top  = ${tokenTopPx !== null ? tokenTopPx + 'px' : '(not found)'}  ${tokenTopPx === canonTopPx ? '✓' : '✗ DIVERGE'}`);
console.log(`     --rf-ruler-side = ${tokenSidePx !== null ? tokenSidePx + 'px' : '(not found)'}  ${tokenSidePx === canonSidePx ? '✓' : '✗ DIVERGE'}`);

console.log(`\n   Consumers of RuntimeConfig (${consumers.length}):`);
for (const c of consumers) console.log(`      · ${c}`);

console.log(`\n   Prohibited duplicates found: ${violations.length}`);

if (violations.length > 0) {
  console.log('\n❌ VIOLATIONS:');
  for (const v of violations) {
    const loc = v.line > 0 ? `${v.file}:${v.line}` : v.file;
    console.log(`   ${loc}`);
    console.log(`      rule : ${v.rule}`);
    if (v.text) console.log(`      code : ${v.text}`);
  }
  console.log(`\n${SEP}`);
  console.log(`❌ FAIL — ${violations.length} configurational SSOT violation(s).`);
  console.log(`   Fix: derive all ruler/layout constants from engines/RuntimeConfig.js`);
  console.log(`   OR add // SSOT_ALLOWED comment on the line if the duplicate is intentional.`);
  console.log(SEP);
  process.exit(1);
}

console.log(`\n${SEP}`);
console.log(`✅ PASS — Configurational SSOT intact. All ruler/layout constants are canonical.`);
console.log(SEP);
process.exit(0);
