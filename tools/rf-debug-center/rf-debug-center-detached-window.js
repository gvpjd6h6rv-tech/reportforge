import { buildDetachedVisualDoctorTab } from './rf-debug-center-detached-visual-tab.js';
import { DETACHED_DEBUG_CENTER_CLIENT_SCRIPT } from './rf-debug-center-detached-client-script.js';
import { DETACHED_DEBUG_CENTER_STYLES } from './rf-debug-center-detached-styles.js';
'use strict';

const WINDOW_NAME = 'RFDebugCenterDetached';
const WINDOW_FEATURES = 'width=1280,height=850,resizable=yes,scrollbars=yes,menubar=no,toolbar=no,location=no,status=no';

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function safeJson(value, fallback = '{}') {
  try { return JSON.stringify(value ?? {}, null, 2); } catch (_) { return fallback; }
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.entries)) return value.entries;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.events)) return value.events;
  if (Array.isArray(value?.findings)) return value.findings;
  if (Array.isArray(value?.warnings)) return value.warnings;
  return [];
}

function countOf(value) {
  if (Array.isArray(value)) return value.length;
  if (typeof value?.count === 'number') return value.count;
  if (typeof value?.total === 'number') return value.total;
  if (Array.isArray(value?.entries)) return value.entries.length;
  if (Array.isArray(value?.items)) return value.items.length;
  if (Array.isArray(value?.events)) return value.events.length;
  if (Array.isArray(value?.findings)) return value.findings.length;
  if (Array.isArray(value?.warnings)) return value.warnings.length;
  if (value && typeof value === 'object') return Object.keys(value).length;
  return 0;
}

function lastOf(value) {
  const arr = asArray(value);
  return arr.length ? arr[arr.length - 1] : null;
}

function pct(value, max = 10) {
  const n = Math.max(0, Number(value) || 0);
  return Math.max(4, Math.min(100, Math.round((n / Math.max(1, max)) * 100)));
}

function text(value, fallback = 'n/a') {
  const s = String(value ?? '').trim();
  return s || fallback;
}

function normalizeModel(model, bundle) {
  const timeline = model?.timeline || model?.live || model?.entries || {};
  const last = model?.last || lastOf(timeline) || lastOf(model?.timeline?.entries) || null;

  const warningsCount = countOf(model?.warnings);
  const causalCount = countOf(model?.causalIntelligence || model?.causal);
  const networkCount = countOf(model?.network);
  const performanceCount = countOf(model?.performance);
  const domCount = countOf(model?.domScanner);
  const visualCount = countOf(model?.visualEvidence);
  const renderCount = countOf(model?.renderPreview);
  const selectionCount = countOf(model?.selection);
  const timelineCount = countOf(timeline);

  const zoom =
    last?.dom?.dsZoom ??
    last?.after?.dsZoom ??
    last?.before?.dsZoom ??
    model?.zoom?.dsZoom ??
    model?.zoom?.value ??
    'n/a';

  const slider =
    last?.dom?.sliderValue ??
    last?.after?.sliderValue ??
    last?.before?.sliderValue ??
    model?.zoom?.sliderValue ??
    'n/a';

  const pctText =
    last?.dom?.pctText ??
    last?.after?.pctText ??
    last?.before?.pctText ??
    model?.zoom?.pctText ??
    'n/a';

  const visible =
    last?.dom?.visibleElement?.tag ??
    last?.after?.visibleElement?.tag ??
    last?.before?.visibleElement?.tag ??
    'n/a';

  const totalSignal = warningsCount + causalCount + networkCount + performanceCount + domCount + visualCount + renderCount + selectionCount + timelineCount;

  return {
    enabled: !!model?.enabled,
    activation: text(model?.activation, 'disabled'),
    bundleStatus: text(model?.bundle?.status || bundle?.status, 'idle'),
    bundleUpdatedAt: text(model?.bundle?.updatedAt || bundle?.generatedAt, 'n/a'),
    buildCommit: text(model?.build?.commit || model?.commit || model?.version?.commit || window?.opener?.RF_BUILD_COMMIT, 'n/a'),
    last,
    live: {
      event: text(last?.event || last?.action),
      source: text(last?.source || last?.module || last?.engine),
      phase: text(last?.phase),
      fn: text(last?.fn),
      zoom,
      slider,
      pctText,
      visible,
      timestamp: text(last?.timestamp || model?.updatedAt),
    },
    counts: {
      timeline: timelineCount,
      warnings: warningsCount,
      causal: causalCount,
      network: networkCount,
      performance: performanceCount,
      dom: domCount,
      visual: visualCount,
      render: renderCount,
      selection: selectionCount,
      totalSignal,
    },
    raw: model || {},
    bundle: bundle || model?.bundlePreview || model?.bundle || {},
  };
}

