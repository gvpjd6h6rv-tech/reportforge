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


function pickVisualDoctorModel(data) {
  return (
    data.raw?.visualDoctor ||
    data.raw?.rfVisualDoctor ||
    data.raw?.visualEvidence?.visualDoctor ||
    data.raw?.visualEvidence ||
    null
  );
}

function visualCount(model, key) {
  const value = model?.[key];
  if (Array.isArray(value)) return value.length;
  if (Array.isArray(value?.items)) return value.items.length;
  if (Array.isArray(value?.entries)) return value.entries.length;
  if (Array.isArray(value?.findings)) return value.findings.length;
  return 0;
}

function buildVisualDoctorTab(data) {
  const model = pickVisualDoctorModel(data);
  const hasModel = !!model && typeof model === 'object' && Object.keys(model).length > 0;
  const counts = {
    selectors: visualCount(model, 'selectors'),
    snapshots: visualCount(model, 'snapshots'),
    findings: visualCount(model, 'findings'),
    baseline: visualCount(model, 'baselineResults'),
    components: visualCount(model, 'components'),
  };

  const safety = model?.safety || {
    readOnly: true,
    embedsScreenshots: false,
    writesFiles: false,
    autopatch: false,
  };

  const status = hasModel ? 'live model available' : 'core installed / no live model yet';
  const findingPreview = Array.isArray(model?.findings) && model.findings.length
    ? model.findings.slice(0, 8).map((finding) => `
      <div class="rf-visual-finding">
        <b>${esc(finding.type || finding.kind || 'VISUAL_FINDING')}</b>
        <span>${esc(finding.severity || 'CANDIDATE')}</span>
        <small>${esc(finding.affectedElement || finding.selector || finding.affectedLabel || 'unknown')}</small>
      </div>
    `).join('')
    : '<div class="rf-empty">No visual findings loaded in detached model.</div>';

  return `
    <section class="rf-visual-grid">
      <section class="panel rf-visual-hero">
        <h2>RF VISUAL DOCTOR CSS</h2>
        <p class="rf-muted">Visual diagnostics, CSSOM evidence, safe forensic bundle and runtime-only repair path.</p>
        <div class="rf-pill-grid">
          <span class="${hasModel ? 'ok' : 'off'}">${esc(status)}</span>
          <span>schema: ${esc(model?.schema || 'rf-debug-visual-doctor/v1')}</span>
        </div>
        <div class="rf-two">
          ${row('selectors', counts.selectors, 'cyan')}
          ${row('snapshots', counts.snapshots, 'cyan')}
          ${row('components', counts.components, 'cyan')}
          ${row('findings', counts.findings, counts.findings ? 'orange' : 'green')}
          ${row('baseline sections', counts.baseline, counts.baseline ? 'yellow' : 'cyan')}
          ${row('generated', model?.generatedAt || 'pending', 'cyan')}
        </div>
      </section>

      <section class="panel rf-visual-guard">
        <h2>VISUAL REGRESSION GUARD</h2>
        <div class="rf-guard-steps">
          <div><b>1</b><span>Baseline por pantalla</span></div>
          <div><b>2</b><span>Comparación nueva corrida vs baseline</span></div>
          <div><b>3</b><span>Histórico por commit/browser/viewport</span></div>
          <div><b>4</b><span>Ranking de regresiones</span></div>
          <div><b>5</b><span>Artifact JSON seguro</span></div>
        </div>
      </section>

      <section class="panel rf-visual-safety">
        <h2>SAFETY CONTRACT</h2>
        <div class="rf-list">
          ${row('read only', safety.readOnly !== false ? 'yes' : 'no', safety.readOnly !== false ? 'green' : 'orange')}
          ${row('embeds screenshots', safety.embedsScreenshots ? 'yes' : 'no', safety.embedsScreenshots ? 'orange' : 'green')}
          ${row('writes files', safety.writesFiles ? 'yes' : 'no', safety.writesFiles ? 'orange' : 'green')}
          ${row('autopatch', safety.autopatch ? 'yes' : 'no', safety.autopatch ? 'orange' : 'green')}
          ${row('rollback required', 'VD3', 'yellow')}
        </div>
      </section>

      <section class="panel rf-visual-findings">
        <h2>FINDINGS PREVIEW</h2>
        ${findingPreview}
      </section>

      <section class="panel raw-panel rf-visual-json">
        <h2>VISUAL MODEL JSON</h2>
        <pre>${esc(safeJson(model || { status }))}</pre>
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
:root{color-scheme:dark}
html,body{height:100%;margin:0}
body{
  background:#020711;
  color:#e9fbff;
  font:14px/1.45 Inter,Orbitron,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  overflow:hidden;
}
*{box-sizing:border-box}
.app{
  width:100vw;
  height:100vh;
  padding:24px 30px 28px;
  background:
    radial-gradient(circle at 50% 0%, rgba(0,255,255,.20), transparent 36%),
    radial-gradient(circle at 0% 100%, rgba(82,255,141,.12), transparent 34%),
    linear-gradient(180deg,#07131d 0%,#03070d 100%);
  border:1px solid rgba(87,235,255,.42);
  box-shadow:inset 0 0 46px rgba(0,255,255,.08);
  display:grid;
  grid-template-rows:84px minmax(0,1fr) 30px;
  gap:18px;
}
header{
  position:relative;
  display:flex;
  align-items:center;
  justify-content:center;
  border-bottom:1px solid rgba(96,242,255,.35);
}
header:before,header:after{
  content:"";
  position:absolute;
  top:38px;
  width:27%;
  height:2px;
  background:linear-gradient(90deg,transparent,#61f6ff,transparent);
}
header:before{left:0}
header:after{right:0}
.title{text-align:center}
.title h1{
  margin:0;
  font-size:39px;
  letter-spacing:5px;
  font-weight:900;
  color:#c7fbff;
  text-shadow:0 0 14px #5ef7ff,0 0 35px #28c7ff;
}
.title div{
  margin-top:7px;
  color:#60eaff;
  font-size:12px;
  letter-spacing:4px;
  opacity:.82;
}
.top-actions{
  position:absolute;
  right:0;
  top:18px;
  display:flex;
  gap:8px;
}
.headbtn{
  border:1px solid rgba(120,240,255,.45);
  background:#071725;
  color:#e9fbff;
  border-radius:999px;
  padding:7px 12px;
  font:inherit;
  cursor:pointer;
  box-shadow:inset 0 0 12px rgba(69,218,255,.12);
}
.shell{
  display:grid;
  grid-template-columns:220px minmax(0,1fr);
  gap:18px;
  min-height:0;
}
nav{
  padding:16px;
  border:1px solid rgba(101,223,255,.42);
  border-radius:18px;
  background:linear-gradient(180deg,rgba(13,30,45,.96),rgba(5,12,22,.98));
  box-shadow:inset 0 0 26px rgba(37,210,255,.08),0 0 16px rgba(0,0,0,.8);
  overflow:auto;
}
.nav-stack{display:grid;gap:9px}
.nav-btn{
  height:39px;
  border:1px solid rgba(93,223,255,.25);
  background:rgba(8,21,34,.78);
  color:#dffcff;
  text-align:left;
  border-radius:8px;
  padding:0 12px;
  font-weight:800;
  cursor:pointer;
}
.nav-btn.active{
  background:linear-gradient(180deg,#11516b,#092334);
  border-color:rgba(101,242,255,.75);
  box-shadow:0 0 16px rgba(49,232,255,.25),inset 0 0 16px rgba(49,232,255,.10);
}
main{min-width:0;min-height:0;overflow:hidden}
.tab-sec{display:none;height:100%;min-height:0}
.tab-sec.active{display:block}
.panel{
  background:linear-gradient(180deg,rgba(13,30,45,.96),rgba(5,12,22,.98));
  border:1px solid rgba(101,223,255,.42);
  border-radius:18px;
  box-shadow:inset 0 0 26px rgba(37,210,255,.08),0 0 16px rgba(0,0,0,.8);
}
.panel h2{
  margin:0 0 14px;
  color:#f0fdff;
  font-size:15px;
  letter-spacing:2px;
  text-shadow:0 0 10px rgba(102,245,255,.8);
}
.tab-sec[data-tab="Dashboard"]{
  display:none;
}
.tab-sec[data-tab="Dashboard"].active{
  display:grid;
  grid-template-columns:24% 36% 40%;
  gap:18px;
}
.rf-left,.rf-live,.rf-runtime,.rf-overview,.rf-chart,.rf-coverage,.rf-actions,.raw-panel{
  padding:20px;
  min-height:0;
}
.rf-left{display:flex;flex-direction:column;overflow:hidden}
.rf-center,.rf-right{display:grid;gap:18px;min-height:0}
.rf-center{grid-template-rows:34% 32% 1fr}
.rf-right{grid-template-rows:32% 39% 1fr}
.rf-gauge{
  width:210px;
  height:210px;
  margin:8px auto 14px;
  border-radius:50%;
  display:grid;
  place-items:center;
  background:conic-gradient(#72ff55 0 46%,#ffdb45 46% 62%,#ff9d45 62% 76%,rgba(255,255,255,.08) 76% 100%);
  box-shadow:0 0 30px rgba(83,255,86,.35),inset 0 0 30px #08121c;
  position:relative;
}
.rf-gauge:after{
  content:"";
  position:absolute;
  inset:27px;
  border-radius:50%;
  background:radial-gradient(circle,#152334,#050b13);
  box-shadow:inset 0 0 25px #000;
}
.rf-gauge div{position:relative;z-index:1;text-align:center}
.rf-gauge strong{display:block;font-size:42px}
.rf-gauge em{display:block;font-style:normal;font-size:18px;color:#9fefff;text-transform:uppercase}
.rf-pill-grid{display:grid;grid-template-columns:1fr;gap:8px;margin-bottom:14px}
.rf-pill-grid span{
  border:1px solid rgba(120,240,255,.28);
  border-radius:999px;
  padding:7px 10px;
  text-align:center;
  background:rgba(8,21,34,.78);
  color:#dffcff;
  font-weight:900;
}
.rf-pill-grid .ok{color:#baffc8;border-color:rgba(108,255,125,.55);box-shadow:0 0 12px rgba(108,255,125,.25)}
.rf-pill-grid .off{color:#ffb8aa;border-color:rgba(255,112,72,.55)}
.rf-list{overflow:auto;padding-right:4px}
.rf-row{
  min-height:38px;
  display:grid;
  grid-template-columns:minmax(0,1fr) auto;
  align-items:center;
  gap:10px;
  margin-bottom:8px;
  padding:0 10px;
  border:1px solid rgba(93,223,255,.25);
  background:rgba(8,21,34,.78);
  font-size:15px;
}
.rf-row span{
  min-width:0;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}
.rf-row span:before{
  content:"";
  display:inline-block;
  width:5px;
  height:16px;
  margin-right:10px;
  vertical-align:-3px;
  background:#58f8ff;
  box-shadow:0 0 10px #58f8ff;
}
.rf-row b{font-size:13px;max-width:230px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cyan{color:#31e8ff}
.green{color:#6cff7d}
.yellow{color:#eaff4f}
.orange{color:#ffae44}
.red{color:#ff7048}
.rf-two{display:grid;grid-template-columns:1fr 1fr;gap:8px 12px}
.rf-stats{
  height:calc(100% - 28px);
  display:grid;
  grid-template-columns:repeat(4,1fr);
  gap:14px;
  align-items:center;
}
.rf-stat{text-align:center}
.rf-ring{
  width:100px;
  height:100px;
  margin:0 auto 10px;
  border-radius:50%;
  display:grid;
  place-items:center;
  background:conic-gradient(var(--tone) 0 78%,rgba(255,255,255,.08) 78% 100%);
  box-shadow:0 0 22px rgba(49,232,255,.22);
}
.rf-stat.cyan{--tone:#27e7ff}
.rf-stat.yellow{--tone:#ffe84b}
.rf-stat.orange{--tone:#ffae4e}
.rf-stat.green{--tone:#65ff89}
.rf-ring span{
  width:74px;
  height:74px;
  border-radius:50%;
  display:grid;
  place-items:center;
  background:#08121c;
  font-size:22px;
  font-weight:900;
}
.rf-stat small{color:#9fefff;text-transform:uppercase;font-size:11px}
.rf-chart{display:flex;flex-direction:column}
.rf-bars{
  flex:1;
  display:grid;
  grid-template-columns:repeat(12,1fr);
  align-items:end;
  gap:10px;
  padding:20px 10px 8px;
  background:linear-gradient(rgba(255,255,255,.07) 1px,transparent 1px) 0 0 / 100% 25%;
  border-top:1px solid rgba(255,255,255,.12);
}
.rf-bars i{border-radius:7px 7px 0 0;min-height:10px;box-shadow:0 0 16px rgba(65,191,255,.55)}
.rf-bars i.pos{background:linear-gradient(180deg,#61d9ff,#1387d0)}
.rf-bars i.neg{background:linear-gradient(180deg,#ffae43,#dc5b12)}
.rf-coverage h2{display:flex;justify-content:space-between}
.rf-coverage h2 strong{font-size:30px;color:#83ff6f;text-shadow:0 0 14px #83ff6f}
.rf-cover-row{
  display:grid;
  grid-template-columns:105px 50px 1fr;
  align-items:center;
  gap:12px;
  margin:12px 0;
  font-size:15px;
}
.rf-cover-row b{color:#9cff9c}
.rf-bar{height:19px;background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.12);overflow:hidden}
.rf-bar i{display:block;height:100%;background:#2ae7ff;box-shadow:0 0 16px currentColor}
.rf-bar i.green{background:#6cff7d}
.rf-bar i.yellow{background:#eaff4f}
.rf-bar i.orange{background:#ffae44}
.rf-bar i.red{background:#ff7048}
.rf-bar i.cyan{background:#31e8ff}
.rf-actions{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;align-items:center}
.act{
  height:74px;
  border-radius:14px;
  font-size:18px;
  letter-spacing:2px;
  font-weight:900;
  cursor:pointer;
}
.refresh,.copy{
  color:#dfffe7;
  background:linear-gradient(180deg,#0f7a43,#062c1a);
  border:2px solid #5dff9a;
  box-shadow:0 0 22px rgba(82,255,141,.35),inset 0 0 20px rgba(87,255,150,.14);
}
.close{
  color:#ffe7e7;
  background:linear-gradient(180deg,#8f2c2c,#2b0b0b);
  border:2px solid #ff6b5f;
  box-shadow:0 0 22px rgba(255,82,82,.30),inset 0 0 20px rgba(255,87,87,.12);
}
.raw-panel{height:100%;display:grid;grid-template-rows:auto minmax(0,1fr)}
pre{
  margin:0;
  padding:14px;
  border-radius:12px;
  background:#071019;
  border:1px solid rgba(101,223,255,.22);
  white-space:pre-wrap;
  overflow:auto;
  min-width:0;
  color:#d8ffe2;
  font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
}
footer{
  color:#8ecfd7;
  font-size:12px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  border-top:1px solid rgba(96,242,255,.18);
  padding-top:9px;
}
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
      ${tabSection('Visual', buildVisualDoctorTab(data))}
    </main>
  </div>

  <footer>
    <span>last sync ${esc(payload.syncedAt)}</span>
    <span>window: real detached browser popup · ReportForge</span>
  </footer>
</div>
<script>
(function(){
  const openerApi = () => window.opener && window.opener.RFDebugCenter;
  const setActive = (tab) => {
    document.querySelectorAll('.nav-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tab));
    document.querySelectorAll('.tab-sec').forEach((sec) => sec.classList.toggle('active', sec.dataset.tab === tab));
  };
  document.querySelectorAll('.nav-btn').forEach((btn) => btn.addEventListener('click', () => setActive(btn.dataset.tab)));
  document.querySelectorAll('[data-act]').forEach((btn) => btn.addEventListener('click', async () => {
    const api = openerApi();
    if (!api) return;
    if (btn.dataset.act === 'refresh') api.syncDetachedWindow?.();
    if (btn.dataset.act === 'copy') {
      try { await api.copyBundleJSON?.(); } catch (_) {}
      api.syncDetachedWindow?.();
    }
    if (btn.dataset.act === 'close') api.closeDetachedWindow?.();
  }));
})();
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
