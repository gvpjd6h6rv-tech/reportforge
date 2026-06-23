'use strict';
/**
 * Pure HTML template builder for the static SP Score dashboard. No I/O, no
 * fetch, no eval, no subprocess — it only renders data it is handed. Mirrors
 * the existing real RF precedent (scripts/rf_e2r_dashboard.mjs writing
 * audit/rf_e2r_dashboard.html with data baked in at generation time, no
 * client-side fetch). Never recomputes any score — every number here was
 * already produced by runner/run_salad_score.mjs.
 */

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const LEVEL_COLOR = {
  limpio: '#3fb950',
  aceptable: '#58a6ff',
  sospechoso: '#d29922',
  ensalada_seria: '#f0883e',
  ensalada_nivel_dios: '#f85149',
};

function levelBadge(level) {
  const color = LEVEL_COLOR[level] || '#8b949e';
  return `<span class="badge" style="background:${color}22;color:${color};border:1px solid ${color}55">${esc(level)}</span>`;
}

// SPD1G: every <th> gets the same sortable-column markup. Sorting itself is
// pure client-side DOM reordering (see SCRIPT below) — no score is ever
// recomputed, only the already-rendered <tr> elements are reordered.
function th(label) {
  return `<th role="columnheader" tabindex="0" aria-sort="none">${esc(label)}</th>`;
}

const LEVEL_DISPLAY = {
  limpio: { emoji: '🟢', label: 'Limpio' },
  aceptable: { emoji: '🟡', label: 'Aceptable' },
  sospechoso: { emoji: '🟠', label: 'Sospechoso' },
  ensalada_seria: { emoji: '🔴', label: 'Ensalada seria' },
  ensalada_nivel_dios: { emoji: '🧨', label: 'Ensalada nivel dios' },
};

// Ranges come from config.levelScale (the real, single source of truth for
// the score scale) — only the emoji/display label is presentational here.
function renderScoreScale(levelScale) {
  const rows = levelScale.map((entry) => {
    const display = LEVEL_DISPLAY[entry.level] || { emoji: '⬜', label: entry.level };
    return `<tr><td>${entry.min}-${entry.max}</td><td>${display.emoji} ${esc(display.label)}</td></tr>`;
  }).join('');
  return `
    <h3>📊 Escala SP Score</h3>
    <table>
      <thead><tr>${th('Rango')}${th('Nivel')}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="hint">score alto = más ensalada</p>`;
}

