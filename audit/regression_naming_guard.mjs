/**
 * regression_naming_guard.mjs — Regression test naming convention guard.
 *
 * Any test method inside a class whose name contains "Regression" must follow:
 *   test_regression_<NNN>_<field>_<cause>
 *
 * Where:
 *   NNN   = numeric bug ID (at least 1 digit)
 *   field = what field/area was affected (snake_case)
 *   cause = what caused the bug (snake_case)
 *
 * This makes regressions self-documenting, greppable, and tied to root cause.
 * Generic names like test_regression_date_bug or test_bug_42 are rejected.
 *
 * Rules:
 *   REGRESSION-NAMING-001  test_ methods in Regression classes follow pattern
 *   REGRESSION-NAMING-002  regression ID (NNN) is numeric
 *   REGRESSION-NAMING-003  regression method has at least 5 underscore-parts
 *   REGRESSION-PATTERN-001 test_regression_template.py exists and is non-empty
 *   REGRESSION-PATTERN-002 test_regression_template.py references the naming pattern in docstring
 */

import fs from 'fs';
import path from 'path';

const violations = [];
const TEST_DIR = 'reportforge/tests';

function check(rule, file, condition, desc) {
  if (!condition) violations.push(`  ${rule}  [${file}]  ${desc}`);
}

function read(relPath) {
  try { return fs.readFileSync(relPath, 'utf8'); } catch { return ''; }
}

// ── REGRESSION-PATTERN-001/002 ─────────────────────────────────────────────
const templatePath = path.join(TEST_DIR, 'test_regression_template.py');
const templateSrc = read(templatePath);

check(
  'REGRESSION-PATTERN-001',
  'test_regression_template.py',
  templateSrc.length > 100,
  'test_regression_template.py must exist and be non-empty',
);

check(
  'REGRESSION-PATTERN-002',
  'test_regression_template.py',
  templateSrc.includes('regression_') && templateSrc.includes('<bug') || templateSrc.includes('<id>'),
  'test_regression_template.py must document the naming pattern (regression_<id>_<field>_<cause>)',
);

// Additional check: template contains actual examples using the pattern
check(
  'REGRESSION-PATTERN-002',
  'test_regression_template.py',
  /def test_regression_\d+_/.test(templateSrc),
  'test_regression_template.py must contain at least one example regression test (test_regression_NNN_...)',
);

// ── REGRESSION-NAMING-001/002/003 ──────────────────────────────────────────
// Scan all Python test files for Regression classes
const testFiles = fs.readdirSync(TEST_DIR)
  .filter(f => f.endsWith('.py') && f.startsWith('test_'));

for (const fname of testFiles) {
  const src = read(path.join(TEST_DIR, fname));

  // Find all class definitions that contain "Regression" in their name
  const classRegex = /^class\s+(Test\w*Regression\w*)\s*[\(:]|^class\s+(\w*Regression\w*)\s*[\(:]/mg;
  let classMatch;

  while ((classMatch = classRegex.exec(src)) !== null) {
    const className = classMatch[1] || classMatch[2];

    // Find class body: from class line to next class at same indent or end of file
    const classStart = classMatch.index;
    const afterClass = src.indexOf('\nclass ', classStart + 1);
    const classBody = afterClass === -1
      ? src.slice(classStart)
      : src.slice(classStart, afterClass);

    // Find all test_ methods in this class body
    const methodRegex = /^\s+def\s+(test_\w+)\s*\(/mg;
    let methodMatch;

    while ((methodMatch = methodRegex.exec(classBody)) !== null) {
      const methodName = methodMatch[1];

      // Skip infrastructure/meta tests (those not themselves regressions)
      // Infrastructure tests: test_regression_naming_contract, test_this_file_*, etc.
      if (
        methodName.startsWith('test_regression_naming') ||
        methodName.startsWith('test_this_') ||
        methodName.startsWith('test_regression_method_') ||
        methodName.startsWith('test_regression_ids_')
      ) {
        continue;
      }

      // All other test_ methods in a Regression class must follow the pattern
      const parts = methodName.split('_');
      // Expected: ['test', 'regression', NNN, field..., cause...]

      // REGRESSION-NAMING-001: must start with test_regression_
      check(
        'REGRESSION-NAMING-001',
        `${fname}::${className}`,
        methodName.startsWith('test_regression_'),
        `${methodName}() must follow test_regression_<NNN>_<field>_<cause> pattern`,
      );

      if (!methodName.startsWith('test_regression_')) continue;

      // REGRESSION-NAMING-002: parts[2] must be numeric
      check(
        'REGRESSION-NAMING-002',
        `${fname}::${className}`,
        parts.length > 2 && /^\d+$/.test(parts[2]),
        `${methodName}() — regression ID (${parts[2] ?? 'missing'}) must be numeric`,
      );

      // REGRESSION-NAMING-003: at least 5 parts (test_regression_NNN_field_cause)
      check(
        'REGRESSION-NAMING-003',
        `${fname}::${className}`,
        parts.length >= 5,
        `${methodName}() must have ≥5 parts: test_regression_NNN_field_cause (found ${parts.length})`,
      );
    }
  }
}

// ── Report ────────────────────────────────────────────────────────────────────
const label = 'regression_naming_guard';
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
