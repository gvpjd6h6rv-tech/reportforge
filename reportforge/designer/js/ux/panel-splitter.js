import RF from '../rf.js';

/**
 * ux/panel-splitter.js — RF.UX.PanelSplitter
 * Layer   : UX / v4
 * Purpose : Drag handles between the left panel, canvas, and right panel
 *           to resize the workspace columns.
 * Deps    : none
 */

RF.UX.PanelSplitter = {
  init() {
    if (this._inited) return;
    this._inited = true;
    // Make field explorer resizable
    this._makeSplitter('field-explorer', 'right');
    this._makeSplitter('property-inspector', 'left');
  },

  _makeSplitter(panelId, side) {
    const panel = document.getElementById(panelId);
    if (!panel) return;
    const splitter = document.createElement('div');
    splitter.className = 'panel-splitter';
    splitter.title = 'Drag to resize';
    if (side === 'right') panel.parentElement?.insertBefore(splitter, panel.nextElementSibling);
    else                  panel.parentElement?.insertBefore(splitter, panel);

    let startX, startW;
    splitter.addEventListener('pointerdown', e => {
      e.preventDefault();
      startX = e.clientX; startW = panel.offsetWidth;
      const onMove = ev => {
        const dx = side==='right' ? ev.clientX-startX : startX-ev.clientX;
        const nw = Math.max(160, Math.min(400, startW+dx));
        panel.style.width = nw+'px';
        panel.style.minWidth = nw+'px';
      };
      const onUp = () => {
        document.removeEventListener('pointermove',onMove);
        document.removeEventListener('pointerup',onUp);
      };
      document.addEventListener('pointermove',onMove);
      document.addEventListener('pointerup',onUp);
    });
  },
};


// ── v4: Enhanced status bar ────────────────────────────────────────────────────
