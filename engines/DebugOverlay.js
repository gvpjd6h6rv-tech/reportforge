'use strict';

const DebugOverlay = {
  _frame: 0, _layers: ['layout', 'canvas', 'overlay', 'handles', 'scroll'],
  _root() { return document.getElementById('rf-debug-overlay'); },
  _ensure() { if (this._root()) return this._root(); const root = document.createElement('div'); root.id = 'rf-debug-overlay'; root.innerHTML = `<div id="rf-debug-overlay-head"><span>runtime layers</span><span id="rf-debug-overlay-frame">f:0</span></div><div id="rf-debug-overlay-layers"></div>`; document.body.appendChild(root); makePanelDraggable(root, root.querySelector('#rf-debug-overlay-head'), 'RF_DEBUG_OVERLAY_POS', { left: Math.max(8, window.innerWidth - 240), top: Math.max(8, window.innerHeight - 220) }); const list = root.querySelector('#rf-debug-overlay-layers'); this._layers.forEach(layer => { const row = document.createElement('div'); row.className = 'rf-debug-layer'; row.dataset.layer = layer; row.innerHTML = `<div class="rf-debug-layer-name"><span class="rf-debug-layer-dot"></span><span class="rf-debug-layer-label">${layer}</span></div><span class="rf-debug-layer-meta">0</span>`; list.appendChild(row); }); return root; },
  syncVisibility() { const root = this._ensure(); root.classList.toggle('is-on', window.RF_DEBUG_TRACE === true); },
  _snapshot() { if (typeof RenderScheduler === 'undefined' || typeof RenderScheduler.getInvalidationState !== 'function') { return null; } return RenderScheduler.getInvalidationState(); },
  render(frameMeta) { const root = this._ensure(); if (window.RF_DEBUG_TRACE !== true) { root.classList.remove('is-on'); return; } root.classList.add('is-on'); const frame = frameMeta && typeof frameMeta.frame === 'number' ? frameMeta.frame : this._frame; this._frame = frame; const frameEl = document.getElementById('rf-debug-overlay-frame'); if (frameEl) frameEl.textContent = `f:${frame}`; const state = this._snapshot(); this._layers.forEach(layer => { const row = root.querySelector(`.rf-debug-layer[data-layer="${layer}"]`); if (!row) return; const item = state && state[layer] ? state[layer] : { dirty: false, frame: 0, reason: null, count: 0 }; const active = item.dirty === true || item.frame === frame; row.classList.toggle('active', active); row.title = item.reason || ''; const meta = row.querySelector('.rf-debug-layer-meta'); if (meta) meta.textContent = `${item.count || 0}${item.reason ? ` · ${item.reason}` : ''}`; }); },
  init() { this._ensure(); this.syncVisibility(); document.addEventListener('rf:runtime-frame', event => { this.render(event.detail || null); }); this.render(null); },
};

window.DebugOverlay = DebugOverlay;
