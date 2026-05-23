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
function kv(doc, key, value) {
  const row = make(doc, 'div', { className: 'rf-debug-center-kv' });
  row.append(make(doc, 'span', { className: 'rf-debug-center-k' }, key), make(doc, 'span', { className: 'rf-debug-center-v' }, value));
  return row;
}
function list(doc, items, empty) { const box = make(doc, 'div'); if (!items.length) return box.append(make(doc, 'div', { className: 'rf-debug-center-empty' }, empty)), box; for (const item of items) box.append(make(doc, 'div', { className: `rf-debug-center-loop-freeze-item rf-debug-center-sev-${item.severity || 'info'}` }, `${item.code || 'rule'} · ${item.message || item.title || 'warning'} · ${item.evidence?.join(', ') || 'no evidence'}`)); return box; }
function bind(button, label, handler) { if (button) { button.textContent = label; button.onclick = typeof handler === 'function' ? handler : null; } }

export function renderLoopFreezePanel(shadow, loopFreeze = {}, actions = {}) {
  const panel = shadow.getElementById('rf-debug-center-loop-freeze-panel');
  if (!panel) return;
  const doc = shadow.ownerDocument;
  clear(panel);
  panel.append(make(doc, 'h3', {}, 'Loop & Freeze'));
  const body = make(doc, 'div', { className: 'rf-debug-center-loop-freeze' });
  const status = make(doc, 'div', { className: 'rf-debug-center-loop-freeze__status', id: 'rf-debug-center-loop-freeze-status' }, `${loopFreeze.status || 'unknown'} · risk ${loopFreeze.risk?.level || 'none'}`);
  status.dataset.state = loopFreeze.status || 'unknown';
  const actionsRow = make(doc, 'div', { className: 'rf-debug-center-loop-freeze__actions' });
  const refresh = make(doc, 'button', { type: 'button', id: 'rf-debug-center-loop-freeze-refresh' });
  const clearBtn = make(doc, 'button', { type: 'button', id: 'rf-debug-center-loop-freeze-clear' });
  const copy = make(doc, 'button', { type: 'button', id: 'rf-debug-center-loop-freeze-copy' });
  actionsRow.append(refresh, clearBtn, copy);
  body.append(status, kv(doc, 'heartbeat', loopFreeze.heartbeat?.gapMs == null ? '—' : `${loopFreeze.heartbeat.gapMs}ms / ${loopFreeze.heartbeat.thresholdMs}ms`), kv(doc, 'event storms', String(loopFreeze.eventStorms?.length || 0)), kv(doc, 'repeated handlers', String(loopFreeze.repeatedHandlers?.length || 0)), kv(doc, 'possible loops', String(loopFreeze.possibleLoops?.length || 0)), kv(doc, 'risk', `${loopFreeze.risk?.level || 'none'} · ${loopFreeze.risk?.reason || 'no risk'}`), kv(doc, 'last activity', loopFreeze.lastEvents?.at(-1)?.summary || '—'));
  body.append(actionsRow, list(doc, loopFreeze.eventStorms || [], 'no event storms'), list(doc, loopFreeze.repeatedHandlers || [], 'no repeated handlers'), list(doc, loopFreeze.possibleLoops || [], 'no loop patterns'));
  panel.append(body);
  bind(refresh, 'Refresh', actions.refreshLoopFreeze || actions.refresh);
  bind(clearBtn, 'Clear', actions.clearLoopFreeze);
  bind(copy, 'Copy JSON', async () => { const json = actions.copyLoopFreezeJSON ? actions.copyLoopFreezeJSON() : ''; if (json && navigator?.clipboard?.writeText) { try { await navigator.clipboard.writeText(json); } catch (_) {} } return json; });
}
