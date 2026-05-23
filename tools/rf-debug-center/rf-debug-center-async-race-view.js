'use strict';

function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
function make(doc, tag, attrs = {}, text = null) { const node = doc.createElement(tag); for (const [key, value] of Object.entries(attrs)) { if (value == null) continue; if (key === 'className') node.className = value; else if (key in node) node[key] = value; else node.setAttribute(key, String(value)); } if (text != null) node.textContent = text; return node; }
function kv(doc, key, value) { const el = make(doc, 'div', { className: 'rf-debug-center-kv' }); el.append(make(doc, 'span', { className: 'rf-debug-center-k' }, key), make(doc, 'span', { className: 'rf-debug-center-v' }, value ?? '—')); return el; }
function compact(value, limit = 88) { if (value == null) return '—'; const text = typeof value === 'string' ? value : JSON.stringify(value); return text.length > limit ? `${text.slice(0, limit - 1)}…` : text; }
function bind(button, label, handler) { if (!button) return; button.textContent = label; button.onclick = typeof handler === 'function' ? handler : null; }

export function renderAsyncRacePanel(shadow, state = {}, actions = {}) {
  const doc = shadow.ownerDocument;
  const panel = shadow.getElementById('rf-debug-center-async-race-panel');
  if (!panel) return;
  const data = state.asyncRace || { status: 'unknown', risk: { level: 'none', reason: 'no data' }, activeTransactions: [], completedTransactions: [], raceFindings: [], staleWrites: [], missingEnds: [], lastAsyncEvents: [] };
  clear(panel);
  const wrap = make(doc, 'div', { className: 'rf-debug-center-async-race' });
  wrap.innerHTML = `<div class="rf-debug-center-async-race__head"><div><div class="rf-debug-center-async-race__status" id="rf-debug-center-async-race-status">unknown</div><div class="rf-debug-center-async-race__meta" id="rf-debug-center-async-race-meta"></div></div><div class="rf-debug-center-async-race__actions"><button type="button" id="rf-debug-center-async-race-refresh">Refresh</button><button type="button" id="rf-debug-center-async-race-clear">Clear</button><button type="button" id="rf-debug-center-async-race-copy">Copy JSON</button></div></div><div id="rf-debug-center-async-race-body"></div>`;
  panel.append(wrap);
  const status = panel.querySelector('#rf-debug-center-async-race-status');
  const meta = panel.querySelector('#rf-debug-center-async-race-meta');
  const body = panel.querySelector('#rf-debug-center-async-race-body');
  const refresh = panel.querySelector('#rf-debug-center-async-race-refresh');
  const clearBtn = panel.querySelector('#rf-debug-center-async-race-clear');
  const copy = panel.querySelector('#rf-debug-center-async-race-copy');
  if (status) { status.textContent = `${data.status || 'unknown'} · ${data.risk?.level || 'none'}`; status.dataset.state = data.status || 'unknown'; }
  if (meta) meta.textContent = `active ${data.activeTransactions?.length || 0} · completed ${data.completedTransactions?.length || 0} · findings ${data.raceFindings?.length || 0}`;
  if (body) {
    body.append(
      kv(doc, 'status', data.status || 'unknown'),
      kv(doc, 'risk', `${data.risk?.level || 'none'} · ${data.risk?.reason || 'no data'}`),
      kv(doc, 'active', data.activeTransactions?.length || 0),
      kv(doc, 'completed', data.completedTransactions?.length || 0),
      kv(doc, 'findings', data.raceFindings?.length || 0),
      kv(doc, 'stale writes', data.staleWrites?.length || 0),
      kv(doc, 'missing ends', data.missingEnds?.length || 0),
      kv(doc, 'last async', data.lastAsyncEvents?.length || 0),
    );
    if (data.raceFindings?.length) body.append(make(doc, 'pre', { className: 'rf-debug-center-pre' }, compact(data.raceFindings, 800)));
    if (data.activeTransactions?.length) body.append(make(doc, 'pre', { className: 'rf-debug-center-pre' }, compact(data.activeTransactions.slice(0, 4), 800)));
    if (data.lastAsyncEvents?.length) body.append(make(doc, 'pre', { className: 'rf-debug-center-pre' }, compact(data.lastAsyncEvents.slice(-4), 800)));
  }
  bind(refresh, 'Refresh', actions.refreshAsyncRace);
  bind(clearBtn, 'Clear', actions.clearAsyncRace);
  bind(copy, 'Copy JSON', async () => { const json = actions.copyAsyncRaceJSON ? actions.copyAsyncRaceJSON() : ''; if (json && navigator?.clipboard?.writeText) { try { await navigator.clipboard.writeText(json); } catch (_) {} } return json; });
}
