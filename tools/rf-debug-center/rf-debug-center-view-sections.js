'use strict';

function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
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
function keyValueRow(doc, key, value, className = '') {
  const row = make(doc, 'div', { className: `rf-debug-center-kv ${className}`.trim() });
  row.append(make(doc, 'span', { className: 'rf-debug-center-k' }, key));
  row.append(make(doc, 'span', { className: 'rf-debug-center-v' }, value));
  return row;
}
function jsonBlock(doc, value, fallback = '—') {
  const pre = make(doc, 'pre', { className: 'rf-debug-center-pre' });
  pre.textContent = value == null ? fallback : JSON.stringify(value, null, 2);
  return pre;
}
function compact(value, limit = 72) {
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
function bindButton(button, label, handler) { if (button) { button.textContent = label; button.onclick = typeof handler === 'function' ? handler : null; } }

function renderList(doc, target, items, emptyLabel, itemClass, renderItem) {
  clear(target);
  if (!items.length) {
    target.append(make(doc, 'div', { className: 'rf-debug-center-empty' }, emptyLabel));
    return;
  }
  for (const item of items) target.append(renderItem(item, itemClass));
}

export function renderDebugCenterSections(shadow, state, actions = {}) {
  const doc = shadow.ownerDocument;
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
  const bundleStatus = shadow.getElementById('rf-debug-center-bundle-status');
  const bundleMeta = shadow.getElementById('rf-debug-center-bundle-meta');
  const bundleBody = shadow.getElementById('rf-debug-center-bundle-body');
  const bundleExport = shadow.getElementById('rf-debug-center-bundle-export');
  const bundleCopy = shadow.getElementById('rf-debug-center-bundle-copy');
  const timeline = state.timeline || { recent: [], counts: {}, total: 0, sourceState: 'absent', paused: false, lastSyncAt: null };
  const sub = shadow.getElementById('rf-debug-center-sub');
  const badge = shadow.getElementById('rf-debug-center-badge');
  if (sub) sub.textContent = state.enabled ? `${state.activation || 'enabled'} · ${timeline.sourceState || 'absent'}` : 'waiting for RF_UI_TRACE';
  if (badge) {
    const liveState = state.enabled ? 'live' : 'inactive';
    badge.textContent = liveState;
    badge.dataset.state = liveState;
  }
  const bundle = state.bundle || { status: 'idle', message: 'idle', filename: null, updatedAt: null };
  if (live) {
    clear(live);
    live.append(
      keyValueRow(doc, 'event', state.last?.event || state.last?.action || 'none'),
      keyValueRow(doc, 'source', state.last?.source || 'unknown'),
      keyValueRow(doc, 'phase', state.last?.phase || 'after'),
      keyValueRow(doc, 'dsZoom', state.live?.dsZoom ?? '—'),
      keyValueRow(doc, 'slider', state.live?.sliderValue ?? '—'),
      keyValueRow(doc, 'pct', state.live?.pctText ?? '—'),
      keyValueRow(doc, 'visible', state.live?.visibleElement ? `${state.live.visibleElement.tag || 'node'}#${state.live.visibleElement.id || 'anonymous'}` : '—'),
      keyValueRow(doc, 'debug zoom', state.debugZoom?.tbValue || '—'),
    );
    live.append(jsonBlock(doc, state.last || null, 'no UI trace yet'));
  }
  if (divergenceEl) {
    clear(divergenceEl);
    const divergence = state.divergence || {};
    divergenceEl.append(
      keyValueRow(doc, 'status', divergence.summary || 'unknown', divergence.ok ? 'ok' : 'diverged'),
      keyValueRow(doc, 'mismatches', divergence.mismatches?.length ? divergence.mismatches.join(', ') : 'none'),
    );
    divergenceEl.append(jsonBlock(doc, divergence.live || null, 'no live snapshot'));
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
        keyValueRow(doc, 'ds.zoom', zoom.zoom?.dsZoom ?? '—'),
        keyValueRow(doc, 'ds.zoomDesign', zoom.zoom?.dsZoomDesign ?? '—'),
        keyValueRow(doc, 'ds.zoomPreview', zoom.zoom?.dsZoomPreview ?? '—'),
        keyValueRow(doc, 'effectiveZoom', zoom.zoom?.effectiveZoom ?? '—'),
        keyValueRow(doc, 'slider', `${zoom.controls?.sliderValue ?? '—'} [${zoom.controls?.sliderMin ?? '—'}..${zoom.controls?.sliderMax ?? '—'}] step ${zoom.controls?.sliderStep ?? '—'}`),
        keyValueRow(doc, 'pct', zoom.controls?.pctText ?? '—'),
        keyValueRow(doc, 'tb-zoom', zoom.controls?.tbZoomValue ?? '—'),
        keyValueRow(doc, 'transform', zoom.dom?.transform ?? 'none'),
        keyValueRow(doc, 'scale', zoom.dom?.scale ?? '—'),
        keyValueRow(doc, 'visible', zoom.dom?.visible ? 'yes' : 'no'),
        keyValueRow(doc, 'owner', zoom.lastZoomEvent?.writerActual || zoom.lastZoomEvent?.ownerExpected || '—'),
        keyValueRow(doc, 'divergences', zoom.divergences?.length ? zoom.divergences.join(', ') : 'none'),
      );
      zoomBody.append(jsonBlock(doc, zoom.lastZoomEvent || null, 'no zoom event'));
      zoomBody.append(jsonBlock(doc, zoom.evidence || [], 'no evidence'));
    }
  }
  if (timelineStatus) timelineStatus.textContent = `${timeline.paused ? 'Paused' : 'Live'} · RF_UI_TRACE ${timeline.sourceState === 'invalid' ? 'invalid/no compatible' : timeline.sourceState} · ${timeline.total || 0} events`;
  if (timelineMeta) timelineMeta.textContent = `last sync ${timeLabel(timeline.lastSyncAt)} · cursor ${timeline.recent?.length || 0} visible · last ${state.last?.action || state.last?.event || '—'}`;
  if (timelineCounts) {
    const counts = timeline.counts || {};
    timelineCounts.textContent = `debug ${counts.debug || 0} · info ${counts.info || 0} · warning ${counts.warning || 0} · error ${counts.error || 0}`;
  }
  bindButton(timelineToggle, timeline.paused ? 'Resume' : 'Pause', timeline.paused ? actions.resumeTimeline : actions.pauseTimeline);
  bindButton(timelineRefresh, 'Refresh', actions.refreshTimeline || actions.refresh);
  bindButton(timelineClear, 'Clear', actions.clearTimeline);
  bindButton(timelineCopy, 'Copy JSON', async () => { const json = actions.copyTimelineJSON ? actions.copyTimelineJSON() : ''; if (json && navigator?.clipboard?.writeText) { try { await navigator.clipboard.writeText(json); } catch (_) {} } return json; });
  if (timelineList) {
    clear(timelineList);
    renderList(doc, timelineList, timeline.recent || [], 'no timeline events yet', 'rf-debug-center-timeline-item', (entry) => {
      const row = make(doc, 'div', { className: `rf-debug-center-timeline-item rf-debug-center-sev-${entry.severity || 'info'}` });
      row.append(
        make(doc, 'div', { className: 'rf-debug-center-timeline-item__title' }, `#${entry.index || '—'} ${timeLabel(entry.timestamp)} · ${entry.source || entry.module || 'unknown'}`),
        make(doc, 'div', { className: 'rf-debug-center-timeline-item__meta' }, `${entry.action || 'ui'} · ${entry.severity || 'info'} · ${compact(entry.before)} → ${compact(entry.after)}`),
        make(doc, 'div', { className: 'rf-debug-center-timeline-item__meta' }, `zoom ${compact(entry.after?.dsZoom ?? entry.dom?.dsZoom ?? '—')} · slider ${compact(entry.after?.sliderValue ?? entry.dom?.sliderValue ?? '—')} · ${compact(entry.after?.pctText ?? entry.dom?.pctText ?? '—')}`),
        make(doc, 'div', { className: 'rf-debug-center-timeline-item__meta' }, `state ${compact(entry.state)} · dom ${compact(entry.dom)}`),
        make(doc, 'div', { className: 'rf-debug-center-timeline-item__meta' }, `result ${compact(entry.result)} · error ${compact(entry.error)} · raw ${compact(entry.raw)}`),
      );
      return row;
    });
  }
  if (ownership) {
    clear(ownership);
    const map = state.ownership || {};
    ownership.append(
      keyValueRow(doc, 'uiTrace', map?.ssot?.uiTrace || 'engines/RFAudit.js'),
      keyValueRow(doc, 'bootstrap', map?.ssot?.bootstrap || 'tools/rf-debug-center/rf-debug-center.js'),
      keyValueRow(doc, 'store', map?.ssot?.store || 'tools/rf-debug-center/rf-debug-center-store.js'),
      keyValueRow(doc, 'view', map?.ssot?.view || 'tools/rf-debug-center/rf-debug-center-view.js'),
      keyValueRow(doc, 'style', map?.ssot?.style || 'tools/rf-debug-center/rf-debug-center.css'),
    );
  }
  if (bundleStatus) bundleStatus.textContent = `${bundle.status || 'idle'} · ${bundle.filename || 'no file'}`; if (bundleMeta) bundleMeta.textContent = `${bundle.message || 'idle'} · ${bundle.updatedAt ? timeLabel(bundle.updatedAt) : '—'}`;
  if (bundleBody) {
    clear(bundleBody);
    bundleBody.append(
      keyValueRow(doc, 'schema', state.bundlePreview?.schema || 'rf-debug-bundle/v1'),
      keyValueRow(doc, 'generatedAt', timeLabel(state.bundlePreview?.generatedAt)),
      keyValueRow(doc, 'trace events', state.bundlePreview?.evidence?.trace?.length ?? 0),
      keyValueRow(doc, 'zoom', state.bundlePreview?.zoom?.status || '—'),
      keyValueRow(doc, 'dom', state.bundlePreview?.dom?.status || '—'),
    );
  }
  bindButton(bundleExport, 'Export Bundle', actions.exportBundle);
  bindButton(bundleCopy, 'Copy Bundle JSON', actions.copyBundleJSON);
}
