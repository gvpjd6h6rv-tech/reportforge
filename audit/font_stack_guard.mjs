#!/usr/bin/env node
'use strict';
/**
 * font_stack_guard.mjs — Linux-safe font fallback
 *
 * Arial/Helvetica are not guaranteed to exist on a Linux host (no
 * msttcorefonts by default). Any code path that paints a literal
 * `font-family: Arial` (or Helvetica) onto the DOM — instead of routing the
 * stored font name through FontStack.resolveCssFontFamily — silently
 * depends on whatever font the OS substitutes, producing non-deterministic
 * rendering and snapshot drift across machines.
 *
 * RULE: outside of engines/FontStack.js itself, no engine file may assign
 * `style.fontFamily = '...Arial...'` or interpolate `font-family:${...}`
 * with a bare 'Arial'/'Helvetica' default (`x || 'Arial'`, template literals
 * ending in a literal Arial/Helvetica fallback). Stored data values (theme
 * JSON, DocumentState defaults, the RuntimeData FONTS picker list) are
 * exempt — those are user-facing font *names*, not rendered CSS.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENGINES_DIR = path.join(ROOT, 'engines');
const REPORT = process.argv.includes('--report');

const EXEMPT_FILES = new Set(['FontStack.js', 'RuntimeData.js', 'DocumentState.js']);

const BARE_FONT_PATTERNS = [
  /fontFamily\s*=\s*[^;]*\|\|\s*['"]Arial['"]/,
  /fontFamily\s*=\s*[^;]*\|\|\s*['"]Helvetica['"]/,
];

// Catches: `font-family:${el.fontFamily}` (no resolver call) AND
// `font-family: Arial` / `font-family:Arial` literals.
const TEMPLATE_BYPASS = /font-family:\$\{(?!.*FontStack\.resolveCssFontFamily)[^}]*\}/;
const LITERAL_ARIAL = /font-family\s*:\s*['"]?Arial\b/i;
const LITERAL_HELVETICA = /font-family\s*:\s*['"]?Helvetica\b/i;

function listEngineFiles() {
  return fs.readdirSync(ENGINES_DIR).filter((f) => f.endsWith('.js'));
}

const violations = [];

for (const file of listEngineFiles()) {
  if (EXEMPT_FILES.has(file)) continue;
  const full = path.join(ENGINES_DIR, file);
  const text = fs.readFileSync(full, 'utf8');

  for (const pattern of BARE_FONT_PATTERNS) {
    if (pattern.test(text)) {
      violations.push({ file, desc: `bare Arial/Helvetica default outside FontStack: ${pattern}` });
    }
  }
  if (TEMPLATE_BYPASS.test(text)) {
    violations.push({ file, desc: 'font-family:${...} template interpolation bypasses FontStack.resolveCssFontFamily' });
  }
  if (LITERAL_ARIAL.test(text)) {
    violations.push({ file, desc: 'literal font-family: Arial without going through FontStack' });
  }
  if (LITERAL_HELVETICA.test(text)) {
    violations.push({ file, desc: 'literal font-family: Helvetica without going through FontStack' });
  }
}

console.log('── Font Stack Guard (Linux-safe fallback) ──────────────────────────');
console.log(`   violations found: ${violations.length}`);

if (violations.length > 0) {
  console.error('\n  Violations:');
  for (const v of violations) {
    console.error(`  ${v.file}`);
    console.error(`    → ${v.desc}`);
  }
}

if (violations.length === 0) {
  console.log('\n✅ no bare Arial/Helvetica default outside FontStack.resolveCssFontFamily\n');
  process.exit(0);
}

console.error('\n❌ font fallback gap — route font-family through FontStack.resolveCssFontFamily\n');
if (!REPORT) process.exit(1);
