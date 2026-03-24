import RF from '../rf.js';

/**
 * ux/field-drag-ghost.js — RF.UX.FieldDragGhost
 * Layer   : UX / v4
 * Purpose : Creates a styled ghost <div> that tracks the cursor while dragging
 *           a field from the explorer panel onto the canvas.
 * Deps    : none
 */

RF.UX.FieldDragGhost = {
  _ghost: null,
  _dropHighlight: null,

  init() {
    // Patch Explorer's drag events to show ghost
    const fe = document.getElementById('field-explorer');
    if (!fe) return;

    fe.addEventListener('dragstart', e => {
      const path = e.dataTransfer.getData('rf/field-path') ||
                   e.target.closest('[data-field-path]')?.dataset.fieldPath;
      if (!path) return;
      this._showGhost(path, e.clientX, e.clientY);
    });

    document.addEventListener('dragend', () => this._hideGhost());

    document.addEventListener('drag', e => {
      if (!this._ghost) return;
      this._ghost.style.left = (e.clientX+16)+'px';
      this._ghost.style.top  = (e.clientY+4)+'px';
    });

    // Section drop highlight
    document.addEventListener('dragover', e => {
      const body = e.target.closest('.rf-sec-body');
      if (body && body !== this._dropHighlight) {
        if (this._dropHighlight) this._dropHighlight.style.outline='';
        body.style.outline = '2px dashed var(--primary)';
        body.dataset.dragOver = '1';
        this._dropHighlight = body;
      }
    });

    document.addEventListener('drop', () => this._clearHighlight());
    document.addEventListener('dragend', () => this._clearHighlight());
  },

  _showGhost(path, x, y) {
    this._hideGhost();
    const ghost = document.createElement('div');
    ghost.className = 'el-drag-ghost';
    ghost.textContent = path;
    ghost.style.left = (x+16)+'px';
    ghost.style.top  = (y+4)+'px';
    document.body.appendChild(ghost);
    this._ghost = ghost;
  },

  _hideGhost() {
    this._ghost?.remove();
    this._ghost = null;
  },

  _clearHighlight() {
    if (this._dropHighlight) {
      this._dropHighlight.style.outline='';
      delete this._dropHighlight.dataset.dragOver;
      this._dropHighlight = null;
    }
  },
};


// ═══════════════════════════════════════════════════════════════════════════
// v4: Left panel tabs (Field Explorer / Report Explorer / Repository)
// ═══════════════════════════════════════════════════════════════════════════
