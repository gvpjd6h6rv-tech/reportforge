'use strict';

function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
function make(doc, tag, attrs = {}, text = null) { const node = doc.createElement(tag); for (const [key, value] of Object.entries(attrs)) { if (value == null) continue; if (key === 'className') node.className = value; else if (key in node) node[key] = value; else node.setAttribute(key, String(value)); } if (text != null) node.textContent = text; return node; }
function kv(doc, key, value) { const row = make(doc, 'div', { className: 'rf-debug-center-kv' }); row.append(make(doc, 'span', { className: 'rf-debug-center-k' }, key), make(doc, 'span', { className: 'rf-debug-center-v' }, value ?? '—')); return row; }
function compact(value, limit = 96) { if (value == null) return '—'; const text = typeof value === 'string' ? value : JSON.stringify(value); return text.length > limit ? `${text.slice(0, limit - 1)}…` : text; }
function bind(button, label, handler) { if (!button) return; button.textContent = label; button.onclick = typeof handler === 'function' ? handler : null; }

export function renderNetworkPanel(shadow, network = {}, actions = {}) {
  const panel = shadow.getElementById('rf-debug-center-network-panel');
  if (!panel) return;
  const doc = shadow.ownerDocument;
  clear(panel);
  const box = make(doc, 'div', { className: 'rf-debug-center-network' });
  box.innerHTML = `<div class="rf-debug-center-network__head"><div><div class="rf-debug-center-network__status" id="rf-debug-center-network-status">unknown</div><div class="rf-debug-center-network__meta" id="rf-debug-center-network-meta"></div></div><div class="rf-debug-center-network__actions"><button type="button" id="rf-debug-center-network-refresh">Refresh</button><button type="button" id="rf-debug-center-network-clear">Clear</button><button type="button" id="rf-debug-center-network-copy">Copy JSON</button></div></div><div id="rf-debug-center-network-body"></div>`;
  panel.append(make(doc, 'h3', {}, 'Network / Backend'), box);
  const status = box.querySelector('#rf-debug-center-network-status');
  const meta = box.querySelector('#rf-debug-center-network-meta');
  const body = box.querySelector('#rf-debug-center-network-body');
  const refresh = box.querySelector('#rf-debug-center-network-refresh');
  const clearBtn = box.querySelector('#rf-debug-center-network-clear');
  const copy = box.querySelector('#rf-debug-center-network-copy');
  if (status) { status.textContent = `${network.status || 'unknown'} · ${network.observerStatus || 'disabled'} · risk ${network.risk?.level || 'none'}`; status.dataset.state = network.status || 'unknown'; }
  if (meta) meta.textContent = `total ${network.counters?.total || 0} · active ${network.counters?.active || 0} · failed ${network.counters?.failed || 0} · slow ${network.counters?.slow || 0}`;
  if (body) {
    body.append(kv(doc, 'redactions', String(network.redactions || 0)), kv(doc, 'risk', `${network.risk?.level || 'none'} · ${network.risk?.reason || 'no data'}`), kv(doc, 'last requests', String(network.lastRequests?.length || 0)), kv(doc, 'failed', String(network.failedRequests?.length || 0)), kv(doc, 'slow', String(network.slowRequests?.length || 0)), kv(doc, 'owner', network.suggestedOwner || '—'));
    for (const item of (network.lastRequests || []).slice(-6).reverse()) {
      body.append(
        kv(doc, `${item.method || 'GET'} ${item.path || item.url || 'request'}`, `${item.status ?? '—'} · ${item.durationMs ?? item.ageMs ?? 0}ms`),
        kv(doc, 'summary', compact(item.requestSummary)),
        kv(doc, 'response', compact(item.responseSummary)),
        kv(doc, 'redacted', compact(item.sensitiveFieldsRedacted || [])),
      );
    }
    if (!(network.lastRequests || []).length) body.append(make(doc, 'div', { className: 'rf-debug-center-empty' }, 'no network requests yet'));
  }
  bind(refresh, 'Refresh', actions.refreshNetwork || actions.refresh);
  bind(clearBtn, 'Clear', actions.clearNetwork);
  bind(copy, 'Copy JSON', async () => { const json = actions.copyNetworkJSON ? actions.copyNetworkJSON() : ''; if (json && navigator?.clipboard?.writeText) { try { await navigator.clipboard.writeText(json); } catch (_) {} } return json; });
}
