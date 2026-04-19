'use strict';

const DebugChannelsPanel = {
  _channels: ['elements', 'selection', 'resize', 'edit', 'runtime', 'scheduler', 'invariants', 'overlay', 'zoom', 'scroll'],
  _presets: ['quiet', 'elements', 'runtime', 'geometry', 'all'],
  _root() { return document.getElementById('rf-debug-panel'); },
  _ensure() {
    if (this._root()) return this._root();
    const host = document.getElementById('ui-mode-stack'); if (!host) return null;
    const root = document.createElement('div'); root.id = 'rf-debug-panel'; root.innerHTML = `<div id="rf-debug-panel-head"><span>debug channels</span></div><div id="rf-debug-presets"></div><div id="rf-debug-channels"></div>`;
    document.body.appendChild(root);
    makePanelDraggable(root, root.querySelector('#rf-debug-panel-head'), 'RF_DEBUG_PANEL_POS', { left: Math.max(12, host.getBoundingClientRect().left), top: host.getBoundingClientRect().bottom + 8 });
    const presets = root.querySelector('#rf-debug-presets');
    this._presets.forEach(name => { const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'rf-debug-chip'; btn.dataset.preset = name; btn.textContent = name; btn.addEventListener('click', () => { DebugTrace.applyPreset(name); this.render(); DebugTraceToggle.syncIndicator(); }); presets.appendChild(btn); });
    const channels = root.querySelector('#rf-debug-channels');
    this._channels.forEach(channel => { const label = document.createElement('label'); label.className = 'rf-debug-check'; label.innerHTML = `<input type="checkbox" data-channel="${channel}"><span>${channel}</span>`; label.querySelector('input').addEventListener('change', e => { DebugTrace.setChannel(channel, e.target.checked); this.render(); }); channels.appendChild(label); });
    return root;
  },
  render() { const root = this._ensure(); if (!root) return; const state = DebugTrace.getState(); root.classList.toggle('is-on', state.enabled === true); root.querySelectorAll('[data-channel]').forEach(input => { input.checked = !!state.channels[input.dataset.channel]; }); root.querySelectorAll('[data-preset]').forEach(btn => { const active = JSON.stringify(state.channels) === JSON.stringify(DebugTrace.PRESETS[btn.dataset.preset]); btn.classList.toggle('is-active', active); }); },
};

window.DebugChannelsPanel = DebugChannelsPanel;
