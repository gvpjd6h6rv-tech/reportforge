'use strict';

function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
function make(tag, attrs = {}, text = null) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null) continue;
    if (key === 'className') node.className = value;
    else if (key in node) node[key] = value;
    else node.setAttribute(key, String(value));
  }
  if (text != null) node.textContent = text;
  return node;
}
function compact(value, limit = 72) {
  if (value == null) return '—';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}
function keyValueRow(key, value) {
  const row = make('div', { className: 'rf-debug-center-kv' });
  row.append(make('span', { className: 'rf-debug-center-k' }, key));
  row.append(make('span', { className: 'rf-debug-center-v' }, value));
  return row;
}
function bindButton(button, label, handler) { if (button) { button.textContent = label; button.onclick = typeof handler === 'function' ? handler : null; } }
export function renderWarningsPanel(shadow, warnings = {}, actions = {}) {
  const panel = shadow.getElementById('rf-debug-center-warnings-panel');
  if (!panel) return;
  clear(panel);
  const status = make('div', { className: 'rf-debug-center-warnings__status', id: 'rf-debug-center-warnings-status' }, `${warnings.status || 'unknown'} · ${warnings.total || 0} total`);
  const meta = make('div', { className: 'rf-debug-center-warnings__meta', id: 'rf-debug-center-warnings-meta' }, `info ${warnings.counts?.info || 0} · warning ${warnings.counts?.warning || 0} · error ${warnings.counts?.error || 0}`);
  const actionsRow = make('div', { className: 'rf-debug-center-warnings__actions' });
  const refresh = make('button', { type: 'button', id: 'rf-debug-center-warnings-refresh' });
  const clearBtn = make('button', { type: 'button', id: 'rf-debug-center-warnings-clear' });
  const copy = make('button', { type: 'button', id: 'rf-debug-center-warnings-copy' });
  actionsRow.append(refresh, clearBtn, copy);
  const body = make('div', { id: 'rf-debug-center-warnings-body' });
  clear(panel);
  panel.append(make('h3', {}, 'Live Warnings'), make('div', { className: 'rf-debug-center-warnings' }, null));
  panel.querySelector('.rf-debug-center-warnings').append(status, meta, actionsRow, body);
  bindButton(refresh, 'Refresh', actions.refreshWarnings || actions.refresh);
  bindButton(clearBtn, 'Clear', actions.clearWarnings);
  bindButton(copy, 'Copy JSON', actions.copyWarningsJSON);
  if (!(warnings.warnings || []).length) {
    body.append(make('div', { className: 'rf-debug-center-empty' }, 'no warnings'));
    return;
  }
  for (const item of warnings.warnings) {
    body.append(
      keyValueRow(`${item.severity || 'info'} ${item.ruleId || 'rule'}`, `${item.title || 'warning'} · ${item.message || ''}`),
      keyValueRow('owner', item.suggestedOwner || '—'),
      keyValueRow('evidence', compact(item.evidence || [])),
      make('pre', { className: 'rf-debug-center-pre' }, JSON.stringify(item, null, 2)),
    );
  }
}