function countBy(results, getKeyOrKeys) {
  const counts = new Map();
  for (const r of results) {
    const keys = getKeyOrKeys(r);
    for (const k of keys) counts.set(k, (counts.get(k) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function renderSummary(results, repoScore, levelScale) {
  const byLevel = countBy(results, (r) => [r.level]);
  const cards = byLevel.map(([level, n]) => `
    <div class="card">
      <div class="card-label">${levelBadge(level)}</div>
      <div class="card-value">${n}</div>
    </div>`).join('');
  return `
  <section id="resumen">
    <h2>🥗 Resumen</h2>
    <div class="cards">
      <div class="card"><div class="card-label">SP_REPO_SCORE</div><div class="card-value">${repoScore.toFixed(2)}</div></div>
      <div class="card"><div class="card-label">Archivos escaneados</div><div class="card-value">${results.length}</div></div>
      ${cards}
    </div>
    ${renderScoreScale(levelScale)}
  </section>`;
}

function renderTopOfensores(results, top) {
  const sorted = [...results].sort((a, b) => b.sp_total_score - a.sp_total_score).slice(0, top);
  const rows = sorted.map((r) => `
    <tr>
      <td>${r.sp_total_score}</td>
      <td>${levelBadge(r.level)}</td>
      <td><a href="#file-${esc(r.path)}">${esc(r.path)}</a></td>
    </tr>`).join('');
  return `
  <section id="top-ensalada">
    <h2>🔥 Top Ensalada</h2>
    <p class="hint">Escala 0-100: cuanto más alto, más ensalada (peor).</p>
    <table>
      <thead><tr>${th('SP_TOTAL_SCORE')}${th('Nivel')}${th('Archivo')}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`;
}

function renderArchivos(results) {
  const rows = results.map((r) => `
    <tr class="file-row" data-path="${esc(r.path)}" data-level="${esc(r.level)}" id="file-${esc(r.path)}">
      <td>${r.sp_total_score}</td>
      <td>${levelBadge(r.level)}</td>
      <td>${esc(r.path)}</td>
      <td>${esc(r.owner)}</td>
      <td>${r.loc}</td>
      <td>${esc(r.responsibilities_detected.join(', '))}</td>
      <td>${esc(r.violated_rules.join(', '))}</td>
    </tr>`).join('');
  return `
  <section id="archivos">
    <h2>📁 Archivos</h2>
    <input id="filter-input" type="text" placeholder="Filtrar por path, owner o nivel...">
    <table id="files-table">
      <thead><tr>${th('Score')}${th('Nivel')}${th('Path')}${th('Owner')}${th('LOC')}${th('Responsabilidades')}${th('Reglas violadas')}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`;
}

function renderResponsabilidades(results) {
  const counts = countBy(results, (r) => r.responsibilities_detected);
  const rows = counts.map(([cat, n]) => `<tr><td>${esc(cat)}</td><td>${n}</td></tr>`).join('');
  return `
  <section id="responsabilidades">
    <h2>🧠 Responsabilidades</h2>
    <table><thead><tr>${th('Categoría')}${th('Archivos')}</tr></thead><tbody>${rows}</tbody></table>
  </section>`;
}

function renderReglasVioladas(results) {
  const counts = countBy(results, (r) => r.violated_rules);
  const rows = counts.map(([rule, n]) => `<tr><td>${esc(rule)}</td><td>${n}</td></tr>`).join('');
  return `
  <section id="reglas-violadas">
    <h2>🧪 Reglas Violadas</h2>
    <table><thead><tr>${th('Regla')}${th('Archivos')}</tr></thead><tbody>${rows}</tbody></table>
  </section>`;
}

function renderOwnership(results) {
  const byOwner = new Map();
  for (const r of results) {
    if (!byOwner.has(r.owner)) byOwner.set(r.owner, []);
    byOwner.get(r.owner).push(r.sp_total_score);
  }
  const rows = [...byOwner.entries()].map(([owner, scores]) => {
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    return `<tr><td>${esc(owner)}</td><td>${scores.length}</td><td>${avg.toFixed(1)}</td></tr>`;
  }).join('');
  return `
  <section id="ownership">
    <h2>🧭 Ownership</h2>
    <table><thead><tr>${th('Owner')}${th('Archivos')}${th('Score promedio')}</tr></thead><tbody>${rows}</tbody></table>
  </section>`;
}

function renderMetricas(results) {
  const avg = (key) => results.length ? (results.reduce((a, r) => a + (r[key] || 0), 0) / results.length).toFixed(1) : '0';
  return `
  <section id="metricas">
    <h2>📊 Métricas</h2>
    <div class="cards">
      <div class="card"><div class="card-label">SP_FILE_SCORE promedio</div><div class="card-value">${avg('sp_file_score')}</div></div>
      <div class="card"><div class="card-label">SP_BEHAVIOR_SCORE promedio</div><div class="card-value">${avg('sp_behavior_score')}</div></div>
      <div class="card"><div class="card-label">LOC promedio</div><div class="card-value">${avg('loc')}</div></div>
    </div>
  </section>`;
}

function renderSugerencias(results) {
  const withSplit = results.filter((r) => r.suggested_split.length > 0);
  const rows = withSplit.map((r) => `<tr><td>${esc(r.path)}</td><td>${esc(r.suggested_split.join(' · '))}</td></tr>`).join('');
  return `
  <section id="sugerencias">
    <h2>🛠️ Sugerencias</h2>
    <table><thead><tr>${th('Archivo')}${th('Sugerencias')}</tr></thead><tbody>${rows}</tbody></table>
  </section>`;
}

function renderRawJson(results, repoScore, generatedAt) {
  const payload = JSON.stringify({ repoScore, generatedAt, files: results }, null, 2);
  return `
  <section id="raw-json">
    <h2>📄 Raw JSON</h2>
    <button id="copy-json-btn">Copiar JSON</button>
    <pre id="raw-json-content">${esc(payload)}</pre>
  </section>`;
}

function renderConfig(config) {
  return `
  <section id="config">
    <h2>⚙️ Config</h2>
    <pre>${esc(JSON.stringify(config, null, 2))}</pre>
  </section>`;
}

const SIDEBAR_LINKS = [
  ['resumen', '🥗 Resumen'],
  ['top-ensalada', '🔥 Top Ensalada'],
  ['archivos', '📁 Archivos'],
  ['responsabilidades', '🧠 Responsabilidades'],
  ['reglas-violadas', '🧪 Reglas Violadas'],
  ['ownership', '🧭 Ownership'],
  ['metricas', '📊 Métricas'],
  ['sugerencias', '🛠️ Sugerencias'],
  ['raw-json', '📄 Raw JSON'],
  ['config', '⚙️ Config'],
];

function renderSidebar() {
  const links = SIDEBAR_LINKS.map(([id, label]) => `<a href="#${id}">${label}</a>`).join('\n      ');
  return `<nav class="sidebar">\n      ${links}\n    </nav>`;
}

const STYLE = `
  :root { color-scheme: dark; }
  body { background: #0d1117; color: #c9d1d9; font-family: -apple-system, sans-serif; margin: 0; display: flex; }
  .sidebar { width: 220px; flex: 0 0 220px; background: #161b22; height: 100vh; position: sticky; top: 0; padding: 16px; box-sizing: border-box; display: flex; flex-direction: column; gap: 8px; }
  .sidebar a { color: #c9d1d9; text-decoration: none; padding: 6px 8px; border-radius: 6px; }
  .sidebar a:hover { background: #21262d; }
  main { padding: 24px; flex: 1; min-width: 0; }
  section { margin-bottom: 48px; }
  h2 { border-bottom: 1px solid #30363d; padding-bottom: 8px; }
  .cards { display: flex; gap: 16px; flex-wrap: wrap; }
  .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px; min-width: 160px; }
  .card-label { font-size: 12px; color: #8b949e; margin-bottom: 8px; }
  .card-value { font-size: 28px; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid #21262d; }
  th { cursor: pointer; user-select: none; position: relative; }
  th:hover { background: #21262d; }
  th[aria-sort="ascending"]::after { content: ' ▲'; color: #58a6ff; }
  th[aria-sort="descending"]::after { content: ' ▼'; color: #58a6ff; }
  th[aria-sort="none"]::after { content: ' ⇕'; color: #484f58; }
  .badge { padding: 2px 8px; border-radius: 12px; font-size: 12px; }
  pre { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px; overflow: auto; max-height: 500px; }
  input#filter-input { width: 100%; padding: 8px; margin-bottom: 12px; background: #0d1117; color: #c9d1d9; border: 1px solid #30363d; border-radius: 6px; }
  button { background: #238636; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; margin-bottom: 8px; }
  .hint { color: #8b949e; font-size: 13px; }
`;

// DOM-only filtering and a clipboard copy — no fetch, no eval, no exec.
const SCRIPT = `
  document.getElementById('filter-input').addEventListener('input', function (e) {
    var q = e.target.value.toLowerCase();
    document.querySelectorAll('.file-row').forEach(function (row) {
      var hay = (row.dataset.path + ' ' + row.dataset.level).toLowerCase();
      row.style.display = hay.indexOf(q) === -1 ? 'none' : '';
    });
  });
  document.getElementById('copy-json-btn').addEventListener('click', function () {
    var text = document.getElementById('raw-json-content').textContent;
    navigator.clipboard.writeText(text);
  });

  // SPD1G: generic client-side table sorting. Sorts the already-rendered
  // row elements by comparing cell text (numeric-aware) — never recomputes
  // any score, never fetches, never executes a string. Applies to every
  // column header in every table in the document.
  document.querySelectorAll('table').forEach(function (table) {
    var headers = Array.prototype.slice.call(table.querySelectorAll('th'));
    headers.forEach(function (header, columnIndex) {
      function sortByColumn() {
        var tbody = table.querySelector('tbody');
        if (!tbody) return;
        var ascending = header.getAttribute('aria-sort') !== 'ascending';
        headers.forEach(function (h) { h.setAttribute('aria-sort', 'none'); });
        header.setAttribute('aria-sort', ascending ? 'ascending' : 'descending');

        var rows = Array.prototype.slice.call(tbody.querySelectorAll('tr'));
        rows.sort(function (rowA, rowB) {
          var cellA = rowA.children[columnIndex] ? rowA.children[columnIndex].textContent.trim() : '';
          var cellB = rowB.children[columnIndex] ? rowB.children[columnIndex].textContent.trim() : '';
          var numA = parseFloat(cellA);
          var numB = parseFloat(cellB);
          var bothNumeric = /^-?[\\d.]+$/.test(cellA) && /^-?[\\d.]+$/.test(cellB) && !isNaN(numA) && !isNaN(numB);
          var comparison = bothNumeric ? (numA - numB) : cellA.localeCompare(cellB);
          return ascending ? comparison : -comparison;
        });
        rows.forEach(function (row) { tbody.appendChild(row); });
      }
      header.addEventListener('click', sortByColumn);
      header.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        sortByColumn();
      });
    });
  });
`;

export function templateDashboard({ results, repoScore, config, generatedAt }) {
  const top = config.dashboardTop || 20;
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>RF Salad Point Score Dashboard</title>
<style>${STYLE}</style>
</head>
<body>
  ${renderSidebar()}
  <main>
    <h1>🥗 RF Salad Point Score</h1>
    <p class="hint">Generado: ${esc(generatedAt)} — reporte estático, sin backend, sin fetch, sin ejecución.</p>
    ${renderSummary(results, repoScore, config.levelScale)}
    ${renderTopOfensores(results, top)}
    ${renderArchivos(results)}
    ${renderResponsabilidades(results)}
    ${renderReglasVioladas(results)}
    ${renderOwnership(results)}
    ${renderMetricas(results)}
    ${renderSugerencias(results)}
    ${renderRawJson(results, repoScore, generatedAt)}
    ${renderConfig(config)}
  </main>
  <script>${SCRIPT}</script>
</body>
</html>
`;
}
