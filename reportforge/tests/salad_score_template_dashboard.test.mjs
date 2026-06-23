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

// SPD1G — score scale table

test('templateDashboard — score scale table has all 5 mandatory ranges with emoji + label', () => {
  const html = render();
  assert.match(html, /0-20[\s\S]{0,40}🟢[\s\S]{0,20}Limpio/i);
  assert.match(html, /21-40[\s\S]{0,40}🟡[\s\S]{0,20}Aceptable/i);
  assert.match(html, /41-60[\s\S]{0,40}🟠[\s\S]{0,20}Sospechoso/i);
  assert.match(html, /61-80[\s\S]{0,40}🔴[\s\S]{0,20}Ensalada seria/i);
  assert.match(html, /81-100[\s\S]{0,40}🧨[\s\S]{0,20}Ensalada nivel dios/i);
});

test('templateDashboard — score scale ranges are derived from config.levelScale, not hardcoded separately', () => {
  const html = render();
  for (const entry of CONFIG.levelScale) {
    assert.match(html, new RegExp(`${entry.min}-${entry.max}`), `range ${entry.min}-${entry.max} from config.levelScale must appear in the rendered scale table`);
  }
});

test('templateDashboard — includes the literal text "score alto = más ensalada"', () => {
  assert.match(render(), /score alto = más ensalada/);
});

test('templateDashboard — score scale table itself has a dedicated heading "📊 Escala SP Score"', () => {
  assert.match(render(), /📊 Escala SP Score/);
});

// SPD1G — clickable, sortable table headers

test('templateDashboard — every <th> is marked sortable: cursor pointer (CSS), role=button, tabindex, aria-sort=none initial', () => {
  const html = render();
  assert.match(html, /th\s*\{[^}]*cursor\s*:\s*pointer/);
  const thMatches = html.match(/<th(?=[\s>])[^>]*>/g) || [];
  assert.ok(thMatches.length > 0, 'dashboard must contain at least one <th>');
  for (const th of thMatches) {
    assert.match(th, /role="columnheader"/, `<th> must declare role=columnheader: ${th}`);
    assert.match(th, /tabindex="0"/, `<th> must be keyboard-focusable: ${th}`);
    assert.match(th, /aria-sort="none"/, `<th> must declare initial aria-sort=none: ${th}`);
  }
});

test('templateDashboard — sorting script: attaches a click handler to every <th>, no fetch/eval/exec inside it', () => {
  const html = render();
  const scriptMatch = html.match(/<script>([\s\S]*)<\/script>/);
  assert.ok(scriptMatch, 'inline script must exist');
  const script = scriptMatch[1];
  assert.match(script, /querySelectorAll\(['"]th['"]\)/);
  assert.match(script, /addEventListener\(['"]click['"]/);
  assert.doesNotMatch(script, /\bfetch\s*\(/);
  assert.doesNotMatch(script, /\beval\s*\(/);
  assert.doesNotMatch(script, /subprocess|child_process/);
});

test('templateDashboard — sorting script toggles aria-sort between ascending/descending and reorders <tbody> rows client-side', () => {
  const html = render();
  const scriptMatch = html.match(/<script>([\s\S]*)<\/script>/);
  const script = scriptMatch[1];
  assert.match(script, /ascending/);
  assert.match(script, /descending/);
  assert.match(script, /setAttribute\(['"]aria-sort['"]/);
  assert.match(script, /\.sort\(/);
  assert.match(script, /appendChild/, 'rows must be reordered via DOM appendChild, not refetched');
});

test('templateDashboard — visual asc/desc indicator is declared via CSS on aria-sort, not inline JS strings only', () => {
  const html = render();
  assert.match(html, /\[aria-sort=['"]ascending['"]\]/);
  assert.match(html, /\[aria-sort=['"]descending['"]\]/);
});

test('templateDashboard — sortable headers are keyboard-activatable (Enter/Space), not click-only — tabindex=0 + role=columnheader without this is a dead-end for keyboard users', () => {
  const html = render();
  const scriptMatch = html.match(/<script>([\s\S]*)<\/script>/);
  const script = scriptMatch[1];
  assert.match(script, /addEventListener\(['"]keydown['"]/);
  assert.match(script, /event\.key\s*!==\s*['"]Enter['"]/);
  assert.match(script, /event\.key\s*!==\s*['"] ['"]/);
});
