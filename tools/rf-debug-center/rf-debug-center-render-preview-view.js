'use strict';

function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
function make(doc, tag, attrs = {}, text = null) { const node = doc.createElement(tag); for (const [key, value] of Object.entries(attrs)) { if (value == null) continue; if (key === 'className') node.className = value; else if (key in node) node[key] = value; else node.setAttribute(key, String(value)); } if (text != null) node.textContent = text; return node; }
function kv(doc, key, value) { const row = make(doc, 'div', { className: 'rf-debug-center-kv' }); row.append(make(doc, 'span', { className: 'rf-debug-center-k' }, key), make(doc, 'span', { className: 'rf-debug-center-v' }, value ?? '—')); return row; }
function compact(value, limit = 96) { if (value == null) return '—'; const text = typeof value === 'string' ? value : JSON.stringify(value); return text.length > limit ? `${text.slice(0, limit - 1)}…` : text; }
function bind(button, label, handler) { if (button) { button.textContent = label; button.onclick = typeof handler === 'function' ? handler : null; } }

export function renderRenderPreviewPanel(shadow, renderPreview = {}, actions = {}) {
  const panel = shadow.getElementById('rf-debug-center-render-preview-panel');
  if (!panel) return;
  const doc = shadow.ownerDocument;
  clear(panel);
  const box = make(doc, 'div', { className: 'rf-debug-center-render-preview' });
  box.innerHTML = `<div class="rf-debug-center-render-preview__head"><div><div class="rf-debug-center-render-preview__status" id="rf-debug-center-render-preview-status">unknown</div><div class="rf-debug-center-render-preview__meta" id="rf-debug-center-render-preview-meta"></div></div><div class="rf-debug-center-render-preview__actions"><button type="button" id="rf-debug-center-render-preview-refresh">Refresh</button><button type="button" id="rf-debug-center-render-preview-clear">Clear</button><button type="button" id="rf-debug-center-render-preview-copy">Copy JSON</button></div></div><div id="rf-debug-center-render-preview-body"></div>`;
  panel.append(make(doc, 'h3', {}, 'Render / Preview'), box);
  const status = box.querySelector('#rf-debug-center-render-preview-status');
  const meta = box.querySelector('#rf-debug-center-render-preview-meta');
  const body = box.querySelector('#rf-debug-center-render-preview-body');
  if (status) { status.textContent = `${renderPreview.status || 'unknown'} · ${renderPreview.mode || 'unknown'} · risk ${renderPreview.risk?.level || 'none'}`; status.dataset.state = renderPreview.status || 'unknown'; }
  if (meta) meta.textContent = `${renderPreview.previewDom?.rootExists ? 'root' : 'no root'} · ${renderPreview.previewDom?.contentExists ? 'content' : 'no content'} · pages ${renderPreview.previewDom?.pageCount ?? 0}`;
  if (body) {
    body.append(kv(doc, 'last preview', compact(renderPreview.lifecycle?.lastPreviewEvent)), kv(doc, 'last render', compact(renderPreview.lifecycle?.lastRenderEvent)), kv(doc, 'last export', compact(renderPreview.lifecycle?.lastExportEvent)), kv(doc, 'root', String(!!renderPreview.previewDom?.rootExists)), kv(doc, 'content', String(!!renderPreview.previewDom?.contentExists)), kv(doc, 'visible', String(!!renderPreview.previewDom?.visible)), kv(doc, 'pages', String(renderPreview.previewDom?.pageCount ?? 0)), kv(doc, 'target', renderPreview.previewDom?.rendererTargetSelector || '—'), kv(doc, 'preview requests', String(renderPreview.network?.previewRequests?.length || 0)), kv(doc, 'render requests', String(renderPreview.network?.renderRequests?.length || 0)), kv(doc, 'failed', String(renderPreview.network?.failed?.length || 0)), kv(doc, 'slow', String(renderPreview.network?.slow?.length || 0)));
    body.append(kv(doc, 'timeline', compact(renderPreview.correlations?.timeline || [])), kv(doc, 'performance', compact(renderPreview.correlations?.performance || [])), kv(doc, 'async', compact(renderPreview.correlations?.asyncRace || [])), kv(doc, 'owner', renderPreview.suggestedOwner || '—'));
    if (renderPreview.findings?.length) body.append(make(doc, 'div', { className: 'rf-debug-center-render-preview-findings' }, renderPreview.findings.slice(0, 6).map((item) => `${item.severity || 'info'} ${item.code || 'rule'} · ${item.evidence?.join(', ') || item.message || 'evidence'}`).join('\n')));
    else body.append(make(doc, 'div', { className: 'rf-debug-center-empty' }, 'no render/preview findings'));
    body.append(make(doc, 'pre', { className: 'rf-debug-center-pre' }, compact(renderPreview.evidence || [], 1000)));
  }
  bind(box.querySelector('#rf-debug-center-render-preview-refresh'), 'Refresh', actions.refreshRenderPreview || actions.refresh);
  bind(box.querySelector('#rf-debug-center-render-preview-clear'), 'Clear', actions.clearRenderPreview);
  bind(box.querySelector('#rf-debug-center-render-preview-copy'), 'Copy JSON', async () => { const json = actions.copyRenderPreviewJSON ? actions.copyRenderPreviewJSON() : ''; if (json && navigator?.clipboard?.writeText) { try { await navigator.clipboard.writeText(json); } catch (_) {} } return json; });
}
