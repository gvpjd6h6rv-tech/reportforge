'use strict';

function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
function make(doc, tag, attrs = {}, text = null) { const node = doc.createElement(tag); for (const [key, value] of Object.entries(attrs)) { if (value == null) continue; if (key === 'className') node.className = value; else if (key in node) node[key] = value; else node.setAttribute(key, String(value)); } if (text != null) node.textContent = text; return node; }
function kv(doc, key, value) { const row = make(doc, 'div', { className: 'rf-debug-center-kv' }); row.append(make(doc, 'span', { className: 'rf-debug-center-k' }, key), make(doc, 'span', { className: 'rf-debug-center-v' }, value ?? '—')); return row; }
function compact(value, limit = 96) { if (value == null) return '—'; const text = typeof value === 'string' ? value : JSON.stringify(value); return text.length > limit ? `${text.slice(0, limit - 1)}…` : text; }
function bind(button, label, handler) { if (!button) return; button.textContent = label; button.onclick = typeof handler === 'function' ? handler : null; }

export function renderSelectionPanel(shadow, selection = {}, actions = {}) {
  const panel = shadow.getElementById('rf-debug-center-selection-panel');
  if (!panel) return;
  const doc = shadow.ownerDocument;
  clear(panel);
  const box = make(doc, 'div', { className: 'rf-debug-center-selection' });
  box.innerHTML = `<div class="rf-debug-center-selection__head"><div><div class="rf-debug-center-selection__status" id="rf-debug-center-selection-status">unknown</div><div class="rf-debug-center-selection__meta" id="rf-debug-center-selection-meta"></div></div><div class="rf-debug-center-selection__actions"><button type="button" id="rf-debug-center-selection-refresh">Refresh</button><button type="button" id="rf-debug-center-selection-clear">Clear</button><button type="button" id="rf-debug-center-selection-copy">Copy JSON</button></div></div><div id="rf-debug-center-selection-body"></div>`;
  panel.append(make(doc, 'h3', {}, 'Selection / Drag / Resize'), box);
  const status = box.querySelector('#rf-debug-center-selection-status');
  const meta = box.querySelector('#rf-debug-center-selection-meta');
  const body = box.querySelector('#rf-debug-center-selection-body');
  const refresh = box.querySelector('#rf-debug-center-selection-refresh');
  const clearBtn = box.querySelector('#rf-debug-center-selection-clear');
  const copy = box.querySelector('#rf-debug-center-selection-copy');
  if (status) { status.textContent = `${selection.status || 'unknown'} · ${selection.mode || 'unknown'}`; status.dataset.state = selection.status || 'unknown'; }
  if (meta) meta.textContent = `${selection.selected?.ids?.length || 0} ids · box ${selection.visual?.selectionBoxVisible ? 'yes' : 'no'} · handles ${selection.visual?.handlesVisible ? 'yes' : 'no'} · guides ${selection.visual?.guidesVisible ? 'yes' : 'no'}`;
  if (body) {
    body.append(kv(doc, 'selected', `${selection.selected?.id || '—'} · ${selection.selected?.type || '—'}`), kv(doc, 'source', selection.selected?.source || '—'), kv(doc, 'mode', selection.mode || 'unknown'), kv(doc, 'box', String(!!selection.visual?.selectionBoxVisible)), kv(doc, 'handles', String(!!selection.visual?.handlesVisible)), kv(doc, 'guides', String(!!selection.visual?.guidesVisible)), kv(doc, 'section', selection.section?.id || '—'), kv(doc, 'out of section', String(selection.section?.outOfBounds ?? '—')), kv(doc, 'drag', compact(selection.drag?.lastEvent || selection.drag)), kv(doc, 'resize', compact(selection.resize?.lastEvent || selection.resize)));
    body.append(kv(doc, 'selected rect', compact(selection.visual?.selectedRect)), kv(doc, 'overlay rect', compact(selection.visual?.overlayRect)));
    if (selection.findings?.length) {
      body.append(make(doc, 'div', { className: 'rf-debug-center-selection-findings' }, selection.findings.slice(0, 6).map((item) => `${item.severity || 'info'} ${item.code || 'rule'} · ${item.evidence || item.message || 'evidence'}`).join('\n')));
      body.append(make(doc, 'pre', { className: 'rf-debug-center-pre' }, compact(selection.findings, 1000)));
    } else body.append(make(doc, 'div', { className: 'rf-debug-center-empty' }, 'no selection findings'));
  }
  bind(refresh, 'Refresh', actions.refreshSelection || actions.refresh);
  bind(clearBtn, 'Clear', actions.clearSelection);
  bind(copy, 'Copy JSON', async () => { const json = actions.copySelectionJSON ? actions.copySelectionJSON() : ''; if (json && navigator?.clipboard?.writeText) { try { await navigator.clipboard.writeText(json); } catch (_) {} } return json; });
}
