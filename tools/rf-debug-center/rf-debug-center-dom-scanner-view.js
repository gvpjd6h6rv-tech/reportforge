'use strict';

function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
function make(doc, tag, attrs = {}, text = null) { const node = doc.createElement(tag); for (const [key, value] of Object.entries(attrs)) { if (value == null) continue; if (key === 'className') node.className = value; else if (key in node) node[key] = value; else node.setAttribute(key, String(value)); } if (text != null) node.textContent = text; return node; }
function kv(doc, key, value) { const row = make(doc, 'div', { className: 'rf-debug-center-kv' }); row.append(make(doc, 'span', { className: 'rf-debug-center-k' }, key), make(doc, 'span', { className: 'rf-debug-center-v' }, value ?? '—')); return row; }
function compact(value, limit = 92) { if (value == null) return '—'; const text = typeof value === 'string' ? value : JSON.stringify(value); return text.length > limit ? `${text.slice(0, limit - 1)}…` : text; }
function bind(button, label, handler) { if (button) { button.textContent = label; button.onclick = typeof handler === 'function' ? handler : null; } }

export function renderDomScannerPanel(shadow, domScanner = {}, actions = {}) {
  const panel = shadow.getElementById('rf-debug-center-dom-scanner-panel');
  if (!panel) return;
  const doc = shadow.ownerDocument;
  clear(panel);
  const shell = make(doc, 'div', { className: 'rf-debug-center-dom-scanner' });
  shell.innerHTML = `<div class="rf-debug-center-dom-scanner__head"><div><div class="rf-debug-center-dom-scanner__status" id="rf-debug-center-dom-scanner-status">unknown</div><div class="rf-debug-center-dom-scanner__meta" id="rf-debug-center-dom-scanner-meta"></div></div><div class="rf-debug-center-dom-scanner__actions"><button type="button" id="rf-debug-center-dom-scanner-refresh">Refresh</button><button type="button" id="rf-debug-center-dom-scanner-clear">Clear</button><button type="button" id="rf-debug-center-dom-scanner-copy">Copy JSON</button></div></div><div id="rf-debug-center-dom-scanner-body"></div>`;
  panel.append(make(doc, 'h3', {}, 'DOM Scanner'), shell);
  const status = shell.querySelector('#rf-debug-center-dom-scanner-status');
  const meta = shell.querySelector('#rf-debug-center-dom-scanner-meta');
  const body = shell.querySelector('#rf-debug-center-dom-scanner-body');
  const refresh = shell.querySelector('#rf-debug-center-dom-scanner-refresh');
  const clearBtn = shell.querySelector('#rf-debug-center-dom-scanner-clear');
  const copy = shell.querySelector('#rf-debug-center-dom-scanner-copy');
  const summary = domScanner.summary || {};
  if (status) { status.textContent = `${domScanner.status || 'unknown'} · ${summary.targetsScanned || 0} targets · ${summary.findings || 0} findings`; status.dataset.state = domScanner.status || 'unknown'; }
  if (meta) meta.textContent = `critical ${summary.critical || 0} · warning ${summary.warnings || 0} · info ${domScanner.findings?.filter?.((item) => item.severity === 'info')?.length || 0} · duplicate ids ${summary.duplicates || 0} · blocked ${summary.blocked || 0} · hidden ${summary.hidden || 0}`;
  if (body) {
    body.append(kv(doc, 'targets scanned', summary.targetsScanned ?? 0), kv(doc, 'findings', summary.findings ?? 0), kv(doc, 'critical', summary.critical ?? 0), kv(doc, 'warnings', summary.warnings ?? 0), kv(doc, 'duplicate ids', summary.duplicates ?? 0), kv(doc, 'blocked', summary.blocked ?? 0), kv(doc, 'hidden', summary.hidden ?? 0), kv(doc, 'owner', domScanner.suggestedOwner || '—'));
    if (!(domScanner.findings || []).length) {
      body.append(make(doc, 'div', { className: 'rf-debug-center-empty' }, 'no dom scanner findings'));
    } else {
      for (const item of (domScanner.findings || []).slice(0, 8)) {
        body.append(make(doc, 'div', { className: `rf-debug-center-row rf-debug-center-sev-${item.severity || 'info'}` }, null));
        const row = body.lastChild;
        row.append(
          make(doc, 'div', { className: 'rf-debug-center-row__title' }, `${item.ruleId || 'RULE'} · ${item.severity || 'info'} · ${item.target || item.selector || 'target'}`),
          make(doc, 'div', { className: 'rf-debug-center-row__meta' }, item.title || 'DOM finding'),
          make(doc, 'div', { className: 'rf-debug-center-row__meta' }, item.message || '—'),
          make(doc, 'div', { className: 'rf-debug-center-row__meta' }, `selector ${compact(item.selector)} · evidence ${compact(item.evidence || [])} · owner ${compact(item.suggestedOwner || '—')}`),
        );
      }
    }
    body.append(make(doc, 'pre', { className: 'rf-debug-center-pre' }, JSON.stringify({ summary, targets: (domScanner.targets || []).slice(0, 6), findings: (domScanner.findings || []).slice(0, 6) }, null, 2)));
  }
  bind(refresh, 'Refresh', actions.refreshDomScanner || actions.refresh);
  bind(clearBtn, 'Clear', actions.clearDomScanner);
  bind(copy, 'Copy JSON', actions.copyDomScannerJSON);
}
