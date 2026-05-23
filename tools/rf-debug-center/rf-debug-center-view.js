import { renderDebugCenterSections } from './rf-debug-center-view-sections.js';
import { renderAsyncRacePanel } from './rf-debug-center-async-race-view.js';
import { renderPerformancePanel } from './rf-debug-center-performance-view.js';
import { renderNetworkPanel } from './rf-debug-center-network-view.js';
import { renderLoopFreezePanel } from './rf-debug-center-loop-freeze-view.js';
import { renderSelectionPanel } from './rf-debug-center-selection-view.js';
import { renderRenderPreviewPanel } from './rf-debug-center-render-preview-view.js';
import { renderWarningsPanel } from './rf-debug-center-warnings-view.js';
import { renderVisualEvidencePanel } from './rf-debug-center-visual-evidence-view.js';

const STYLE_HREF = '/tools/rf-debug-center/rf-debug-center.css';

function make(doc, tag, attrs = {}, text = null) {
  const node = doc.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null) continue;
    if (key === 'className') node.className = value;
    else if (key in node) node[key] = value;
    else node.setAttribute(key, String(value));
  }
  if (text != null) node.textContent = text;
  return node;
}

export function mountDebugCenter(host) {
  if (host.shadowRoot) return host.shadowRoot;
  const doc = host.ownerDocument;
  const shadow = host.attachShadow({ mode: 'open' });
  const link = make(doc, 'link', { rel: 'stylesheet', href: STYLE_HREF });
  const shell = make(doc, 'section', { className: 'rf-debug-center' });
  shell.innerHTML = `
    <header class="rf-debug-center__head" id="rf-debug-center-head">
      <div><div class="rf-debug-center__title">RF Debug Center</div><div class="rf-debug-center__sub" id="rf-debug-center-sub">waiting for RF_UI_TRACE</div></div>
      <div class="rf-debug-center__badge" id="rf-debug-center-badge">inactive</div>
    </header>
    <div class="rf-debug-center__grid">
      <section class="rf-debug-center__panel"><h3>Live</h3><div id="rf-debug-center-live"></div></section>
      <section class="rf-debug-center__panel"><h3>Divergence</h3><div id="rf-debug-center-divergence"></div></section>
      <section class="rf-debug-center__panel"><h3>Zoom Diagnostics</h3><div class="rf-debug-center-zoom"><div class="rf-debug-center-zoom__status" id="rf-debug-center-zoom-status">UNKNOWN</div><div class="rf-debug-center-zoom__meta" id="rf-debug-center-zoom-meta"></div><div id="rf-debug-center-zoom-body"></div></div></section>
      <section class="rf-debug-center__panel" id="rf-debug-center-render-preview-panel"></section>
      <section class="rf-debug-center__panel"><h3>Timeline</h3><div class="rf-debug-center-timeline"><div class="rf-debug-center-timeline__head"><div class="rf-debug-center-timeline__status" id="rf-debug-center-timeline-status">RF_UI_TRACE ausente</div><div class="rf-debug-center-timeline__actions"><button type="button" id="rf-debug-center-timeline-toggle">Pause</button><button type="button" id="rf-debug-center-timeline-refresh">Refresh</button><button type="button" id="rf-debug-center-timeline-clear">Clear</button><button type="button" id="rf-debug-center-timeline-copy">Copy JSON</button></div></div><div class="rf-debug-center-timeline__meta" id="rf-debug-center-timeline-meta"></div><div class="rf-debug-center-timeline__counts" id="rf-debug-center-timeline-counts"></div><div class="rf-debug-center-timeline__list" id="rf-debug-center-timeline-list"></div></div></section>
      <section class="rf-debug-center__panel" id="rf-debug-center-selection-panel"></section>
      <section class="rf-debug-center__panel" id="rf-debug-center-async-race-panel"></section>
      <section class="rf-debug-center__panel" id="rf-debug-center-loop-freeze-panel"></section>
      <section class="rf-debug-center__panel"><h3>Ownership</h3><div id="rf-debug-center-ownership"></div></section>
      <section class="rf-debug-center__panel"><h3>Bundle</h3><div class="rf-debug-center-bundle"><div class="rf-debug-center-bundle__status" id="rf-debug-center-bundle-status">idle</div><div class="rf-debug-center-bundle__meta" id="rf-debug-center-bundle-meta"></div><div class="rf-debug-center-bundle__actions"><button type="button" id="rf-debug-center-bundle-export">Export Bundle</button><button type="button" id="rf-debug-center-bundle-copy">Copy Bundle JSON</button></div><div id="rf-debug-center-bundle-body"></div></div></section>
      <section class="rf-debug-center__panel" id="rf-debug-center-performance-panel"></section>
      <section class="rf-debug-center__panel" id="rf-debug-center-network-panel"></section>
      <section class="rf-debug-center__panel" id="rf-debug-center-warnings-panel"></section>
      <section class="rf-debug-center__panel" id="rf-debug-center-visual-evidence-panel"></section>
    </div>
  `;
  shadow.append(link, shell);
  return shadow;
}

export function renderDebugCenter(shadow, state, actions = {}) {
  renderDebugCenterSections(shadow, state, actions);
  renderSelectionPanel(shadow, state.selection || {}, actions);
  renderRenderPreviewPanel(shadow, state.renderPreview || {}, actions);
  renderAsyncRacePanel(shadow, state.asyncRace || {}, actions);
  renderPerformancePanel(shadow, state.performance || {}, actions);
  renderNetworkPanel(shadow, state.network || {}, actions);
  renderLoopFreezePanel(shadow, state.loopFreeze || {}, actions);
  renderWarningsPanel(shadow, state.warnings || {}, actions);
  renderVisualEvidencePanel(shadow, state.visualEvidence || {}, actions);
}
