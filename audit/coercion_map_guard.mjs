/**
 * coercion_map_guard.mjs — Declarative coercion map integrity guard.
 *
 * Enforces that type coercion stays centralized in canonical owners.
 * No module may define its own _to_num / _to_str / _to_date equivalents
 * or perform raw float/datetime conversions outside the authorized set.
 *
 * Canonical owners (Python):
 *   - type_coercion.py        — authoritative coercion functions
 *   - coercion_map.py         — declarative COERCION_MAP + coerce() entry point
 *   - cr_functions_shared.py  — pre-existing shared helpers for cr_functions_* layer
 *
 * Rules:
 *   COERCE-OWNER-001  No non-owner defines def _to_num / def _to_str / def _to_date
 *   COERCE-INLINE-001 No non-owner contains raw float(v.replace(",","")) or float(str(v).replace) pattern
 *   COERCE-STRPTIME-001 No non-owner calls datetime.strptime directly
 *   COERCE-MAP-001    coercion_map.py exports COERCION_MAP and coerce()
 *   COERCE-LOGGER-001 coercion_logger.py exports CoercionLogger and coercion_logger singleton
 */

import fs from 'fs';
import path from 'path';

const violations = [];
const EXPR_DIR = 'reportforge/core/render/expressions';

// Canonical owners — may define raw conversion logic
const CANONICAL_OWNERS = new Set([
  'type_coercion.py',
  'coercion_map.py',
  'cr_functions_shared.py',
  'coercion_logger.py',
]);

function check(rule, file, condition, desc) {
  if (!condition) violations.push(`  ${rule}  [${file}]  ${desc}`);
}

function read(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return ''; }
}

// ── Gather all Python files in expressions dir ────────────────────────────────
const allPyFiles = fs.readdirSync(EXPR_DIR)
  .filter(f => f.endsWith('.py') && !f.startsWith('__'));

const nonOwnerFiles = allPyFiles.filter(f => !CANONICAL_OWNERS.has(f));

// ── COERCE-OWNER-001: no non-owner defines module-level _to_num/_to_str/_to_date
// Only checks for module-level (unindented) function definitions; class methods are exempt.
for (const fname of nonOwnerFiles) {
  const src = read(path.join(EXPR_DIR, fname));
  // ^def at line-start (no indentation) = module-level function
  const definesModuleFn = /^def _to_num\b|^def _to_str\b|^def _to_date\b|^def _to_datetime\b/m.test(src);
  check(
    'COERCE-OWNER-001',
    fname,
    !definesModuleFn,
    `must not define module-level _to_num/_to_str/_to_date/_to_datetime — import from cr_functions_shared or type_coercion`,
  );
}

// ── COERCE-INLINE-001: no non-owner has raw float(...replace(",","")) ─────────
// Pattern: float(str(...).replace(",","")) or float(v.replace(",",""))
const RAW_FLOAT_RE = /float\s*\(\s*str\s*\([^)]+\)\s*\.replace\s*\(\s*["'],\s*["']\s*\)|float\s*\([^)]+\.replace\s*\(\s*["'],\s*["']\s*\)/;

for (const fname of nonOwnerFiles) {
  const src = read(path.join(EXPR_DIR, fname));
  check(
    'COERCE-INLINE-001',
    fname,
    !RAW_FLOAT_RE.test(src),
    `must not inline float(...replace(",","")) — use to_num() from type_coercion or _to_num from cr_functions_shared`,
  );
}

// ── COERCE-STRPTIME-001: no non-owner calls datetime.strptime for coercion ────
// Exception: predicate/validation files may use strptime to test parseability (fn_isdate etc.)
const STRPTIME_VALIDATION_ALLOWED = new Set(['cr_functions_predicates.py']);

for (const fname of nonOwnerFiles) {
  if (STRPTIME_VALIDATION_ALLOWED.has(fname)) continue;
  const src = read(path.join(EXPR_DIR, fname));
  check(
    'COERCE-STRPTIME-001',
    fname,
    !src.includes('datetime.strptime'),
    `must not call datetime.strptime directly — use parse_date() from type_coercion or _to_date from cr_functions_shared`,
  );
}

// ── COERCE-MAP-001: coercion_map.py exports COERCION_MAP and coerce() ─────────
{
  const src = read(path.join(EXPR_DIR, 'coercion_map.py'));
  check('COERCE-MAP-001', 'coercion_map.py',
    src.includes('COERCION_MAP') && src.includes('def coerce('),
    'must define COERCION_MAP dict and coerce() entry point');
  check('COERCE-MAP-001', 'coercion_map.py',
    src.includes('"number"') && src.includes('"date"') && src.includes('"string"'),
    'COERCION_MAP must contain "number", "date", "string" canonical types');
  check('COERCE-MAP-001', 'coercion_map.py',
    src.includes('KNOWN_FORMATS'),
    'must define KNOWN_FORMATS frozenset');
}

// ── COERCE-LOGGER-001: coercion_logger.py exports CoercionLogger singleton ────
{
  const src = read(path.join(EXPR_DIR, 'coercion_logger.py'));
  check('COERCE-LOGGER-001', 'coercion_logger.py',
    src.includes('class CoercionLogger'),
    'must define CoercionLogger class');
  check('COERCE-LOGGER-001', 'coercion_logger.py',
    src.includes('coercion_logger = CoercionLogger.get()'),
    'must export module-level singleton: coercion_logger = CoercionLogger.get()');
  check('COERCE-LOGGER-001', 'coercion_logger.py',
    src.includes('class CoercionEvent'),
    'must define CoercionEvent dataclass');
  check('COERCE-LOGGER-001', 'coercion_logger.py',
    src.includes('def record_mismatch') && src.includes('def enable') && src.includes('def disable'),
    'CoercionLogger must expose record_mismatch(), enable(), disable()');
}

// ── Report ─────────────────────────────────────────────────────────────────────
const label = 'coercion_map_guard';
const colW = 60;
console.log(`\n${'─'.repeat(colW)}`);
console.log(` ${label}`);
console.log(`${'─'.repeat(colW)}`);

if (violations.length === 0) {
  console.log(` violations found:        0`);
  console.log(`${'─'.repeat(colW)}\n`);
  process.exit(0);
} else {
  violations.forEach(v => console.log(v));
  console.log(`${'─'.repeat(colW)}`);
  console.log(` violations found:        ${violations.length}`);
  console.log(`${'─'.repeat(colW)}\n`);
  process.exit(1);
}
