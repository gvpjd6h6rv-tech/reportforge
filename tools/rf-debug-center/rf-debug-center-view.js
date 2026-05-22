'use strict';

const STYLE_HREF = '/tools/rf-debug-center/rf-debug-center.css';
const MAX_TEXT = 72;

function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

function make(tag, attrs = {}, text = null) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null) continue;
    if (key === 'className') node.className = value;
    else if (key === 'dataset' && value && typeof value === 'object') Object.assign(node.dataset, value);
    else if (key in node) node[key] = value;
    else node.setAttribute(key, String(value));
  }
  if (text != null) node.textContent = text;
  return node;
}

function keyValueRow(key, value, className = '') {
  const row = make('div', { className: `rf-debug-center-kv ${className}`.trim() });
  row.append(make('span', { className: 'rf-debug-center-k' }, key));
  row.append(make('span', { className: 'rf-debug-center-v' }, value));
  return row;
}

function jsonBlock(value, fallback = '—') {
  const pre = make('pre', { className: 'rf-debug-center-pre' });
  pre.textContent = value == null ? fallback : JSON.stringify(value, null, 2);
  return pre;
}

function compact(value, limit = MAX_TEXT) {
  if (value == null) return '—';
  if (typeof value === 'string') return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
  try {
    const text = JSON.stringify(value);
    return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
  } catch (_) {
    const text = String(value);
    return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
  }
}

function timeLabel(timestamp) {
  if (!timestamp) return '—';
  const text = String(timestamp);
  const match = text.match(/T(\d{2}:\d{2}:\d{2})/);
  return match ? match[1] : text.slice(0, 19);
}

function bindButton(button, label, handler) {
  if (!button) return;
  button.textContent = label;
  button.onclick = typeof handler === 'function' ? handler : null;
}

export function mountDebugCenter(host) {
  if (host.shadowRoot) return host.shadowRoot;
  const shadow = host.attachShadow({ mode: 'open' });
  const link = make('link', { rel: 'stylesheet', href: STYLE_HREF });
  const shell = make('section', { className: 'rf-debug-center' });
  shell.innerHTML = `
    <header class="rf-debug-center__head" id="rf-debug-center-head">
      <div>
        <div class="rf-debug-center__title">RF Debug Center</div>
        <div class="rf-debug-center__sub" id="rf-debug-center-sub">waiting for RF_UI_TRACE</div>
      </div>
      <div class="rf-debug-center__badge" id="rf-debug-center-badge">inactive</div>
    </header>
    <div class="rf-debug-center__grid">
      <section class="rf-debug-center__panel">
        <h3>Live</h3>
        <div id="rf-debug-center-live"></div>
      </section>
      <section class="rf-debug-center__panel">
        <h3>Divergence</h3>
        <div id="rf-debug-center-divergence"></div>
      </section>
      <section class="rf-debug-center__panel">
        <h3>Zoom Diagnostics</h3>
        <div class="rf-debug-center-zoom">
          <div class="rf-debug-center-zoom__status" id="rf-debug-center-zoom-status">UNKNOWN</div>
          <div class="rf-debug-center-zoom__meta" id="rf-debug-center-zoom-meta"></div>
          <div id="rf-debug-center-zoom-body"></div>
        </div>
      </section>
      <section class="rf-debug-center__panel">
        <h3>Timeline</h3>
        <div class="rf-debug-center-timeline">
          <div class="rf-debug-center-timeline__head">
            <div class="rf-debug-center-timeline__status" id="rf-debug-center-timeline-status">RF_UI_TRACE ausente</div>
            <div class="rf-debug-center-timeline__actions">
              <button type="button" id="rf-debug-center-timeline-toggle">Pause</button>
              <button type="button" id="rf-debug-center-timeline-refresh">Refresh</button>
              <button type="button" id="rf-debug-center-timeline-clear">Clear</button>
              <button type="button" id="rf-debug-center-timeline-copy">Copy JSON</button>
            </div>
          </div>
          <div class="rf-debug-center-timeline__meta" id="rf-debug-center-timeline-meta"></div>
          <div class="rf-debug-center-timeline__counts" id="rf-debug-center-timeline-counts"></div>
          <div class="rf-debug-center-timeline__list" id="rf-debug-center-timeline-list"></div>
        </div>
      </section>
      <section class="rf-debug-center__panel">
        <h3>Ownership</h3>
        <div id="rf-debug-center-ownership"></div>
      </section>
    </div>
  `;
  shadow.append(link, shell);
  return shadow;
}

