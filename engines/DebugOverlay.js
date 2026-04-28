'use strict';

const _DEBUG_OVERLAY_CSS = `
  :host {
    position: fixed;
    inset-inline-end: 10px;
    inset-block-end: 26px;
    z-index: 9010;
    min-inline-size: 180px;
    max-inline-size: 220px;
    padding: 8px 10px;
    display: none;
    flex-direction: column;
    gap: 6px;
    background: rgba(9,18,14,.9);
    border: 1px solid rgba(82,255,122,.4);
    border-radius: 8px;
    box-shadow: 0 8px 20px rgba(0,0,0,.35);
    color: #d7ffe1;
    font: 11px/1.2 system-ui, sans-serif;
    pointer-events: auto;
    user-select: none;
    -webkit-user-select: none;
    backdrop-filter: blur(4px);
    box-sizing: border-box;
  }
  :host(.is-on) { display: flex; }
  #rf-debug-overlay-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    color: #9dffb2;
    text-transform: uppercase;
    letter-spacing: .06em;
    font-size: 9px;
    cursor: grab;
  }
  #rf-debug-overlay-head.is-dragging { cursor: grabbing; }
  #rf-debug-overlay-layers {
    display: grid;
    grid-template-columns: 1fr;
    gap: 4px;
  }
  .rf-debug-layer {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 6px;
    align-items: center;
    padding: 4px 6px;
    border-radius: 5px;
    background: rgba(255,255,255,.04);
    border: 1px solid rgba(255,255,255,.05);
    transition: background .12s ease, border-color .12s ease, box-shadow .12s ease;
  }
  .rf-debug-layer.active {
    background: rgba(82,255,122,.14);
    border-color: rgba(82,255,122,.45);
    box-shadow: inset 0 0 0 1px rgba(82,255,122,.18), 0 0 10px rgba(82,255,122,.12);
  }
  .rf-debug-layer-name {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .rf-debug-layer-dot {
    inline-size: 7px;
    block-size: 7px;
    border-radius: 50%;
    background: rgba(164,172,168,.55);
    flex: 0 0 auto;
  }
  .rf-debug-layer.active .rf-debug-layer-dot {
    background: #52ff7a;
    box-shadow: 0 0 8px rgba(82,255,122,.75);
  }
  .rf-debug-layer-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .rf-debug-layer-meta {
    color: rgba(215,255,225,.72);
    font-size: 10px;
  }
`;

const DebugOverlay = {
  _shadow: null,
  _frame: 0,
  _layers: ['layout', 'canvas', 'overlay', 'handles', 'scroll'],

  _host() { return document.getElementById('rf-debug-overlay-host'); },

  _ensure() {
    if (this._host()) return this._host();

    const host = document.createElement('div');
    host.id = 'rf-debug-overlay-host';
    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: 'open' });
    this._shadow = shadow;

    const style = document.createElement('style');
    style.textContent = _DEBUG_OVERLAY_CSS;
    shadow.appendChild(style);

    const head = document.createElement('div');
    head.id = 'rf-debug-overlay-head';
    head.innerHTML = '<span>runtime layers</span><span id="rf-debug-overlay-frame">f:0</span>';
    shadow.appendChild(head);

    const layersEl = document.createElement('div');
    layersEl.id = 'rf-debug-overlay-layers';
    this._layers.forEach(layer => {
      const row = document.createElement('div');
      row.className = 'rf-debug-layer';
      row.dataset.layer = layer;
      row.innerHTML = `<div class="rf-debug-layer-name"><span class="rf-debug-layer-dot"></span><span class="rf-debug-layer-label">${layer}</span></div><span class="rf-debug-layer-meta">0</span>`;
      layersEl.appendChild(row);
    });
    shadow.appendChild(layersEl);

    makePanelDraggable(host, head, 'RF_DEBUG_OVERLAY_POS', {
      left: Math.max(8, window.innerWidth - 240),
      top:  Math.max(8, window.innerHeight - 220),
    });

    return host;
  },

  syncVisibility() {
    const host = this._ensure();
    host.classList.toggle('is-on', window.RF_DEBUG_TRACE === true);
  },

  _snapshot() {
    if (typeof RenderScheduler === 'undefined' || typeof RenderScheduler.getInvalidationState !== 'function') return null;
    return RenderScheduler.getInvalidationState();
  },

  render(frameMeta) {
    const host = this._ensure();
    if (window.RF_DEBUG_TRACE !== true) { host.classList.remove('is-on'); return; }
    host.classList.add('is-on');

    const shadow = this._shadow;
    if (!shadow) return;

    const frame = frameMeta && typeof frameMeta.frame === 'number' ? frameMeta.frame : this._frame;
    this._frame = frame;

    const frameEl = shadow.getElementById('rf-debug-overlay-frame');
    if (frameEl) frameEl.textContent = `f:${frame}`;

    const state = this._snapshot();
    this._layers.forEach(layer => {
      const row = shadow.querySelector(`.rf-debug-layer[data-layer="${layer}"]`);
      if (!row) return;
      const item   = state && state[layer] ? state[layer] : { dirty: false, frame: 0, reason: null, count: 0 };
      const active = item.dirty === true || item.frame === frame;
      row.classList.toggle('active', active);
      row.title = item.reason || '';
      const meta = row.querySelector('.rf-debug-layer-meta');
      if (meta) meta.textContent = `${item.count || 0}${item.reason ? ` · ${item.reason}` : ''}`;
    });
  },

  init() {
    this._ensure();
    this.syncVisibility();
    document.addEventListener('rf:runtime-frame', event => { this.render(event.detail || null); });
    this.render(null);
  },
};

window.DebugOverlay = DebugOverlay;
