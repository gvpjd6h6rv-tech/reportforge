/**
 * critical_field_mutation_guard.mjs — Critical field mutation ownership guard.
 *
 * Critical fields (REQUIRED_KEYS and their canonical sub-fields) must only
 * be written by their canonical owner modules. No engine, resolver, or
 * expression evaluator may mutate them directly.
 *
 * Python-side canonical owners:
 *   - render_engine.py / render_engine_validation.py : defines REQUIRED_KEYS, validates
 *   - field_resolver.py                              : reads fields (never writes data)
 *   - type_coercion.py / coercion_map.py             : transforms values, never writes back to data dict
 *
 * Rules:
 *   CRITFIELD-REQKEYS-001  REQUIRED_KEYS defined only in render_engine*.py
 *   CRITFIELD-NOWRITE-001  field_resolver.py must not assign to data dict keys
 *   CRITFIELD-NOWRITE-002  type_coercion.py must not assign to data dict keys
 *   CRITFIELD-NOWRITE-003  coercion_map.py must not assign to data dict keys
 *   CRITFIELD-NOWRITE-004  html_engine.py must not assign to data dict keys
 *   CRITFIELD-VALIDATE-001 _validate() or validate_render_data() checks all REQUIRED_KEYS
 *   CRITFIELD-IMMUTABLE-001 FieldResolver.__init__ must store data without mutating (no pop/update/del)
 */

import fs from 'fs';
import path from 'path';

const violations = [];
const RENDER_DIR = 'reportforge/core/render';

function check(rule, file, condition, desc) {
  if (!condition) violations.push(`  ${rule}  [${file}]  ${desc}`);
}

function read(relPath) {
  try { return fs.readFileSync(relPath, 'utf8'); } catch { return ''; }
}

// Critical field names — writing to these in non-owner code is a violation
const CRITICAL_FIELDS = ['meta', 'empresa', 'cliente', 'fiscal', 'items', 'totales'];

// Pattern: data["<critical>"] = or data['<critical>'] =  or  data[<critical>] =
// Deliberately narrow: only direct dict-key assignment on a variable named data/payload/result
const WRITE_PATTERN = new RegExp(
  `\\b(?:data|payload|result)\\[['"](?:${CRITICAL_FIELDS.join('|')})['"]\\]\\s*=`,
);

// ── CRITFIELD-REQKEYS-001 ─────────────────────────────────────────────────────
// REQUIRED_KEYS must be defined only in render_engine.py or render_engine_validation.py
{
  const owners = [
    path.join(RENDER_DIR, 'render_engine.py'),
    path.join(RENDER_DIR, 'render_engine_validation.py'),
  ];
  const ownersWithKey = owners.filter(f => read(f).includes('REQUIRED_KEYS'));
  check(
    'CRITFIELD-REQKEYS-001',
    'render_engine*.py',
    ownersWithKey.length >= 1,
    'REQUIRED_KEYS must be defined in render_engine.py or render_engine_validation.py',
  );

  // No other file may define REQUIRED_KEYS
  const allPy = walkPy(RENDER_DIR);
  const ownerSet = new Set(owners.map(o => path.resolve(o)));
  for (const f of allPy) {
    if (ownerSet.has(path.resolve(f))) continue;
    const src = read(f);
    if (src.includes('REQUIRED_KEYS') && src.includes('REQUIRED_KEYS =')) {
      check('CRITFIELD-REQKEYS-001', path.relative('.', f),
        false,
        'REQUIRED_KEYS must not be redefined outside render_engine*.py');
    }
  }
}

// ── CRITFIELD-NOWRITE-001..004 ────────────────────────────────────────────────
// These files must never write back to critical dict keys
const READONLY_FILES = [
  { rel: path.join(RENDER_DIR, 'resolvers/field_resolver.py'), rule: 'CRITFIELD-NOWRITE-001' },
  { rel: path.join(RENDER_DIR, 'expressions/type_coercion.py'),  rule: 'CRITFIELD-NOWRITE-002' },
  { rel: path.join(RENDER_DIR, 'expressions/coercion_map.py'),   rule: 'CRITFIELD-NOWRITE-003' },
  { rel: path.join(RENDER_DIR, 'engines/html_engine.py'),        rule: 'CRITFIELD-NOWRITE-004' },
];

for (const { rel, rule } of READONLY_FILES) {
  const src = read(rel);
  check(
    rule,
    rel,
    !WRITE_PATTERN.test(src),
    `must not write to critical data dict fields (meta/empresa/cliente/fiscal/items/totales)`,
  );
}

// ── CRITFIELD-VALIDATE-001 ────────────────────────────────────────────────────
// validate function must check all 6 required keys
{
  const validationSrc =
    read(path.join(RENDER_DIR, 'render_engine.py')) +
    read(path.join(RENDER_DIR, 'render_engine_validation.py'));

  const allPresent = CRITICAL_FIELDS.every(k => validationSrc.includes(`"${k}"`));
  check(
    'CRITFIELD-VALIDATE-001',
    'render_engine_validation.py',
    allPresent,
    `_validate() must reference all 6 required keys: ${CRITICAL_FIELDS.join(', ')}`,
  );

  const hasValidateCall = validationSrc.includes('REQUIRED_KEYS') &&
    (validationSrc.includes('_validate') || validationSrc.includes('validate_render_data'));
  check(
    'CRITFIELD-VALIDATE-001',
    'render_engine_validation.py',
    hasValidateCall,
    'Must define _validate() or validate_render_data() using REQUIRED_KEYS',
  );
}

// ── CRITFIELD-IMMUTABLE-001 ───────────────────────────────────────────────────
// FieldResolver.__init__ must not mutate data (no pop/update/del/clear on data)
{
  const src = read(path.join(RENDER_DIR, 'resolvers/field_resolver.py'));

  // Extract __init__ body: from "def __init__" to next "def " at same or lower indent
  const initMatch = src.match(/def __init__\(self[^)]*\):([\s\S]*?)(?=\n    def |\n\nclass |\Z)/);
  if (initMatch) {
    const initBody = initMatch[1];
    const mutates = /self\._data\.(pop|update|clear)\b|del\s+self\._data\[/.test(initBody);
    check(
      'CRITFIELD-IMMUTABLE-001',
      'field_resolver.py',
      !mutates,
      'FieldResolver.__init__ must not mutate data (no pop/update/del/clear)',
    );
  } else {
    // If we can't find __init__, check the whole file for gross mutations
    const grossMutation = /self\._data\.(pop|update|clear)\b/.test(src);
    check(
      'CRITFIELD-IMMUTABLE-001',
      'field_resolver.py',
      !grossMutation,
      'FieldResolver must not mutate _data via pop/update/clear',
    );
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────
function walkPy(dir) {
  const results = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== '__pycache__') {
        results.push(...walkPy(full));
      } else if (entry.isFile() && entry.name.endsWith('.py')) {
        results.push(full);
      }
    }
  } catch { /* skip unreadable dirs */ }
  return results;
}

// ── Report ────────────────────────────────────────────────────────────────────
const label = 'critical_field_mutation_guard';
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
