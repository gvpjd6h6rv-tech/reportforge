#!/usr/bin/env node
/**
 * rf_e2r_dashboard.mjs — RF E2R Dashboard
 *
 * Reads:
 *   audit/e2r_coverage.json
 *   audit/subsystem_ownership_map.json
 *
 * Writes:
 *   audit/rf_e2r_snapshot.json   (always)
 *   audit/rf_e2r_dashboard.html  (with --html flag)
 *
 * Usage:
 *   node scripts/rf_e2r_dashboard.mjs
 *   node scripts/rf_e2r_dashboard.mjs --html
 *
 * Score formula (0-100, higher = healthier):
 *   score = 0.35 * bandFactor
 *         + 0.20 * (100 - surface)
 *         + 0.15 * (100 - legacyDebt)
 *         + 0.15 * (100 - coupling)
 *         + 0.10 * (100 - riskScore)
 *         + 0.05 * guardBonus
 *
 * Band thresholds (from e2r_guard — NOT modified):
 *   green:   coverageReal >= 5
 *   yellow:  coverageReal  1–4
 *   red:     coverageReal == 0, no exclusion
 *   backlog: coverageReal == 0, has exclusion
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname }            from 'node:path';
import { fileURLToPath }               from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '..');
const HTML_FLAG = process.argv.includes('--html');

function load(rel) {
  return JSON.parse(readFileSync(resolve(ROOT, rel), 'utf8'));
}

const coverage = load('audit/e2r_coverage.json');
const ownerMap = load('audit/subsystem_ownership_map.json');

const ownerById = Object.fromEntries((ownerMap.subsystems ?? []).map(s => [s.id, s]));
const covById   = Object.fromEntries((coverage.subsystems  ?? []).map(s => [s.id, s]));

// ─── Coverage band (e2r_guard thresholds — internal use only for bandFactor) ──
function coverageToBand(coverageReal, hasExclusion) {
  if (coverageReal >= 5) return 'green';
  if (coverageReal >= 1) return 'yellow';
  return hasExclusion ? 'backlog' : 'red';
}

// ─── Dashboard band (score-derived — what CLI and HTML display) ───────────────
// Opción A: score >= 80 → green | score >= 50 → yellow | score < 50 → red
function scoreToBand(score) {
  if (score >= 80) return 'green';
  if (score >= 50) return 'yellow';
  return 'red';
}

// ─── Risk normalisation ────────────────────────────────────────────────────────
const RISK_MAP = { critical: 100, high: 80, medium: 60, low: 40 };

// ─── Derive metrics ────────────────────────────────────────────────────────────
const allSubs = ownerMap.subsystems ?? [];
const maxAllowedFiles = Math.max(1, ...allSubs.map(s => (s.allowedFiles ?? []).length));

function computeEntry(sub) {
  const cov          = covById[sub.id]  ?? {};
  const coverageReal = cov.coverageReal ?? 0;
  const hasExclusion = Boolean(cov.coverageExclusion);

  // surface — normalised allowed-file count; larger surface = more exposure
  const af      = (sub.allowedFiles ?? []).length;
  const surface = Math.round((af / maxAllowedFiles) * 100);

  // legacyDebt — ratio of legacy files to total; 0 if no allowed files
  const lf         = (sub.legacyFiles ?? []).length;
  const legacyDebt = af > 0 ? Math.round((lf / af) * 100) : (lf > 0 ? 100 : 0);

  // coupling — unresolved ambiguities as coupling proxy (each ≈ 33 points)
  const ua       = (sub.unresolvedAmbiguities ?? []).length;
  const coupling = Math.min(100, ua * 33);

  // risk — from ownership map field
  const riskScore = RISK_MAP[(sub.risk ?? 'medium').toLowerCase()] ?? 60;

  // guard presence
  const guardList  = sub.requiredGuardCI ?? [];
  const guardBonus = guardList.length > 0 ? 100 : 0;

  // bandFactor uses coverageToBand (e2r_guard thresholds) — formula unchanged
  const BAND_FACTOR   = { green: 100, yellow: 50, red: 0, backlog: 20 };
  const coverageBand  = coverageToBand(coverageReal, hasExclusion);
  const bandFactor    = BAND_FACTOR[coverageBand] ?? 0;

  // composite score (formula unchanged)
  const score = Math.round(
    0.35 * bandFactor          +
    0.20 * (100 - surface)     +
    0.15 * (100 - legacyDebt)  +
    0.15 * (100 - coupling)    +
    0.10 * (100 - riskScore)   +
    0.05 * guardBonus
  );

  // dashboard band: score-derived (Opción A: ≥80 green, ≥50 yellow, <50 red)
  const band = scoreToBand(score);

  const tests = (cov.passingTests ?? []).length;

  return {
    id:                 sub.id,
    name:               sub.name,
    domain:             sub.domain   ?? '',
    tier:               sub.tier     ?? '',
    score,
    band,
    owner:              sub.owner    ?? 'unassigned',
    coverageReal,
    surface,
    legacyDebt,
    coupling,
    risk:               riskScore,
    requiredGuardCI:    guardList.length > 0,
    tests,
    allowedFiles:       af,
    // detail lists for HTML sidebar
    allowedFilesList:    sub.allowedFiles       ?? [],
    existingTestsList:   cov.existingTests      ?? [],
    passingTestsList:    cov.passingTests        ?? [],
    requiredGuardCIList: guardList,
    notes:               sub.notes              ?? '',
    coverageNote:        cov.coverageNote        ?? null,
  };
}

const entries = allSubs
  .map(computeEntry)
  .sort((a, b) => a.score - b.score);

// ─── Snapshot ──────────────────────────────────────────────────────────────────
const FORMULA =
  'score = 0.35*bandFactor + 0.20*(100-surface) + 0.15*(100-legacyDebt) + 0.15*(100-coupling) + 0.10*(100-riskScore) + 0.05*guardBonus';

const snapshot = {
  version:           '1.0.0',
  generatedAt:       new Date().toISOString(),
  formula:           FORMULA,
  bandThresholds:    'green=score≥80 | yellow=score 50–79 | red=score<50  (score-derived, Opción A)',
  bandNote:          'Dashboard band is score-derived. E2R guard uses coverageReal bands internally (untouched).',
  totalPassingTests: coverage.totalPassingTests,
  subsystems:        entries,
};

const SNAP_PATH = resolve(ROOT, 'audit/rf_e2r_snapshot.json');
writeFileSync(SNAP_PATH, JSON.stringify(snapshot, null, 2) + '\n');

// ─── CLI render ────────────────────────────────────────────────────────────────
const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  red:    '\x1b[38;2;239;83;80m',
  yellow: '\x1b[38;2;255;179;0m',
  green:  '\x1b[38;2;0;255;0m',
  gray:   '\x1b[90m',
  blue:   '\x1b[34m',
};

const BAND_ICON  = { green: '🏆', yellow: '✨', red: '🔴', backlog: '⏸️' };
const BAND_DOT   = { green: '🟢', yellow: '🟡', red: '🔴', backlog: '⚫' };
const BAND_CLR   = { green: C.green, yellow: C.yellow, red: C.red, backlog: C.gray };

function scoreBar(score, width = 20) {
  const filled = Math.round((score / 100) * width);
  return '█'.repeat(Math.max(0, filled)) + '░'.repeat(Math.max(0, width - filled));
}

process.stdout.write('\n');
process.stdout.write(`${C.bold}  RF E2R Dashboard${C.reset}\n`);
process.stdout.write(`${C.gray}  snapshot:    ${SNAP_PATH}${C.reset}\n`);
process.stdout.write(`${C.gray}  formula      ${snapshot.formula}${C.reset}\n`);
process.stdout.write(`${C.gray}  generatedAt: ${snapshot.generatedAt}${C.reset}\n`);
process.stdout.write(`${C.gray}  rows: ${entries.length}${C.reset}\n`);
process.stdout.write('\n');

for (const e of entries) {
  const bc    = BAND_CLR[e.band] ?? C.gray;
  const label = e.band.toUpperCase();
  process.stdout.write(
    `  ${BAND_ICON[e.band]} ${BAND_DOT[e.band]} ${C.bold}${e.name}${C.reset}` +
    ` ${bc}[${label}]${C.reset}` +
    ` score ${C.bold}${String(e.score).padStart(3)}${C.reset}` +
    `  ${bc}${scoreBar(e.score)}${C.reset}\n`
  );
  process.stdout.write(`${C.gray}     owner: ${e.owner}${C.reset}\n`);
  process.stdout.write(
    `${C.dim}     coverageReal=${e.coverageReal}  surface=${e.surface}  legacyDebt=${e.legacyDebt}` +
    `  coupling=${e.coupling}  risk=${e.risk}${C.reset}\n`
  );
  process.stdout.write(
    `${C.dim}     requiredGuardCI=${e.requiredGuardCI}  tests=${e.tests}  allowedFiles=${e.allowedFiles}${C.reset}\n`
  );
  process.stdout.write('\n');
}

if (!HTML_FLAG) process.exit(0);

// ─── HTML dashboard ────────────────────────────────────────────────────────────
const BAND_HEX  = { green: '#00ff00', yellow: '#ffb300', red: '#ef5350', backlog: '#78909c' };
const BAND_BG   = { green: '#1b2e1b', yellow: '#2b2200', red: '#2b1414', backlog: '#1a2030' };

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function htmlScoreBar(score, width = 100) {
  const pct = Math.round((score / 100) * width);
  const color = score >= 80 ? BAND_HEX.green : score >= 60 ? BAND_HEX.yellow : BAND_HEX.red;
  return `<div class="bar-wrap"><div class="bar-fill" style="width:${pct}%;background:${color}"></div></div>`;
}

function pill(label, color) {
  return `<span class="pill" style="background:${color}22;color:${color};border:1px solid ${color}55">${esc(label)}</span>`;
}

function detailPanel(e) {
  const bc    = BAND_HEX[e.band]  ?? '#78909c';
  const bbg   = BAND_BG[e.band]   ?? '#111';
  const tests = e.existingTestsList.length > 0
    ? e.existingTestsList.map(t => {
        const passing = e.passingTestsList.includes(t);
        const icon = passing ? '✅' : '⬜';
        return `<li>${icon} <code>${esc(t.split('/').pop())}</code></li>`;
      }).join('')
    : '<li class="muted">none declared</li>';
  const files = e.allowedFilesList.length > 0
    ? e.allowedFilesList.map(f => `<li><code>${esc(f)}</code></li>`).join('')
    : '<li class="muted">none</li>';
  const guards = e.requiredGuardCIList.length > 0
    ? e.requiredGuardCIList.map(g => `<li><code>${esc(g)}</code></li>`).join('')
    : '<li class="muted">none</li>';

  return `
    <div class="detail-header" style="background:${bbg};border-left:4px solid ${bc}">
      <div class="detail-title">
        <span class="band-dot" style="background:${bc}"></span>
        <span class="id-tag">${esc(e.id)}</span>
        <span class="name-big">${esc(e.name)}</span>
        ${pill(e.band.toUpperCase(), bc)}
        ${pill(e.tier, '#90a4ae')}
        ${pill(e.domain, '#7986cb')}
      </div>
      <div class="score-row">
        <span class="score-num" style="color:${bc}">${e.score}</span>
        <span class="score-label">/ 100</span>
        ${htmlScoreBar(e.score)}
      </div>
    </div>
    <div class="metrics-grid">
      <div class="metric"><span class="mlabel">coverageReal</span><span class="mvalue">${e.coverageReal}%</span></div>
      <div class="metric"><span class="mlabel">surface</span><span class="mvalue">${e.surface}</span></div>
      <div class="metric"><span class="mlabel">legacyDebt</span><span class="mvalue">${e.legacyDebt}</span></div>
      <div class="metric"><span class="mlabel">coupling</span><span class="mvalue">${e.coupling}</span></div>
      <div class="metric"><span class="mlabel">risk</span><span class="mvalue">${e.risk}</span></div>
      <div class="metric"><span class="mlabel">tests (passing)</span><span class="mvalue">${e.tests} / ${e.existingTestsList.length}</span></div>
      <div class="metric"><span class="mlabel">allowedFiles</span><span class="mvalue">${e.allowedFiles}</span></div>
      <div class="metric"><span class="mlabel">owner</span><span class="mvalue">${esc(e.owner)}</span></div>
      <div class="metric"><span class="mlabel">requiredGuardCI</span><span class="mvalue">${e.requiredGuardCI ? '✅ yes' : '❌ no'}</span></div>
    </div>
    ${e.coverageNote ? `<div class="coverage-note"><b>Coverage note:</b> ${esc(e.coverageNote)}</div>` : ''}
    <div class="lists-row">
      <div class="list-block">
        <div class="list-title">Tests</div>
        <ul>${tests}</ul>
      </div>
      <div class="list-block">
        <div class="list-title">Allowed files</div>
        <ul>${files}</ul>
      </div>
      <div class="list-block">
        <div class="list-title">Guard CI</div>
        <ul>${guards}</ul>
      </div>
    </div>
    ${e.notes ? `<div class="notes-block"><b>Notes:</b> ${esc(e.notes)}</div>` : ''}
  `;
}

function sidebarRow(e) {
  const bc = BAND_HEX[e.band] ?? '#78909c';
  return `
    <div class="sb-row" data-id="${esc(e.id)}" onclick="show('${esc(e.id)}')">
      <span class="sb-dot" style="background:${bc}"></span>
      <span class="sb-name">${esc(e.name)}</span>
      <span class="sb-score" style="color:${bc}">${e.score}</span>
    </div>`;
}

const detailsJson = JSON.stringify(
  Object.fromEntries(entries.map(e => [e.id, detailPanel(e)]))
);

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>RF E2R Dashboard</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:ui-monospace,monospace;font-size:13px;background:#0d1117;color:#c9d1d9;display:flex;height:100vh;overflow:hidden}

/* Sidebar */
#sidebar{width:240px;min-width:200px;background:#161b22;border-right:1px solid #30363d;display:flex;flex-direction:column;overflow:hidden}
#sb-header{padding:12px 14px;background:#0d1117;border-bottom:1px solid #30363d}
#sb-header h1{font-size:14px;color:#58a6ff;font-weight:700}
#sb-header .sub{font-size:11px;color:#8b949e;margin-top:3px}
#sb-list{overflow-y:auto;flex:1}
.sb-row{display:flex;align-items:center;gap:8px;padding:7px 14px;cursor:pointer;border-left:3px solid transparent;transition:background .12s}
.sb-row:hover{background:#21262d}
.sb-row.active{background:#1f2937;border-left-color:#58a6ff}
.sb-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.sb-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}
.sb-score{font-size:12px;font-weight:700;flex-shrink:0}

/* Main */
#main{flex:1;overflow-y:auto;padding:0}
#detail{padding:20px 24px}

/* Detail header */
.detail-header{padding:16px 18px;border-radius:6px;margin-bottom:16px}
.detail-title{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px}
.band-dot{width:12px;height:12px;border-radius:50%;flex-shrink:0}
.id-tag{font-size:11px;color:#8b949e;font-weight:700}
.name-big{font-size:18px;font-weight:700;color:#e6edf3}
.pill{font-size:11px;padding:1px 7px;border-radius:10px;font-weight:600}
.score-row{display:flex;align-items:center;gap:10px}
.score-num{font-size:32px;font-weight:900}
.score-label{font-size:14px;color:#8b949e;margin-right:8px}

/* Score bar */
.bar-wrap{flex:1;height:10px;background:#21262d;border-radius:5px;overflow:hidden;max-width:300px}
.bar-fill{height:100%;border-radius:5px;transition:width .3s}

/* Metrics */
.metrics-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px;margin-bottom:14px}
.metric{background:#161b22;border:1px solid #30363d;border-radius:6px;padding:8px 10px}
.mlabel{display:block;font-size:10px;color:#8b949e;margin-bottom:3px;text-transform:uppercase;letter-spacing:.5px}
.mvalue{font-size:14px;font-weight:700;color:#e6edf3}

/* Coverage note */
.coverage-note{background:#1a1e2e;border-left:3px solid #58a6ff;padding:8px 12px;border-radius:0 4px 4px 0;margin-bottom:12px;font-size:12px;color:#8b949e}

/* Lists */
.lists-row{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:14px}
.list-block{background:#161b22;border:1px solid #30363d;border-radius:6px;padding:10px 12px}
.list-title{font-size:11px;font-weight:700;color:#8b949e;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px}
.list-block ul{list-style:none;display:flex;flex-direction:column;gap:4px}
.list-block li{font-size:12px;color:#c9d1d9;word-break:break-all}
.list-block code{font-size:11px;color:#79c0ff;background:#0d1117;padding:1px 4px;border-radius:3px}
.muted{color:#484f58 !important}

/* Notes */
.notes-block{background:#161b22;border:1px solid #30363d;border-radius:6px;padding:10px 12px;font-size:12px;color:#8b949e;line-height:1.6}

/* Scrollbar */
::-webkit-scrollbar{width:6px}
::-webkit-scrollbar-track{background:#0d1117}
::-webkit-scrollbar-thumb{background:#30363d;border-radius:3px}
</style>
</head>
<body>

<div id="sidebar">
  <div id="sb-header">
    <h1>RF E2R Dashboard</h1>
    <div class="sub">${entries.length} subsystems · ${snapshot.totalPassingTests} passing tests</div>
    <div class="sub" style="margin-top:2px;font-size:10px;color:#484f58">${esc(snapshot.generatedAt)}</div>
  </div>
  <div id="sb-list">
    ${entries.map(sidebarRow).join('')}
  </div>
</div>

<div id="main">
  <div id="detail">
    <p style="color:#484f58;margin-top:40px;text-align:center">← Select a subsystem</p>
  </div>
</div>

<script>
const DETAILS = ${detailsJson};

function show(id) {
  document.querySelectorAll('.sb-row').forEach(r => r.classList.toggle('active', r.dataset.id === id));
  const d = document.getElementById('detail');
  d.innerHTML = DETAILS[id] ?? '<p style="color:#484f58">Not found</p>';
}

// Auto-select first
const first = document.querySelector('.sb-row');
if (first) show(first.dataset.id);
</script>
</body>
</html>`;

const HTML_PATH = resolve(ROOT, 'audit/rf_e2r_dashboard.html');
writeFileSync(HTML_PATH, html);

process.stdout.write(`✅ HTML dashboard written → ${HTML_PATH}\n`);
process.exit(0);