export function renderDebugCenter(shadow, state, actions = {}) {
  const sub = shadow.getElementById('rf-debug-center-sub');
  const badge = shadow.getElementById('rf-debug-center-badge');
  const live = shadow.getElementById('rf-debug-center-live');
  const divergenceEl = shadow.getElementById('rf-debug-center-divergence');
  const zoomStatus = shadow.getElementById('rf-debug-center-zoom-status');
  const zoomMeta = shadow.getElementById('rf-debug-center-zoom-meta');
  const zoomBody = shadow.getElementById('rf-debug-center-zoom-body');
  const timelineStatus = shadow.getElementById('rf-debug-center-timeline-status');
  const timelineMeta = shadow.getElementById('rf-debug-center-timeline-meta');
  const timelineCounts = shadow.getElementById('rf-debug-center-timeline-counts');
  const timelineList = shadow.getElementById('rf-debug-center-timeline-list');
  const timelineToggle = shadow.getElementById('rf-debug-center-timeline-toggle');
  const timelineRefresh = shadow.getElementById('rf-debug-center-timeline-refresh');
  const timelineClear = shadow.getElementById('rf-debug-center-timeline-clear');
  const timelineCopy = shadow.getElementById('rf-debug-center-timeline-copy');
  const ownership = shadow.getElementById('rf-debug-center-ownership');
  const timeline = state.timeline || { recent: [], counts: {}, total: 0, sourceState: 'absent', paused: false, lastSyncAt: null };

  if (sub) {
    const build = state.build || {};
    sub.textContent = `${state.activation} · commit ${build.commit || 'unknown'} · ${build.assetVersion || 'unknown'}`;
  }
  if (badge) {
    badge.textContent = state.enabled ? 'live' : 'inactive';
    badge.dataset.state = state.enabled ? 'live' : 'inactive';
  }

  if (live) {
    clear(live);
    live.append(
      keyValueRow('event', state.last?.event || state.last?.action || 'none'),
      keyValueRow('source', state.last?.source || 'unknown'),
      keyValueRow('phase', state.last?.phase || 'after'),
      keyValueRow('dsZoom', state.live?.dsZoom ?? '—'),
      keyValueRow('slider', state.live?.sliderValue ?? '—'),
      keyValueRow('pct', state.live?.pctText ?? '—'),
      keyValueRow('visible', state.live?.visibleElement ? `${state.live.visibleElement.tag || 'node'}#${state.live.visibleElement.id || 'anonymous'}` : '—'),
      keyValueRow('debug zoom', state.debugZoom?.tbValue || '—'),
    );
    live.append(jsonBlock(state.last || null, 'no UI trace yet'));
  }

  if (divergenceEl) {
    clear(divergenceEl);
    const divergence = state.divergence || {};
    divergenceEl.append(
      keyValueRow('status', divergence.summary || 'unknown', divergence.ok ? 'ok' : 'diverged'),
      keyValueRow('mismatches', divergence.mismatches?.length ? divergence.mismatches.join(', ') : 'none'),
    );
    divergenceEl.append(jsonBlock(divergence.live || null, 'no live snapshot'));
  }

  if (zoomStatus || zoomMeta || zoomBody) {
    const zoom = state.zoom || {};
    if (zoomStatus) {
      zoomStatus.textContent = `${zoom.status || 'unknown'} · ${zoom.mode || 'unknown'} · ${zoom.traceState || 'unknown'}`;
      zoomStatus.dataset.state = zoom.status || 'unknown';
    }
    if (zoomMeta) zoomMeta.textContent = `target ${zoom.dom?.targetSelector || '—'} · event ${zoom.lastZoomEvent?.source || '—'} / ${zoom.lastZoomEvent?.action || '—'}`;
    if (zoomBody) {
      clear(zoomBody);
      zoomBody.append(
        keyValueRow('ds.zoom', zoom.zoom?.dsZoom ?? '—'),
        keyValueRow('ds.zoomDesign', zoom.zoom?.dsZoomDesign ?? '—'),
        keyValueRow('ds.zoomPreview', zoom.zoom?.dsZoomPreview ?? '—'),
        keyValueRow('effectiveZoom', zoom.zoom?.effectiveZoom ?? '—'),
        keyValueRow('slider', `${zoom.controls?.sliderValue ?? '—'} [${zoom.controls?.sliderMin ?? '—'}..${zoom.controls?.sliderMax ?? '—'}] step ${zoom.controls?.sliderStep ?? '—'}`),
        keyValueRow('pct', zoom.controls?.pctText ?? '—'),
        keyValueRow('tb-zoom', zoom.controls?.tbZoomValue ?? '—'),
        keyValueRow('transform', zoom.dom?.transform ?? 'none'),
        keyValueRow('scale', zoom.dom?.scale ?? '—'),
        keyValueRow('visible', zoom.dom?.visible ? 'yes' : 'no'),
        keyValueRow('owner', zoom.lastZoomEvent?.writerActual || zoom.lastZoomEvent?.ownerExpected || '—'),
        keyValueRow('divergences', zoom.divergences?.length ? zoom.divergences.join(', ') : 'none'),
      );
      zoomBody.append(jsonBlock(zoom.lastZoomEvent || null, 'no zoom event'));
      zoomBody.append(jsonBlock(zoom.evidence || [], 'no evidence'));
    }
  }

  const sourceState = timeline.sourceState || 'absent';
  if (timelineStatus) timelineStatus.textContent = `${timeline.paused ? 'Paused' : 'Live'} · RF_UI_TRACE ${sourceState === 'invalid' ? 'invalid/no compatible' : sourceState} · ${timeline.total || 0} events`;
  if (timelineMeta) timelineMeta.textContent = `last sync ${timeLabel(timeline.lastSyncAt)} · cursor ${timeline.recent?.length || 0} visible · last ${state.last?.action || state.last?.event || '—'}`;
  if (timelineCounts) {
    const counts = timeline.counts || {};
    timelineCounts.textContent = `debug ${counts.debug || 0} · info ${counts.info || 0} · warning ${counts.warning || 0} · error ${counts.error || 0}`;
  }

  bindButton(timelineToggle, timeline.paused ? 'Resume' : 'Pause', timeline.paused ? actions.resumeTimeline : actions.pauseTimeline);
  bindButton(timelineRefresh, 'Refresh', actions.refreshTimeline || actions.refresh);
  bindButton(timelineClear, 'Clear', actions.clearTimeline);
  bindButton(timelineCopy, 'Copy JSON', async () => {
    const json = actions.copyTimelineJSON ? actions.copyTimelineJSON() : '';
    if (json && navigator?.clipboard?.writeText) {
      try { await navigator.clipboard.writeText(json); } catch (_) {}
    }
    return json;
  });

  if (timelineList) {
    clear(timelineList);
    if (!timeline.recent.length) {
      timelineList.append(make('div', { className: 'rf-debug-center-empty' }, 'no timeline events yet'));
    } else {
      for (const entry of timeline.recent) {
        const row = make('div', { className: `rf-debug-center-timeline-item rf-debug-center-sev-${entry.severity || 'info'}` });
        row.append(
          make('div', { className: 'rf-debug-center-timeline-item__title' }, `#${entry.index || '—'} ${timeLabel(entry.timestamp)} · ${entry.source || entry.module || 'unknown'}`),
          make('div', { className: 'rf-debug-center-timeline-item__meta' }, `${entry.action || 'ui'} · ${entry.severity || 'info'} · ${compact(entry.before)} → ${compact(entry.after)}`),
          make('div', { className: 'rf-debug-center-timeline-item__meta' }, `zoom ${compact(entry.after?.dsZoom ?? entry.dom?.dsZoom ?? '—')} · slider ${compact(entry.after?.sliderValue ?? entry.dom?.sliderValue ?? '—')} · ${compact(entry.after?.pctText ?? entry.dom?.pctText ?? '—')}`),
          make('div', { className: 'rf-debug-center-timeline-item__meta' }, `state ${compact(entry.state)} · dom ${compact(entry.dom)}`),
          make('div', { className: 'rf-debug-center-timeline-item__meta' }, `result ${compact(entry.result)} · error ${compact(entry.error)} · raw ${compact(entry.raw)}`),
        );
        timelineList.append(row);
      }
    }
  }

  if (ownership) {
    clear(ownership);
    const map = state.ownership || {};
    ownership.append(
      keyValueRow('uiTrace', map?.ssot?.uiTrace || 'engines/RFAudit.js'),
      keyValueRow('bootstrap', map?.ssot?.bootstrap || 'tools/rf-debug-center/rf-debug-center.js'),
      keyValueRow('store', map?.ssot?.store || 'tools/rf-debug-center/rf-debug-center-store.js'),
      keyValueRow('view', map?.ssot?.view || 'tools/rf-debug-center/rf-debug-center-view.js'),
      keyValueRow('style', map?.ssot?.style || 'tools/rf-debug-center/rf-debug-center.css'),
    );
  }
}
