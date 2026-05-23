'use strict';

function make(doc, tag, attrs = {}, text = null) { const node = doc.createElement(tag); for (const [key, value] of Object.entries(attrs)) { if (value == null) continue; if (key === 'className') node.className = value; else if (key in node) node[key] = value; else node.setAttribute(key, String(value)); } if (text != null) node.textContent = text; return node; }
function compact(value, limit = 220) { const text = value == null ? '—' : typeof value === 'string' ? value : JSON.stringify(value); return text.length > limit ? `${text.slice(0, limit - 1)}…` : text; }
function list(doc, items, empty) { const node = make(doc, 'div', { className: 'rf-debug-center-causal-intelligence__list' }); if (!items?.length) { node.textContent = empty; return node; } node.append(...items.slice(0, 4).map((item) => make(doc, 'div', { className: 'rf-debug-center-causal-intelligence__item' }, `${item.bugFamily || item.id || 'unknown'} · ${item.severity || 'info'} · ${item.message || item.title || 'diagnosis'}`))); return node; }

export function renderCausalIntelligencePanel(shadow, causal = {}, actions = {}) {
  const doc = shadow.ownerDocument;
  const host = shadow.getElementById('rf-debug-center-causal-intelligence-panel');
  if (!host) return;
  host.textContent = '';
  const shell = make(doc, 'div', { className: 'rf-debug-center-causal-intelligence' });
  const status = make(doc, 'div', { className: 'rf-debug-center-causal-intelligence__status', id: 'rf-debug-center-causal-intelligence-status' }, `${causal.status || 'unknown'} · confidence ${causal.confidence?.overall || 'unknown'}`);
  const meta = make(doc, 'div', { className: 'rf-debug-center-causal-intelligence__meta', id: 'rf-debug-center-causal-intelligence-meta' }, `suspected ${causal.summary?.bugsSuspected || 0} · critical ${causal.summary?.critical || 0} · warnings ${causal.summary?.warnings || 0} · unknown ${causal.summary?.unknown || 0} · chains ${causal.summary?.evidenceChains || 0}`);
  const actionsRow = make(doc, 'div', { className: 'rf-debug-center-causal-intelligence__actions' });
  const body = make(doc, 'div', { id: 'rf-debug-center-causal-intelligence-body' });
  actionsRow.append(make(doc, 'button', { type: 'button', onclick: () => actions.refreshCausalIntelligence?.() }, 'Refresh'), make(doc, 'button', { type: 'button', onclick: () => actions.clearCausalIntelligence?.() }, 'Clear'), make(doc, 'button', { type: 'button', onclick: () => actions.copyCausalIntelligenceJSON?.() }, 'Copy JSON'));
  body.append(make(doc, 'div', {}, `top diagnosis: ${causal.diagnoses?.[0]?.title || '—'}`), make(doc, 'div', {}, `owner expected: ${causal.diagnoses?.[0]?.ownerExpected || '—'}`), make(doc, 'div', {}, `invariant: ${causal.diagnoses?.[0]?.invariant || causal.invariants?.[0]?.id || '—'}`), make(doc, 'div', {}, `next action: ${causal.recommendations?.[0]?.action || '—'}`), make(doc, 'div', {}, `do not patch yet: ${causal.diagnoses?.[0]?.doNotPatchYet ? 'yes' : 'no'}`), make(doc, 'div', {}, `chain summary: ${causal.evidenceChains?.[0]?.name || '—'}`));
  body.append(list(doc, causal.diagnoses || [], 'no diagnoses'), make(doc, 'pre', { className: 'rf-debug-center-pre' }, compact(causal.evidenceChains || [], 1200)), make(doc, 'pre', { className: 'rf-debug-center-pre' }, compact(causal.unknowns || [], 1000)));
  shell.append(status, meta, actionsRow, body);
  host.append(shell);
}
