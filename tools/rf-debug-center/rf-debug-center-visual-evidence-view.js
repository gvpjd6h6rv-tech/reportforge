'use strict';
function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
function make(doc, tag, attrs = {}, text = null) { const node = doc.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (v == null) continue; if (k === 'className') node.className = v; else if (k in node) node[k] = v; else node.setAttribute(k, String(v)); } if (text != null) node.textContent = text; return node; }
function bind(btn, label, fn) { if (btn) { btn.textContent = label; btn.onclick = typeof fn === 'function' ? fn : null; } }

export function renderVisualEvidencePanel(shadow, visualEvidence = {}, actions = {}) {
  const panel = shadow.getElementById('rf-debug-center-visual-evidence-panel');
  if (!panel) return;
  const doc = shadow.ownerDocument;
  clear(panel);
  const caps = visualEvidence.capabilities || {};
  const records = visualEvidence.records || [];
  const capLabel = `capture ${caps.canCapture ? 'ok' : 'unsupported'} · clipboard ${caps.canClipboardImg ? 'ok' : 'unavailable'}`;
  const statusText = `${visualEvidence.status || 'idle'} · ${visualEvidence.total ?? 0} records · ${capLabel}`;
  const box = make(doc, 'div', { className: 'rf-debug-center-visual-evidence' });
  box.innerHTML = `<div class="rf-debug-center-visual-evidence__head"><div class="rf-debug-center-visual-evidence__status" id="rf-debug-center-ve-status">${statusText}</div><div class="rf-debug-center-visual-evidence__actions"><button type="button" id="rf-debug-center-ve-capture-panel">Capture Debug Panel</button><button type="button" id="rf-debug-center-ve-capture-preview">Capture Preview</button><button type="button" id="rf-debug-center-ve-capture-selection">Capture Selection</button><button type="button" id="rf-debug-center-ve-capture-viewport">Capture Viewport</button><button type="button" id="rf-debug-center-ve-clear">Clear</button><button type="button" id="rf-debug-center-ve-copy">Copy JSON</button></div></div><div id="rf-debug-center-ve-records"></div>`;
  panel.append(make(doc, 'h3', {}, 'Visual Evidence'), box);
  const recordsEl = box.querySelector('#rf-debug-center-ve-records');
  if (recordsEl) {
    if (!records.length) { recordsEl.append(make(doc, 'div', { className: 'rf-debug-center-empty' }, 'no visual evidence')); }
    else {
      for (const r of records.slice(0, 8)) {
        const item = make(doc, 'div', { className: 'rf-debug-center-kv' });
        item.append(make(doc, 'span', { className: 'rf-debug-center-k' }, `${r.target} · ${r.status}`), make(doc, 'span', { className: 'rf-debug-center-v' }, `${r.width}×${r.height} · ${r.bytes}b · ${r.reason || 'ok'}`));
        if (r.redactions?.length) item.append(make(doc, 'span', { className: 'rf-debug-center-v' }, `redaction: ${r.redactions[0].reason || 'redacted'}`));
        recordsEl.append(item);
      }
    }
  }
  bind(box.querySelector('#rf-debug-center-ve-capture-panel'), 'Capture Debug Panel', () => actions.captureVisualEvidence?.('debug-panel'));
  bind(box.querySelector('#rf-debug-center-ve-capture-preview'), 'Capture Preview', () => actions.captureVisualEvidence?.('preview'));
  bind(box.querySelector('#rf-debug-center-ve-capture-selection'), 'Capture Selection', () => actions.captureVisualEvidence?.('selection'));
  bind(box.querySelector('#rf-debug-center-ve-capture-viewport'), 'Capture Viewport', () => actions.captureVisualEvidence?.('viewport'));
  bind(box.querySelector('#rf-debug-center-ve-clear'), 'Clear', actions.clearVisualEvidence);
  bind(box.querySelector('#rf-debug-center-ve-copy'), 'Copy JSON', async () => { const json = actions.copyVisualEvidenceJSON?.() ?? '{}'; if (navigator?.clipboard?.writeText) { try { await navigator.clipboard.writeText(json); } catch (_) {} } return json; });
}
