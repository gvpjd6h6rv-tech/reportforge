'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { templateDashboard } from '../../tools/salad-score/dashboard/template_dashboard.mjs';

const RESULTS = [
  {
    path: 'engines/Clean.js', owner: 'designer-runtime/x', file_type: 'engine', loc: 10,
    responsibilities_detected: ['business-logic'],
    sp_file_score: 5, sp_behavior_score: 0, sp_total_score: 3,
    level: 'limpio', reasons: [], suggested_split: [], violated_rules: [], evidence: [],
  },
  {
    path: 'engines/God.js', owner: 'unowned', file_type: 'engine', loc: 400,
    responsibilities_detected: ['io', 'dom-mutation', 'state-mutation'],
    sp_file_score: 90, sp_behavior_score: 85, sp_total_score: 88,
    level: 'ensalada_nivel_dios',
    reasons: [{ rule: 'metric_loc', message: '400 LOC', evidence: ['L1-L400'] }],
    suggested_split: ['extraer manipulación DOM a un módulo dedicado'],
    violated_rules: ['check_ownership_violation', 'check_coupling'],
    evidence: ['L1-L400'],
  },
];
const REPO_SCORE = 45.5;
const CONFIG = JSON.parse(fs.readFileSync('salad-score.config.json', 'utf8'));

function render() {
  return templateDashboard({ results: RESULTS, repoScore: REPO_SCORE, config: CONFIG, generatedAt: '2026-01-01T00:00:00.000Z' });
}

test('templateDashboard — returns a full HTML document', () => {
  const html = render();
  assert.match(html, /<!DOCTYPE html>/i);
  assert.match(html, /<\/html>/i);
});

test('templateDashboard — never contains fetch/eval/subprocess/child_process/Function( — no insecure execution', () => {
  const html = render();
  assert.doesNotMatch(html, /\bfetch\s*\(/);
  assert.doesNotMatch(html, /\beval\s*\(/);
  assert.doesNotMatch(html, /\bsubprocess\b/);
  assert.doesNotMatch(html, /child_process/);
  assert.doesNotMatch(html, /new\s+Function\s*\(/);
  assert.doesNotMatch(html, /XMLHttpRequest/);
});

test('templateDashboard — includes all 10 mandatory sidebar anchors', () => {
  const html = render();
  for (const id of ['resumen', 'top-ensalada', 'archivos', 'responsabilidades', 'reglas-violadas', 'ownership', 'metricas', 'sugerencias', 'raw-json', 'config']) {
    assert.match(html, new RegExp(`href="#${id}"`), `missing sidebar link to #${id}`);
    assert.match(html, new RegExp(`id="${id}"`), `missing section with id="${id}"`);
  }
});

test('templateDashboard — dark theme is present', () => {
  const html = render();
  assert.match(html, /background(-color)?\s*:\s*#0/i);
});

test('templateDashboard — SP_REPO_SCORE card is rendered with the real value', () => {
  assert.match(render(), /45\.5/);
});

test('templateDashboard — top ofensor table lists the worse file above the cleaner one', () => {
  const html = render();
  assert.ok(html.indexOf('God.js') < html.indexOf('Clean.js'), 'God.js (score 88) must rank above Clean.js (score 3)');
});

test('templateDashboard — scale semantics: the highest score gets the most "salad" level label, not the lowest', () => {
  const html = render();
  assert.match(html, /ensalada_nivel_dios/);
  const godIdx = html.indexOf('God.js');
  const nearby = html.slice(Math.max(0, godIdx - 300), godIdx + 300);
  assert.match(nearby, /ensalada_nivel_dios/);
});

test('templateDashboard — embeds the raw JSON results, copiable (no fetch needed to view it)', () => {
  const html = render();
  assert.match(html, /God\.js/);
  assert.match(html, /id="raw-json-content"/);
  assert.match(html, /navigator\.clipboard/);
});

test('templateDashboard — shows the effective config (weights/caps/levelScale)', () => {
  const html = render();
  assert.match(html, /totalScore/);
  assert.match(html, /levelScale/);
});

test('templateDashboard — aggregates violated_rules and responsibilities for their sections', () => {
  const html = render();
  assert.match(html, /check_ownership_violation/);
  assert.match(html, /dom-mutation/);
});

test('templateDashboard — client-side filter input exists but contains no eval/fetch (DOM-only filtering)', () => {
  const html = render();
  assert.match(html, /<input[^>]*id="filter-input"/);
});
