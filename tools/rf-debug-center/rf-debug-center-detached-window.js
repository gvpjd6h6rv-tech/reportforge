'use strict';

const WINDOW_NAME = 'RFDebugCenterDetached';
const WINDOW_FEATURES = 'width=1200,height=850,resizable=yes,scrollbars=yes,menubar=no,toolbar=no,location=no,status=no';

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
function json(value, fallback = '{}') {
  try { return JSON.stringify(value ?? {}, null, 2); } catch (_) { return fallback; }
}
function section(title, body, active = false) {
  return `<section class="sec${active ? ' active' : ''}" data-tab="${esc(title)}"><h2>${esc(title)}</h2><pre>${esc(body)}</pre></section>`;
}
function buildHtml(payload) {
  const sections = payload.sections.map((item, index) => section(item.title, item.body, index === 0)).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>RF Debug Center</title><style>
    :root{color-scheme:dark;}
    html,body{height:100%;margin:0}
    body{background:#06110c;color:#d8ffe2;font:13px/1.45 monospace}
    .app{display:grid;grid-template-columns:220px minmax(0,1fr);grid-template-rows:56px minmax(0,1fr) 30px;height:100vh}
    header,footer{grid-column:1 / 3;display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid rgba(132,255,158,.16);background:#08150f}
    footer{border-bottom:0;border-top:1px solid rgba(132,255,158,.12);font-size:12px;color:#96bfa2}
    nav{overflow:auto;border-right:1px solid rgba(132,255,158,.12);padding:10px;background:#07120d}
    main{overflow:auto;padding:14px;min-width:0}
    .navbtn,.headbtn{background:#132219;color:#eaffef;border:1px solid rgba(132,255,158,.18);border-radius:999px;padding:6px 10px;font:inherit;cursor:pointer}
    .navbtn.active{background:#1f3a29;border-color:rgba(132,255,158,.55)}
    .nav{display:grid;gap:8px}
    .sec{display:none;gap:10px}
    .sec.active{display:grid}
    h1,h2{margin:0}
    h1{font-size:14px;letter-spacing:.04em;text-transform:uppercase;color:#84ff9e}
    .meta{color:#96bfa2;font-size:12px}
    pre{margin:0;padding:12px;border-radius:10px;background:#09140f;border:1px solid rgba(132,255,158,.10);white-space:pre-wrap;overflow:auto;min-width:0}
    .actions{display:flex;gap:8px;flex-wrap:wrap}
  </style></head><body><div class="app">
  <header><div><h1>RF Debug Center</h1><div class="meta">${esc(payload.meta)}</div></div><div class="actions"><button class="headbtn" data-act="refresh">Refresh</button><button class="headbtn" data-act="copy">Copy Bundle</button><button class="headbtn" data-act="close">Close</button></div></header>
  <nav><div class="nav">${payload.sections.map((item, index) => `<button class="navbtn${index === 0 ? ' active' : ''}" data-tab="${esc(item.title)}">${esc(item.title)}</button>`).join('')}</div></nav>
  <main>${sections}</main>
  <footer>${esc(payload.footer)}</footer>
  </div><script>
    const openerApi = () => window.opener && window.opener.RFDebugCenter;
    const setActive = (tab) => {
      document.querySelectorAll('.navbtn').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tab));
      document.querySelectorAll('.sec').forEach((sec) => sec.classList.toggle('active', sec.dataset.tab === tab));
    };
    document.querySelectorAll('.navbtn').forEach((btn) => btn.addEventListener('click', () => setActive(btn.dataset.tab)));
    document.querySelectorAll('[data-act]').forEach((btn) => btn.addEventListener('click', async () => {
      const api = openerApi();
      if (!api) return;
      if (btn.dataset.act === 'refresh') api.syncDetachedWindow?.();
      if (btn.dataset.act === 'copy') { try { await api.copyBundleJSON?.(); } catch (_) {} api.syncDetachedWindow?.(); }
      if (btn.dataset.act === 'close') api.closeDetachedWindow?.();
    }));
    window.addEventListener('unload', () => { try { window.opener?.RFDebugCenter?.getDetachedWindowState?.(); } catch (_) {} });
  </script></body></html>`;
}

export function createDetachedDebugCenterWindow(win, { getState, buildBundle, copyBundleJSON, onClose } = {}) {
  const window = win;
  const state = { child: null, open: false, closed: true, popupBlocked: false, lastSyncAt: null, error: null };
  const snapshot = () => ({ open: state.open, closed: state.closed, popupBlocked: state.popupBlocked, lastSyncAt: state.lastSyncAt, error: state.error });
  const cleanup = () => { if (state.child?.closed) state.child = null; state.open = false; state.closed = true; };
  const read = () => {
    const model = typeof getState === 'function' ? getState() : null;
    const bundle = typeof buildBundle === 'function' ? buildBundle() : null;
    return {
      meta: `${model?.activation || 'disabled'} · ${model?.bundle?.status || 'idle'} · ${new Date().toISOString()}`,
      footer: `last sync ${new Date().toISOString()} · open ${model?.enabled ? 'yes' : 'no'}`,
      sections: [
        { title: 'Overview', body: json({ enabled: model?.enabled, activation: model?.activation, last: model?.last, live: model?.live }) },
        { title: 'Causal', body: json(model?.causalIntelligence || model?.causal || {}) },
        { title: 'Warnings', body: json(model?.warnings || {}) },
        { title: 'DOM Scanner', body: json(model?.domScanner || {}) },
        { title: 'Network', body: json(model?.network || {}) },
        { title: 'Performance', body: json(model?.performance || {}) },
        { title: 'Render', body: json(model?.renderPreview || {}) },
        { title: 'Selection', body: json(model?.selection || {}) },
        { title: 'Visual', body: json(model?.visualEvidence || {}) },
        { title: 'Bundle', body: json(bundle || model?.bundlePreview || model?.bundle || {}) },
        { title: 'Raw JSON', body: json(model || {}) },
      ],
    };
  };
  const write = (child, payload) => { child.document.open(); child.document.write(buildHtml(payload)); child.document.close(); };
  const sync = () => {
    if (!state.child || state.child.closed) { cleanup(); return snapshot(); }
    try { write(state.child, read()); state.lastSyncAt = new Date().toISOString(); state.error = null; state.open = true; state.closed = false; }
    catch (error) { state.error = error?.message || 'sync-failed'; }
    return snapshot();
  };
  const open = () => {
    if (state.child && !state.child.closed) { state.open = true; state.closed = false; state.popupBlocked = false; sync(); state.child.focus?.(); return snapshot(); }
    try {
      const child = window.open('about:blank', WINDOW_NAME, WINDOW_FEATURES);
      if (!child) { state.popupBlocked = true; state.error = 'popup-blocked'; state.open = false; state.closed = true; return snapshot(); }
      state.child = child; state.open = true; state.closed = false; state.popupBlocked = false; state.error = null;
      write(child, read());
      state.lastSyncAt = new Date().toISOString();
      child.focus?.();
      child.addEventListener?.('beforeunload', () => cleanup(), { once: true });
      return snapshot();
    } catch (error) {
      state.popupBlocked = false;
      state.error = error?.message || 'open-failed';
      state.open = false;
      state.closed = true;
      return snapshot();
    }
  };
  const close = () => {
    const child = state.child;
    if (child && !child.closed) { try { child.close(); } catch (_) {} }
    state.child = null;
    state.open = false;
    state.closed = true;
    state.popupBlocked = false;
    state.error = null;
    if (typeof onClose === 'function') onClose();
    return snapshot();
  };
  const getDetachedState = () => (state.child && state.child.closed ? cleanup() : null, snapshot());
  return { open, close, sync, getState: getDetachedState, snapshot };
}

export { WINDOW_NAME, WINDOW_FEATURES };
