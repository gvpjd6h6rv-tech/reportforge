'use strict';

function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
function make(doc, tag, attrs = {}, text = null) { const node = doc.createElement(tag); for (const [key, value] of Object.entries(attrs)) { if (value == null) continue; if (key === 'className') node.className = value; else if (key in node) node[key] = value; else node.setAttribute(key, String(value)); } if (text != null) node.textContent = text; return node; }
function kv(doc, key, value) { const row = make(doc, 'div', { className: 'rf-debug-center-kv' }); row.append(make(doc, 'span', { className: 'rf-debug-center-k' }, key), make(doc, 'span', { className: 'rf-debug-center-v' }, value ?? '—')); return row; }
function compact(value, limit = 96) { if (value == null) return '—'; const text = typeof value === 'string' ? value : JSON.stringify(value); return text.length > limit ? `${text.slice(0, limit - 1)}…` : text; }
function bind(button, label, handler) { if (!button) return; button.textContent = label; button.onclick = typeof handler === 'function' ? handler : null; }

export function renderPerformancePanel(shadow, performance = {}, actions = {}) {
  const panel = shadow.getElementById('rf-debug-center-performance-panel');
  if (!panel) return;
  const doc = shadow.ownerDocument;
  clear(panel);
  const box = make(doc, 'div', { className: 'rf-debug-center-performance' });
  box.innerHTML = `<div class="rf-debug-center-performance__head"><div><div class="rf-debug-center-performance__status" id="rf-debug-center-performance-status">unknown</div><div class="rf-debug-center-performance__meta" id="rf-debug-center-performance-meta"></div></div><div class="rf-debug-center-performance__actions"><button type="button" id="rf-debug-center-performance-refresh">Refresh</button><button type="button" id="rf-debug-center-performance-clear">Clear</button><button type="button" id="rf-debug-center-performance-copy">Copy JSON</button></div></div><div id="rf-debug-center-performance-body"></div>`;
  panel.append(make(doc, 'h3', {}, 'Performance'), box);
  const status = box.querySelector('#rf-debug-center-performance-status');
  const meta = box.querySelector('#rf-debug-center-performance-meta');
  const body = box.querySelector('#rf-debug-center-performance-body');
  const refresh = box.querySelector('#rf-debug-center-performance-refresh');
  const clearBtn = box.querySelector('#rf-debug-center-performance-clear');
  const copy = box.querySelector('#rf-debug-center-performance-copy');
  if (status) { status.textContent = `${performance.status || 'unknown'} · risk ${performance.risk?.level || 'none'}`; status.dataset.state = performance.status || 'unknown'; }
  if (meta) meta.textContent = `rate ${performance.eventRate?.perSecond || 0}/s · slow events ${performance.slowEvents?.length || 0} · slow requests ${performance.slowRequests?.length || 0} · long tasks ${performance.longTasks?.length || 0} · frame gaps ${performance.frameGaps?.length || 0}`;
  if (body) {
    body.append(kv(doc, 'visibility', performance.runtime?.visibilityState || '—'), kv(doc, 'risk', `${performance.risk?.level || 'none'} · ${performance.risk?.reason || 'no data'}`), kv(doc, 'top slow', String(performance.topSlowOperations?.length || 0)), kv(doc, 'owner', performance.suggestedOwner || '—'), kv(doc, 'loopFreeze', performance.correlations?.loopFreeze?.risk || '—'), kv(doc, 'asyncRace', performance.correlations?.asyncRace?.risk || '—'), kv(doc, 'network', performance.correlations?.network?.risk || '—'));
    body.append(kv(doc, 'event rate', `${performance.eventRate?.total || 0} in ${performance.eventRate?.windowMs || 0}ms · ${performance.eventRate?.perSecond || 0}/s`));
    for (const item of (performance.topSlowOperations || []).slice(0, 6)) body.append(kv(doc, item.label || 'op', `${item.durationMs ?? '—'}ms · ${item.severity || 'info'}`), kv(doc, 'detail', compact(item.evidence || [])));
    if (!(performance.topSlowOperations || []).length) body.append(make(doc, 'div', { className: 'rf-debug-center-empty' }, 'no performance data yet'));
  }
  bind(refresh, 'Refresh', actions.refreshPerformance || actions.refresh);
  bind(clearBtn, 'Clear', actions.clearPerformance);
  bind(copy, 'Copy JSON', async () => { const json = actions.copyPerformanceJSON ? actions.copyPerformanceJSON() : ''; if (json && navigator?.clipboard?.writeText) { try { await navigator.clipboard.writeText(json); } catch (_) {} } return json; });
}