function navButton(label, active = false) {
  return `<button class="nav-btn${active ? ' active' : ''}" data-tab="${esc(label)}">${esc(label)}</button>`;
}

function row(label, value, tone = 'cyan') {
  return `
    <div class="rf-row">
      <span>${esc(label)}</span>
      <b class="${esc(tone)}">${esc(value)}</b>
    </div>`;
}

function stat(label, value, tone = 'cyan') {
  return `
    <div class="rf-stat ${esc(tone)}">
      <div class="rf-ring"><span>${esc(value)}</span></div>
      <small>${esc(label)}</small>
    </div>`;
}

function bar(label, value, max, tone = 'cyan') {
  const width = pct(value, max);
  return `
    <div class="rf-cover-row">
      <span>${esc(label)}</span>
      <b>${esc(value)}</b>
      <div class="rf-bar"><i class="${esc(tone)}" style="width:${width}%"></i></div>
    </div>`;
}

function spark(values = [72, 62, 55, 33, 34, 8, 18, 22, 8, 34, 62, 82]) {
  return values.map((v) => {
    const n = Number(v) || 0;
    return `<i class="${n < 0 ? 'neg' : 'pos'}" style="height:${Math.max(8, Math.abs(n))}%"></i>`;
  }).join('');
}

function tabSection(title, body, active = false) {
  return `
    <section class="tab-sec${active ? ' active' : ''}" data-tab="${esc(title)}">
      ${body}
    </section>`;
}

function buildDashboard(data) {
  const maxSignal = Math.max(10, data.counts.totalSignal);

  return `
    <section class="rf-left panel">
      <h2>RF STATUS</h2>
      <div class="rf-gauge">
        <div>
          <strong>${esc(data.counts.timeline)}</strong>
          <em>timeline</em>
        </div>
      </div>

      <div class="rf-pill-grid">
        <span class="${data.enabled ? 'ok' : 'off'}">${data.enabled ? 'ENABLED' : 'DISABLED'}</span>
        <span>${esc(data.activation)}</span>
      </div>

      <div class="rf-list">
        ${row('Overview', 'ON', 'green')}
        ${row('Causal', data.counts.causal, data.counts.causal ? 'yellow' : 'green')}
        ${row('Warnings', data.counts.warnings, data.counts.warnings ? 'orange' : 'green')}
        ${row('DOM Scanner', data.counts.dom, 'cyan')}
        ${row('Network', data.counts.network, 'cyan')}
        ${row('Performance', data.counts.performance, 'cyan')}
        ${row('Render', data.counts.render, 'cyan')}
        ${row('Selection', data.counts.selection, 'cyan')}
        ${row('Visual', data.counts.visual, 'cyan')}
        ${row('Bundle', data.bundleStatus, data.bundleStatus === 'ready' || data.bundleStatus === 'copied' ? 'green' : 'cyan')}
      </div>
    </section>

    <section class="rf-center">
      <section class="panel rf-live">
        <h2>LIVE EVENT</h2>
        <div class="rf-two">
          ${row('event', data.live.event)}
          ${row('source', data.live.source)}
          ${row('phase', data.live.phase)}
          ${row('fn', data.live.fn)}
          ${row('dsZoom', data.live.zoom)}
          ${row('slider', data.live.slider)}
          ${row('pct', data.live.pctText)}
          ${row('visible', data.live.visible)}
        </div>
      </section>

      <section class="panel rf-runtime">
        <h2>RUNTIME METRICS</h2>
        <div class="rf-stats">
          ${stat('Warnings', data.counts.warnings, data.counts.warnings ? 'orange' : 'green')}
          ${stat('Causal', data.counts.causal, data.counts.causal ? 'yellow' : 'green')}
          ${stat('Network', data.counts.network, 'cyan')}
          ${stat('Performance', data.counts.performance, 'cyan')}
        </div>
      </section>

      <section class="panel rf-overview">
        <h2>OVERVIEW</h2>
        <div class="rf-two">
          ${row('build / commit', data.buildCommit)}
          ${row('bundle', data.bundleStatus)}
          ${row('bundle updated', data.bundleUpdatedAt)}
          ${row('last event at', data.live.timestamp)}
        </div>
      </section>
    </section>

    <section class="rf-right">
      <section class="panel rf-chart">
        <h2>SIGNALS</h2>
        <div class="rf-bars">${spark([
          data.counts.timeline * 6,
          data.counts.warnings * 12,
          data.counts.causal * 12,
          data.counts.network * 8,
          data.counts.performance * 8,
          data.counts.dom * 10,
          data.counts.visual * 10,
          data.counts.render * 10,
          data.counts.selection * 10,
          36,
          52,
          74,
        ])}</div>
      </section>

      <section class="panel rf-coverage">
        <h2>COVERAGE <strong>${Math.min(100, Math.max(0, 40 + data.counts.totalSignal * 4))}%</strong></h2>
        ${bar('Timeline', data.counts.timeline, maxSignal, 'cyan')}
        ${bar('Zoom', data.live.zoom === 'n/a' ? 0 : 1, 1, 'green')}
        ${bar('Warnings', data.counts.warnings, maxSignal, data.counts.warnings ? 'orange' : 'green')}
        ${bar('Bundle', data.bundleStatus === 'ready' || data.bundleStatus === 'copied' ? 1 : 0, 1, 'green')}
        ${bar('Total', data.counts.totalSignal, maxSignal, 'cyan')}
      </section>

      <section class="panel rf-actions">
        <h2>ACTIONS</h2>
        <button class="act refresh" data-act="refresh">REFRESH</button>
        <button class="act copy" data-act="copy">COPY BUNDLE</button>
        <button class="act close" data-act="close">CLOSE</button>
      </section>
    </section>`;
}


