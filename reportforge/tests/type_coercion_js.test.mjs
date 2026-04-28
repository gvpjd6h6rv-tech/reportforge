'use strict';
/**
 * TYPE COERCION — JS frontend (FormulaEngine.js) — Tier 3
 *
 * FormulaEngine.js implementa coerción implícita en el evaluador JS.
 * Los helpers internos son privados (_tr, _num, _eq, _cmp, _pd), así que
 * los tests ejercen coerción vía FormulaEngine.eval() y FormulaEngine.Ctx.
 *
 * Secciones:
 *   1. Truthy (_tr): qué es falsy en Crystal Reports JS
 *   2. Numeric coercion (_num): null/bool/string→number
 *   3. Equality coercion (_eq): cross-type = operator
 *   4. Comparison coercion (_cmp): < > con tipos mixtos
 *   5. Type conversion functions: ToText, ToNumber, CBool, CStr, CDate
 *   6. Null/missing propagation
 *   7. Date coercion: DateAdd, DateDiff, Year/Month/Day, DateSerial
 *   8. String operators: & vs +
 *   9. Division by zero
 *  10. Cross-type arithmetic
 *  11. Parity snapshot vs Python type_coercion.py (documenta divergencias)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ---------------------------------------------------------------------------
// Loader — FormulaEngine is a const IIFE, needs runInThisContext to share realm
// ---------------------------------------------------------------------------

function loadFormulaEngine() {
  const src = fs.readFileSync(path.join(ROOT, 'engines/FormulaEngine.js'), 'utf8');
  // FormulaEngine.js ends with `window.FormulaEngine = FormulaEngine` — stub window for Node
  const hadWindow = 'window' in globalThis;
  const prevWindow = globalThis.window;
  globalThis.window = {};
  try {
    return vm.runInThisContext(`(function(){ ${src}; return FormulaEngine; })()`);
  } finally {
    if (!hadWindow) delete globalThis.window;
    else globalThis.window = prevWindow;
  }
}

const FE = loadFormulaEngine();

function ev(src, record = {}, params = {}) {
  return FE.eval(src, record, params);
}

function ctx(record = {}, records = []) {
  const c = new FE.Ctx();
  c.setRecord(record);
  c.setRecords(records);
  return c;
}

// ---------------------------------------------------------------------------
// 1. Truthy coercion — _tr — via IIf(expr, "yes", "no")
// ---------------------------------------------------------------------------

test('coercion — truthy: null is falsy', () => {
  assert.equal(ev('IIf(null, "yes", "no")'), 'no');
});

test('coercion — truthy: 0 is falsy', () => {
  assert.equal(ev('IIf(0, "yes", "no")'), 'no');
});

test('coercion — truthy: empty string is falsy', () => {
  assert.equal(ev('IIf("", "yes", "no")'), 'no');
});

test('coercion — truthy: false literal is falsy', () => {
  assert.equal(ev('IIf(false, "yes", "no")'), 'no');
});

test('coercion — truthy: 1 is truthy', () => {
  assert.equal(ev('IIf(1, "yes", "no")'), 'yes');
});

test('coercion — truthy: non-empty string is truthy', () => {
  assert.equal(ev('IIf("hello", "yes", "no")'), 'yes');
});

test('coercion — truthy: true literal is truthy', () => {
  assert.equal(ev('IIf(true, "yes", "no")'), 'yes');
});

test('coercion — truthy: negative number is truthy (non-zero)', () => {
  assert.equal(ev('IIf(-1, "yes", "no")'), 'yes');
});

// ---------------------------------------------------------------------------
// 2. Numeric coercion — _num — via arithmetic
// ---------------------------------------------------------------------------

test('coercion — _num: null in addition yields 0', () => {
  // null + 5 — null coerces to 0
  assert.equal(ev('null + 5'), 5);
});

test('coercion — _num: numeric string coerces in arithmetic', () => {
  // "3" * 4 — string coerces to number
  const c = ctx({ price: '3' });
  assert.equal(c.eval('{price} * 4'), 12);
});

test('coercion — _num: non-numeric string yields 0 via ToNumber', () => {
  // + operator with a string operand takes the string-concat path, not _num
  // Use explicit ToNumber to exercise _num on a non-numeric string
  assert.equal(ev('ToNumber("abc")'), 0);
  // * operator always uses _num — verify non-numeric string coerces to 0 there too
  const c = ctx({ tag: 'abc' });
  assert.equal(c.eval('{tag} * 1'), 0);
});

test('coercion — _num: comma-separated numeric string stops at comma (JS parseFloat behavior)', () => {
  // + with string operand does concat — use * to force _num path
  // parseFloat('1,234') = 1 (stops at comma — unlike Python which strips commas)
  const c = ctx({ v: '1,234' });
  assert.equal(c.eval('{v} * 1'), 1);
});

test('coercion — _num: ToNumber("3.14") returns 3.14', () => {
  assert.equal(ev('ToNumber("3.14")'), 3.14);
});

test('coercion — _num: ToNumber(null) returns 0', () => {
  assert.equal(ev('ToNumber(null)'), 0);
});

test('coercion — _num: CDbl("100") returns 100', () => {
  assert.equal(ev('CDbl("100")'), 100);
});

// ---------------------------------------------------------------------------
// 3. Equality coercion — _eq — via = operator
// ---------------------------------------------------------------------------

test('coercion — eq: null = null is true', () => {
  assert.equal(ev('null = null'), true);
});

test('coercion — eq: null = 0 is false (no null→number coercion in equality)', () => {
  assert.equal(ev('null = 0'), false);
});

test('coercion — eq: numeric string = number is true (numeric coercion)', () => {
  // "1" = 1 → parseFloat("1") == parseFloat(1) → 1 == 1
  const c = ctx({ v: '1' });
  assert.equal(c.eval('{v} = 1'), true);
});

test('coercion — eq: string "1.0" = 1 is true (float parse)', () => {
  const c = ctx({ v: '1.0' });
  assert.equal(c.eval('{v} = 1'), true);
});

test('coercion — eq: non-numeric strings compared as strings', () => {
  assert.equal(ev('"abc" = "abc"'), true);
  assert.equal(ev('"abc" = "ABC"'), false);
});

test('coercion — eq: <> operator is negation of =', () => {
  assert.equal(ev('1 <> 2'), true);
  assert.equal(ev('1 <> 1'), false);
  assert.equal(ev('null <> null'), false);
});

// ---------------------------------------------------------------------------
// 4. Comparison coercion — _cmp — via < > operators
// ---------------------------------------------------------------------------

test('coercion — cmp: numeric comparison', () => {
  assert.equal(ev('2 > 1'), true);
  assert.equal(ev('1 < 2'), true);
  assert.equal(ev('2 >= 2'), true);
  assert.equal(ev('1 <= 2'), true);
});

test('coercion — cmp: string numeric comparison uses numeric path', () => {
  const c = ctx({ a: '10', b: '9' });
  // "10" > "9" — string compare would be false, numeric compare is true
  assert.equal(c.eval('{a} > {b}'), true);
});

test('coercion — cmp: non-numeric string comparison uses lexicographic order', () => {
  assert.equal(ev('"b" > "a"'), true);
  assert.equal(ev('"apple" < "banana"'), true);
});

test('coercion — cmp: In() operator membership', () => {
  assert.equal(ev('2 in (1, 2, 3)'), true);
  assert.equal(ev('5 in (1, 2, 3)'), false);
});

test('coercion — cmp: Between() operator range (inclusive)', () => {
  assert.equal(ev('5 between 1 and 10'), true);
  assert.equal(ev('1 between 1 and 10'), true);
  assert.equal(ev('10 between 1 and 10'), true);
  assert.equal(ev('11 between 1 and 10'), false);
});

// ---------------------------------------------------------------------------
// 5. Type conversion functions
// ---------------------------------------------------------------------------

test('coercion — ToText: number with decimals', () => {
  assert.equal(ev('ToText(42, 2)'), '42.00');
});

test('coercion — ToText: number without decimals spec', () => {
  // No second arg — JS Date.toLocaleDateString not relevant here, just String(v)
  assert.equal(ev('ToText(42)'), '42');
});

test('coercion — ToText: string passthrough', () => {
  assert.equal(ev('ToText("hello")'), 'hello');
});

test('coercion — ToText: null → empty string', () => {
  assert.equal(ev('ToText(null)'), '');
});

test('coercion — CStr: alias for ToText', () => {
  assert.equal(ev('CStr(3.14)'), '3.14');
});

test('coercion — CBool: 0 → false', () => {
  assert.equal(ev('CBool(0)'), false);
});

test('coercion — CBool: 1 → true', () => {
  assert.equal(ev('CBool(1)'), true);
});

test('coercion — CBool: empty string → false', () => {
  assert.equal(ev('CBool("")'), false);
});

test('coercion — CBool: non-empty string → true', () => {
  assert.equal(ev('CBool("yes")'), true);
});

test('coercion — IsNull: null → true', () => {
  assert.equal(ev('IsNull(null)'), true);
});

test('coercion — IsNull: 0 → false (0 is not null)', () => {
  assert.equal(ev('IsNull(0)'), false);
});

test('coercion — IsNumeric: number → true', () => {
  assert.equal(ev('IsNumeric(42)'), true);
});

test('coercion — IsNumeric: string → false', () => {
  // IsNumeric checks typeof === "number", not parseable
  assert.equal(ev('IsNumeric("42")'), false);
});

test('coercion — IsString: string → true', () => {
  assert.equal(ev('IsString("hello")'), true);
});

test('coercion — IsString: number → false', () => {
  assert.equal(ev('IsString(42)'), false);
});

// ---------------------------------------------------------------------------
// 6. Null/missing propagation
// ---------------------------------------------------------------------------

test('coercion — null propagation: null field + number = number (null→0)', () => {
  const c = ctx({ missing_field: null });
  assert.equal(c.eval('{missing_field} + 10'), 10);
});

test('coercion — null propagation: missing field returns null', () => {
  const c = ctx({});
  assert.equal(c.eval('{nonexistent}'), null);
});

test('coercion — null propagation: IIf with null condition uses falsy branch', () => {
  const c = ctx({ flag: null });
  assert.equal(c.eval('IIf({flag}, "yes", "no")'), 'no');
});

test('coercion — null propagation: string concat with null → empty string (& uses ?? operator)', () => {
  // & operator: String(null??\'\') — null??\'\' = \'\', so null becomes empty string
  assert.equal(ev('"prefix_" & null'), 'prefix_');
});

test('coercion — null propagation: + with one null string operand', () => {
  // + with string operand: String(null??'') = '' (uses ?? in + operator)
  const result = ev('"a" + null');
  // In FormulaEngine: typeof l==='string' → String(l??'')+String(r??\'\') → 'a'
  assert.equal(typeof result, 'string');
  assert.ok(result.startsWith('a'), `expected string starting with 'a', got ${result}`);
});

// ---------------------------------------------------------------------------
// 7. Date coercion
// ---------------------------------------------------------------------------

test('coercion — DateAdd: add days', () => {
  // Use DateSerial (new Date(y,m-1,d)) — avoids UTC-midnight timezone shift of CDate("string")
  const result = ev('DateAdd("d", 5, DateSerial(2024, 1, 1))');
  assert.ok(result instanceof Date, 'DateAdd must return a Date');
  assert.equal(result.getDate(), 6);
});

test('coercion — DateAdd: add months', () => {
  const result = ev('DateAdd("m", 1, DateSerial(2024, 1, 15))');
  assert.ok(result instanceof Date);
  assert.equal(result.getMonth() + 1, 2); // February
});

test('coercion — DateAdd: add years', () => {
  const result = ev('DateAdd("yyyy", 1, DateSerial(2024, 1, 15))');
  assert.ok(result instanceof Date);
  assert.equal(result.getFullYear(), 2025);
});

test('coercion — DateDiff: days between dates', () => {
  const result = ev('DateDiff("d", DateSerial(2024, 1, 1), DateSerial(2024, 1, 11))');
  assert.equal(result, 10);
});

test('coercion — DateDiff: months between dates', () => {
  const result = ev('DateDiff("m", DateSerial(2024, 1, 1), DateSerial(2024, 4, 1))');
  assert.equal(result, 3);
});

test('coercion — DateDiff: years between dates', () => {
  const result = ev('DateDiff("yyyy", DateSerial(2020, 1, 1), DateSerial(2024, 1, 1))');
  assert.equal(result, 4);
});

test('coercion — Year/Month/Day: extract date parts', () => {
  // DateSerial uses local-time constructor — no timezone shift
  assert.equal(ev('Year(DateSerial(2024, 6, 15))'), 2024);
  assert.equal(ev('Month(DateSerial(2024, 6, 15))'), 6);
  assert.equal(ev('Day(DateSerial(2024, 6, 15))'), 15);
});

test('coercion — DateSerial: constructs date from parts', () => {
  const result = ev('DateSerial(2024, 6, 15)');
  assert.ok(result instanceof Date);
  assert.equal(result.getFullYear(), 2024);
  assert.equal(result.getMonth() + 1, 6);
  assert.equal(result.getDate(), 15);
});

test('coercion — CDate: invalid date returns null', () => {
  assert.equal(ev('CDate("not-a-date")'), null);
});

// ---------------------------------------------------------------------------
// 8. String operators: & vs +
// ---------------------------------------------------------------------------

test('coercion — & operator: always concatenates as strings', () => {
  assert.equal(ev('1 & 2'), '12');
  assert.equal(ev('"a" & "b"'), 'ab');
  assert.equal(ev('1 & " item"'), '1 item');
});

test('coercion — + operator: string wins when one operand is string', () => {
  // FormulaEngine._bin: if typeof l==='string' || typeof r==='string' → string concat
  assert.equal(ev('"count: " + 5'), 'count: 5');
});

test('coercion — + operator: both numbers → addition', () => {
  assert.equal(ev('3 + 4'), 7);
});

test('coercion — + operator: float precision', () => {
  // Standard JS float
  assert.ok(Math.abs(ev('0.1 + 0.2') - 0.3) < 1e-10);
});

// ---------------------------------------------------------------------------
// 9. Division by zero
// ---------------------------------------------------------------------------

test('coercion — division by zero: returns 0 (safe)', () => {
  assert.equal(ev('10 / 0'), 0);
});

test('coercion — division by zero: null denominator → 0 (null→0 via _num)', () => {
  assert.equal(ev('10 / null'), 0);
});

// ---------------------------------------------------------------------------
// 10. Cross-type arithmetic and logic
// ---------------------------------------------------------------------------

test('coercion — cross-type: power operator', () => {
  assert.equal(ev('2 ^ 10'), 1024);
});

test('coercion — cross-type: modulo', () => {
  assert.equal(ev('10 % 3'), 1);
});

test('coercion — cross-type: unary minus', () => {
  assert.equal(ev('-5'), -5);
  assert.equal(ev('-(3 + 2)'), -5);
});

test('coercion — cross-type: logical And/Or short-circuit via IIf', () => {
  assert.equal(ev('IIf(true and false, "yes", "no")'), 'no');
  assert.equal(ev('IIf(false or true, "yes", "no")'), 'yes');
});

test('coercion — cross-type: Not operator', () => {
  assert.equal(ev('Not true'), false);
  assert.equal(ev('Not false'), true);
  assert.equal(ev('Not 0'), true);
  assert.equal(ev('Not 1'), false);
});

test('coercion — cross-type: nested IIf', () => {
  const c = ctx({ score: 85 });
  const result = c.eval('IIf({score} >= 90, "A", IIf({score} >= 80, "B", "C"))');
  assert.equal(result, 'B');
});

test('coercion — cross-type: Select/Case expression', () => {
  const c = ctx({ status: 2 });
  const result = c.eval('Select {status} Case 1 "active" Case 2 "pending" Default "unknown"');
  assert.equal(result, 'pending');
});

test('coercion — cross-type: variable declaration and arithmetic', () => {
  const result = ev('Local NumberVar x := 10; x * x');
  assert.equal(result, 100);
});

// ---------------------------------------------------------------------------
// 11. Parity snapshot — JS vs Python type_coercion.py divergences
// ---------------------------------------------------------------------------

test('coercion — parity: truthy("false") — JS is truthy, Python is falsy (documented divergence)', () => {
  // Python: truthy("false") = False (explicit "false" string check)
  // JS _tr("false") = "false" != '' → true
  // This divergence means Crystal Reports formulas may evaluate differently
  // depending on whether they run server-side (Python) or client-side (JS preview).
  const DIVERGENCE = {
    id: 'COERCE-TRUTHY-001',
    input: '"false"',
    js_result: ev('IIf("false", "yes", "no")'),
    python_result: 'no', // Python truthy("false") = False
    note: 'Python checks str.lower() in ("", "false", "0", "no") — JS only checks non-empty',
  };
  assert.equal(DIVERGENCE.js_result, 'yes', 'JS: "false" string is truthy');
  assert.notEqual(DIVERGENCE.js_result, DIVERGENCE.python_result,
    'divergence confirmed: JS and Python disagree on truthy("false")');
});

test('coercion — parity: _num(true) — JS returns 0, Python returns 1 (documented divergence)', () => {
  // Python: to_num(True) = 1 (explicit isinstance(v, bool) check)
  // JS _num(true): parseFloat(true) = NaN → 0
  // In practice this only affects CBool(true) + 0 which is unusual
  const DIVERGENCE = {
    id: 'COERCE-NUM-001',
    input: 'true',
    js_result: ev('true + 0'), // forces _num(true)
    python_result: 1,           // to_num(True) = 1
    note: 'JS _num uses parseFloat which returns NaN for booleans → coerces to 0',
  };
  // Both paths: true + 0 — JS: typeof l==='boolean', typeof r==='number' → _num path → 0+0=0
  assert.equal(DIVERGENCE.js_result, 0, `JS: true + 0 = ${DIVERGENCE.js_result}`);
  assert.notEqual(DIVERGENCE.js_result, DIVERGENCE.python_result,
    'divergence confirmed: JS and Python disagree on numeric value of boolean true');
});

test('coercion — parity: comma in numeric string — JS=1, Python=1234 (documented divergence)', () => {
  // Python: to_num("1,234") = 1234.0 (removes commas before parsing)
  // JS _num: parseFloat("1,234") = 1 (stops at comma)
  const DIVERGENCE = {
    id: 'COERCE-NUM-002',
    input: '"1,234"',
    js_result: ev('ToNumber("1,234")'),
    python_result: 1234,
    note: 'Python strips commas before parseFloat; JS does not',
  };
  assert.equal(DIVERGENCE.js_result, 1,
    `JS: ToNumber("1,234") = ${DIVERGENCE.js_result} (stops at comma)`);
  assert.notEqual(DIVERGENCE.js_result, DIVERGENCE.python_result,
    'divergence confirmed: comma-in-number handled differently');
});

test('coercion — parity: to_text(null) — both return empty string (aligned)', () => {
  assert.equal(ev('ToText(null)'), '', 'JS: ToText(null) = ""');
  // Python: to_text(None) = "" ← same behavior, no divergence
});

test('coercion — parity: eq(null, null) — both return true (aligned)', () => {
  assert.equal(ev('null = null'), true, 'JS: null = null → true');
  // Python: eq(None, None) = True ← same behavior, no divergence
});
