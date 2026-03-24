import RF from '../rf.js';

/**
 * classic/status-bar-v4.js — RF.Classic.StatusBarV4
 * Layer   : Classic UI / v4
 * Purpose : Status bar below the canvas. Shows grid on/off, snap on/off,
 *           zoom %, W×H of selection, and live cursor coordinates.
 * Deps    : RF.Core.DocumentModel
 */

RF.Classic.StatusBarV4 = {
  init() {
    const sb = document.getElementById('statusbar');
    if (!sb || sb.dataset.v4) return;
    sb.dataset.v4 = '1';

    // Elements already exist in index.html — no need to add them
    // Update W×H on selection change
    RF.on(RF.E.SEL_CHANGED,       () => this._updateWH());
    RF.on(RF.E.INSPECTOR_REFRESH, () => this._updateWH());
    RF.on(RF.E.LAYOUT_CHANGED,    () => this._updateGrid());

    this._updateGrid();
    this._updateSnap();
  },

  _updateWH() {
    const sel = RF.Core.DocumentModel.selectedElements;
    const el = document.getElementById('sb-wh');
    if (!el) return;
    if (sel.length === 1) {
      const e = sel[0];
      el.textContent = `W:${Math.round(e.w)} H:${Math.round(e.h)}`;
    } else if (sel.length > 1) {
      el.textContent = `${sel.length} elements`;
    } else {
      el.textContent = '';
    }
  },

  _updateGrid() {
    const DM = RF.Core.DocumentModel;
    const el = document.getElementById('sb-grid');
    if (el) el.textContent = DM.showGrid ? `Grid:${DM.gridSize}px` : 'Grid:off';
  },

  _updateSnap() {
    const DM = RF.Core.DocumentModel;
    const el = document.getElementById('sb-snap');
    if (el) {
      el.textContent = DM.snapToGrid ? 'Snap:on' : 'Snap:off';
      el.style.color = DM.snapToGrid ? 'var(--accent)' : 'var(--text-faint)';
    }
  },
};


// ── v4: Toolbar extensions ─────────────────────────────────────────────────────
