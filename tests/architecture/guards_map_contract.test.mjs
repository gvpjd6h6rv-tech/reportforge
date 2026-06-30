'use strict';
// RF-ARCH-MODULAR-GUARDS-PHASE-2
// One test file = one contract: every guards-map.json entry obeys the guard
// contract. No guard logic is exercised here — only the SSOT catalog shape.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const MAP_PATH = path.join(ROOT, 'tools/guards/maps/guards-map.json');
const SCHEMA_PATH = path.join(ROOT, 'tools/guards/contracts/guard-entry.schema.json');

const map = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));

const LAYERS = ['guard', 'checker', 'runner', 'map', 'cli'];
const STATES = ['existing', 'planned', 'deprecated'];

test('map is data-only (parses as pure JSON, has entries array)', () => {
  assert.ok(Array.isArray(map.entries), 'entries must be an array');
  assert.ok(map.entries.length > 0, 'catalog must not be empty');
});

test('every entry has all required fields and no field outside the schema', () => {
  const required = schema.required;
  const allowed = Object.keys(schema.properties);
  for (const e of map.entries) {
    for (const key of required) {
      assert.ok(Object.prototype.hasOwnProperty.call(e, key), `${e.id}: missing field '${key}'`);
    }
    for (const key of Object.keys(e)) {
      assert.ok(allowed.includes(key), `${e.id}: unexpected field '${key}'`);
    }
  }
});

test('every entry has correct field types and enums', () => {
  const idRe = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  for (const e of map.entries) {
    assert.match(e.id, idRe, `id not kebab-case: ${e.id}`);
    assert.ok(LAYERS.includes(e.layer), `${e.id}: bad layer ${e.layer}`);
    assert.ok(STATES.includes(e.state), `${e.id}: bad state ${e.state}`);
    assert.equal(typeof e.rule, 'string', `${e.id}: rule must be string`);
    assert.ok(e.rule.length >= 8, `${e.id}: rule too short`);
    assert.equal(typeof e.ruleReviewed, 'boolean', `${e.id}: ruleReviewed must be boolean`);
    assert.equal(typeof e.owner, 'string', `${e.id}: owner must be string`);
    assert.ok(e.owner.length > 0, `${e.id}: owner required`);
    assert.ok(e.pathCurrent === null || typeof e.pathCurrent === 'string', `${e.id}: pathCurrent type`);
    assert.ok(e.test === null || typeof e.test === 'string', `${e.id}: test type`);
  }
});

test('ids are unique', () => {
  const seen = new Set();
  for (const e of map.entries) {
    assert.ok(!seen.has(e.id), `duplicate id: ${e.id}`);
    seen.add(e.id);
  }
});

test('Phase 2 freeze — blocking is false for every entry', () => {
  for (const e of map.entries) {
    assert.equal(e.blocking, false, `${e.id}: blocking must be false in Phase 2`);
  }
});

test('reviewed rule carries exactly one rule (no " and " joining two rules)', () => {
  // Only reviewed rules must be clean single sentences. Auto-derived rules
  // (ruleReviewed:false) are explicitly pending human confirmation, so an
  // incidental "and" (e.g. "io and logic") is not yet a contract violation.
  for (const e of map.entries) {
    if (!e.ruleReviewed) continue;
    assert.ok(!/\sand\s/i.test(e.rule), `${e.id}: reviewed rule joins two rules: "${e.rule}"`);
  }
});

test('state=existing ⇒ pathCurrent set and file exists on disk', () => {
  for (const e of map.entries) {
    if (e.state !== 'existing') continue;
    assert.ok(e.pathCurrent, `${e.id}: existing entry needs pathCurrent`);
    const abs = path.join(ROOT, e.pathCurrent);
    assert.ok(fs.existsSync(abs), `${e.id}: pathCurrent missing on disk: ${e.pathCurrent}`);
  }
});

test('state=planned ⇒ pathCurrent null and pathPlanned set', () => {
  for (const e of map.entries) {
    if (e.state !== 'planned') continue;
    assert.equal(e.pathCurrent, null, `${e.id}: planned entry must have pathCurrent null`);
    assert.ok(typeof e.pathPlanned === 'string' && e.pathPlanned.length, `${e.id}: planned entry needs pathPlanned`);
  }
});

test('recommendation, when present, is a known outcome', () => {
  const ok = ['clean', 'split', 'merge', 'reclassify', 'keep'];
  for (const e of map.entries) {
    if (e.recommendation == null) continue;
    assert.ok(ok.includes(e.recommendation), `${e.id}: bad recommendation ${e.recommendation}`);
  }
});

test('honesty — ruleReviewed:true requires recommendation clean or keep', () => {
  // A reviewed-as-final rule must not still be flagged for split/merge/reclassify.
  for (const e of map.entries) {
    if (!e.ruleReviewed) continue;
    assert.ok(
      e.recommendation == null || ['clean', 'keep'].includes(e.recommendation),
      `${e.id}: ruleReviewed:true but recommendation=${e.recommendation}`
    );
  }
});

test('layer responsibility — checker/guard files live under their layer dir', () => {
  for (const e of map.entries) {
    if (e.state !== 'existing' || !e.pathCurrent) continue;
    if (e.layer === 'checker') assert.match(e.pathCurrent, /checkers\//, `${e.id}: checker not in a checkers/ dir`);
    if (e.layer === 'map') assert.match(e.pathCurrent, /\.json$/, `${e.id}: map must be a .json data file`);
  }
});