function buildHtml(payload) {
  const data = normalizeModel(payload.model, payload.bundle);
  const tabs = [
    ['Dashboard', buildDashboard(data)],
    ['Raw JSON', `<section class="panel raw-panel"><h2>RAW JSON</h2><pre>${esc(safeJson(data.raw))}</pre></section>`],
    ['Bundle', `<section class="panel raw-panel"><h2>BUNDLE</h2><pre>${esc(safeJson(data.bundle))}</pre></section>`],
    ['Last Event', `<section class="panel raw-panel"><h2>LAST EVENT</h2><pre>${esc(safeJson(data.last))}</pre></section>`],
  ];

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>RF Debug Center</title>
<style>
${DETACHED_DEBUG_CENTER_STYLES}
@media (max-width:1100px){
  .tab-sec[data-tab="Dashboard"].active{grid-template-columns:1fr;overflow:auto}
  .shell{grid-template-columns:180px minmax(0,1fr)}
  body{overflow:auto}
}
</style>
</head>
<body>
<div class="app">
  <header>
    <div class="title">
      <h1>RF DEBUG CENTER</h1>
      <div>REPORTFORGE · OBSERVABILITY · REPLAY · E2E · STATE · BUNDLE</div>
    </div>
    <div class="top-actions">
      <button class="headbtn" data-act="refresh">Refresh</button>
      <button class="headbtn" data-act="copy">Copy Bundle</button>
      <button class="headbtn" data-act="close">Close</button>
    </div>
  </header>

  <div class="shell">
    <nav><div class="nav-stack">
      ${tabs.map(([name], index) => navButton(name, index === 0)).join('')}
      ${['Overview','Causal','Warnings','DOM Scanner','Network','Performance','Render','Selection','Visual'].map((name) => navButton(name)).join('')}
    </div></nav>
    <main>
      ${tabs.map(([name, body], index) => tabSection(name, body, index === 0)).join('')}
      ${tabSection('Overview', `<section class="panel raw-panel"><h2>OVERVIEW</h2><pre>${esc(safeJson({ enabled: data.enabled, activation: data.activation, counts: data.counts, live: data.live }))}</pre></section>`)}
      ${tabSection('Causal', `<section class="panel raw-panel"><h2>CAUSAL</h2><pre>${esc(safeJson(data.raw?.causalIntelligence || data.raw?.causal || {}))}</pre></section>`)}
      ${tabSection('Warnings', `<section class="panel raw-panel"><h2>WARNINGS</h2><pre>${esc(safeJson(data.raw?.warnings || {}))}</pre></section>`)}
      ${tabSection('DOM Scanner', `<section class="panel raw-panel"><h2>DOM SCANNER</h2><pre>${esc(safeJson(data.raw?.domScanner || {}))}</pre></section>`)}
      ${tabSection('Network', `<section class="panel raw-panel"><h2>NETWORK</h2><pre>${esc(safeJson(data.raw?.network || {}))}</pre></section>`)}
      ${tabSection('Performance', `<section class="panel raw-panel"><h2>PERFORMANCE</h2><pre>${esc(safeJson(data.raw?.performance || {}))}</pre></section>`)}
      ${tabSection('Render', `<section class="panel raw-panel"><h2>RENDER</h2><pre>${esc(safeJson(data.raw?.renderPreview || {}))}</pre></section>`)}
      ${tabSection('Selection', `<section class="panel raw-panel"><h2>SELECTION</h2><pre>${esc(safeJson(data.raw?.selection || {}))}</pre></section>`)}
      ${tabSection('Visual', buildDetachedVisualDoctorTab(data, { esc, row, safeJson }))}
    </main>
  </div>

  <footer>
    <span>last sync ${esc(payload.syncedAt)}</span>
    <span>window: real detached browser popup · ReportForge</span>
  </footer>
</div>
<script>
${DETACHED_DEBUG_CENTER_CLIENT_SCRIPT}
</script>
</body>
</html>`;
}

export function createDetachedDebugCenterWindow(win, { getState, buildBundle, copyBundleJSON, onClose } = {}) {
  const window = win;
  const state = {
    child: null,
    open: false,
    closed: true,
    popupBlocked: false,
    lastSyncAt: null,
    error: null,
  };

  const snapshot = () => ({
    open: state.open,
    closed: state.closed,
    popupBlocked: state.popupBlocked,
    lastSyncAt: state.lastSyncAt,
    error: state.error,
  });

  const cleanup = () => {
    if (state.child?.closed) state.child = null;
    state.open = false;
    state.closed = true;
  };

  const read = () => {
    const model = typeof getState === 'function' ? getState() : null;
    const bundle = typeof buildBundle === 'function' ? buildBundle() : null;
    return {
      model,
      bundle,
      syncedAt: new Date().toISOString(),
    };
  };

  const write = (child, payload) => {
    child.document.open();
    child.document.write(buildHtml(payload));
    child.document.close();
  };

  const sync = () => {
    if (!state.child || state.child.closed) {
      cleanup();
      return snapshot();
    }
    try {
      write(state.child, read());
      state.lastSyncAt = new Date().toISOString();
      state.error = null;
      state.open = true;
      state.closed = false;
    } catch (error) {
      state.error = error?.message || 'sync-failed';
    }
    return snapshot();
  };

  const open = () => {
    if (state.child && !state.child.closed) {
      state.open = true;
      state.closed = false;
      state.popupBlocked = false;
      sync();
      state.child.focus?.();
      return snapshot();
    }

    try {
      const child = window.open('about:blank', WINDOW_NAME, WINDOW_FEATURES);
      if (!child) {
        state.popupBlocked = true;
        state.error = 'popup-blocked';
        state.open = false;
        state.closed = true;
        return snapshot();
      }

      state.child = child;
      state.open = true;
      state.closed = false;
      state.popupBlocked = false;
      state.error = null;

      write(child, read());
      state.lastSyncAt = new Date().toISOString();
      child.focus?.();
      child.addEventListener?.('beforeunload', () => cleanup(), { once: true });
      return snapshot();
    } catch (error) {
      state.popupBlocked = false;
      state.error = error?.message || 'open-failed';
      state.open = false;
      state.closed = true;
      return snapshot();
    }
  };

  const close = () => {
    const child = state.child;
    if (child && !child.closed) {
      try { child.close(); } catch (_) {}
    }
    state.child = null;
    state.open = false;
    state.closed = true;
    state.popupBlocked = false;
    state.error = null;
    if (typeof onClose === 'function') onClose();
    return snapshot();
  };

  const getDetachedState = () => {
    if (state.child && state.child.closed) cleanup();
    return snapshot();
  };

  return {
    open,
    close,
    sync,
    getState: getDetachedState,
    snapshot,
  };
}

export { WINDOW_NAME, WINDOW_FEATURES };
