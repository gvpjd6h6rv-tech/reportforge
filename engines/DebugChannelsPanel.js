'use strict';

const _DEBUG_PANEL_CSS = `
  :host {
    position: fixed;
    z-index: 9012;
    min-inline-size: 220px;
    max-inline-size: 280px;
    display: none;
    flex-direction: column;
    gap: 8px;
    padding: 8px;
    border-radius: 8px;
    background: rgba(9,18,14,.94);
    border: 1px solid rgba(82,255,122,.35);
    box-shadow: 0 8px 20px rgba(0,0,0,.35);
    color: #d7ffe1;
    font: 10px/1.2 system-ui, sans-serif;
    pointer-events: auto;
    user-select: none;
    -webkit-user-select: none;
    backdrop-filter: blur(4px);
    box-sizing: border-box;
  }
  :host(.is-on) { display: flex; }
  #rf-debug-panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    text-transform: uppercase;
    letter-spacing: .06em;
    color: #9dffb2;
    font-size: 9px;
    cursor: grab;
  }
  #rf-debug-panel-head.is-dragging { cursor: grabbing; }
  #rf-debug-presets,
  #rf-debug-channels {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .rf-debug-chip {
    border: 1px solid rgba(255,255,255,.14);
    background: rgba(255,255,255,.06);
    color: inherit;
    border-radius: 999px;
    padding: 3px 7px;
    font: inherit;
    cursor: pointer;
  }
  .rf-debug-chip.is-active {
    background: rgba(82,255,122,.16);
    border-color: rgba(82,255,122,.4);
    color: #b8ffca;
  }
  .rf-debug-check {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 6px;
    border-radius: 999px;
    border: 1px solid rgba(255,255,255,.1);
    background: rgba(255,255,255,.04);
    cursor: pointer;
  }
  .rf-debug-check input {
    margin: 0;
    accent-color: #52ff7a;
  }
`;

const DebugChannelsPanel = {
  _channels: ['elements', 'selection', 'resize', 'edit', 'runtime', 'scheduler', 'invariants', 'overlay', 'zoom', 'scroll'],
  _presets:  ['quiet', 'elements', 'runtime', 'geometry', 'all'],
  _shadow:   null,

  _host() { return document.getElementById('rf-debug-panel-host'); },

  _ensure() {
    if (this._host()) return this._host();

    const anchor = document.getElementById('ui-mode-stack');
    if (!anchor) return null;

    const host = document.createElement('div');
    host.id = 'rf-debug-panel-host';
    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: 'open' });
    this._shadow = shadow;

    const style = document.createElement('style');
    style.textContent = _DEBUG_PANEL_CSS;
    shadow.appendChild(style);

    const head = document.createElement('div');
    head.id = 'rf-debug-panel-head';
    head.innerHTML = '<span>debug channels</span>';
    shadow.appendChild(head);

    const presetsEl = document.createElement('div');
    presetsEl.id = 'rf-debug-presets';
    this._presets.forEach(name => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rf-debug-chip';
      btn.dataset.preset = name;
      btn.textContent = name;
      btn.addEventListener('click', () => {
        DebugTrace.applyPreset(name);
        this.render();
        DebugTraceToggle.syncIndicator();
      });
      presetsEl.appendChild(btn);
    });
    shadow.appendChild(presetsEl);

    const channelsEl = document.createElement('div');
    channelsEl.id = 'rf-debug-channels';
    this._channels.forEach(channel => {
      const label = document.createElement('label');
      label.className = 'rf-debug-check';
      label.innerHTML = `<input type="checkbox" data-channel="${channel}"><span>${channel}</span>`;
      label.querySelector('input').addEventListener('change', e => {
        DebugTrace.setChannel(channel, e.target.checked);
        this.render();
      });
      channelsEl.appendChild(label);
    });
    shadow.appendChild(channelsEl);

    const anchorRect = anchor.getBoundingClientRect();
    makePanelDraggable(host, head, 'RF_DEBUG_PANEL_POS', {
      left: Math.max(12, anchorRect.left),
      top:  anchorRect.bottom + 8,
    });

    return host;
  },

  render() {
    const host = this._host();
    if (!host) return;
    const shadow = this._shadow;
    if (!shadow) return;

    const state = DebugTrace.getState();
    host.classList.toggle('is-on', state.enabled === true);

    shadow.querySelectorAll('[data-channel]').forEach(input => {
      input.checked = !!state.channels[input.dataset.channel];
    });
    shadow.querySelectorAll('[data-preset]').forEach(btn => {
      const active = JSON.stringify(state.channels) === JSON.stringify(DebugTrace.PRESETS[btn.dataset.preset]);
      btn.classList.toggle('is-active', active);
    });
  },
};

window.DebugChannelsPanel = DebugChannelsPanel;
