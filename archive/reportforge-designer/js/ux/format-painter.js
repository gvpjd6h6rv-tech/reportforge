import RF from '../rf.js';

/**
 * ux/format-painter.js — RF.UX.FormatPainter
 * Layer   : UX
 * Purpose : Copy visual style properties (font, color, border, background)
 *           from one element and paint them onto other selected elements.
 * Deps    : RF.Core.DocumentModel
 */

RF.UX.FormatPainter = {
  _active: false,
  _style:  null,

  // Style properties to copy
  STYLE_PROPS: ['fontFamily','fontSize','bold','italic','underline','align',
                'color','bgColor','borderWidth','borderColor','borderStyle'],

  activate() {
    const sel = RF.Core.DocumentModel.selectedElements;
    if (sel.length !== 1) { RF.emit(RF.E.STATUS, 'Select one element first'); return; }
    this._style  = {};
    this.STYLE_PROPS.forEach(k => { if(sel[0][k]!==undefined) this._style[k]=sel[0][k]; });
    this._active = true;
    // Make all elements glow as targets
    document.querySelectorAll('.rf-el').forEach(d=>d.classList.add('fp-target'));
    RF.emit(RF.E.STATUS, '🎨 Format Painter active — click target elements');
    // Update toolbar button visual
    document.getElementById('btn-fp')?.classList.add('format-painter-active');
  },

  apply(targetId) {
    if (!this._active || !this._style) return false;
    RF.H.snapshot('before-format-paint');
    RF.Core.DocumentModel.updateElement(targetId, this._style);
    RF.RP.syncElement(RF.Core.DocumentModel.getElementById(targetId));
    RF.emit(RF.E.STATUS, 'Format applied');
    return true;
  },

  deactivate() {
    this._active = false;
    document.querySelectorAll('.rf-el.fp-target').forEach(d=>d.classList.remove('fp-target'));
    document.getElementById('btn-fp')?.classList.remove('format-painter-active');
    RF.emit(RF.E.STATUS, 'Format Painter off');
  },

  get isActive() { return this._active; },
};


// ═══════════════════════════════════════════════════════════════════════════════
// RF.UX.DragTools — Drag + resize + Alt-drag-duplicate + distance indicators.
// ═══════════════════════════════════════════════════════════════════════════════
