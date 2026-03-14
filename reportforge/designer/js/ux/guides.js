import RF from '../rf.js';

/**
 * ux/guides.js — RF.UX.Guides
 * Layer   : UX
 * Purpose : Renders SVG alignment guide lines while dragging or resizing,
 *           showing distance to nearest edges and section boundaries.
 * Deps    : RF.Core.DocumentModel
 */

RF.UX.Guides = {
  _layer: null,
  _snapLayer: null,

  init() {
    this._layer     = document.getElementById('guide-layer');
    this._snapLayer = document.getElementById('snap-guide-layer');
    if (!this._layer) {
      this._layer = document.createElement('div');
      this._layer.id = 'guide-layer';
      this._layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:5000;';
      document.getElementById('canvas-surface')?.appendChild(this._layer);
    }
    if (!this._snapLayer) {
      this._snapLayer = document.createElement('div');
      this._snapLayer.id = 'snap-guide-layer';
      this._snapLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:5001;';
      document.getElementById('canvas-surface')?.appendChild(this._snapLayer);
    }
    RF.on(RF.E.GUIDES_CHANGED, () => this.render());
    RF.on(RF.E.SNAP_GUIDES, guides => this._renderSnap(guides));
  },

  add(orientation, position) {
    RF.Core.DocumentModel.guides.push({ id:RF.uid('g'), orientation, position });
    this.render();
  },

  render() {
    if (!this._layer) return;
    RF.clear(this._layer);
    RF.Core.DocumentModel.guides.forEach(g => {
      const d = document.createElement('div');
      d.className = 'guide-line ' + g.orientation;
      if (g.orientation === 'h') d.style.top  = g.position+'px';
      else                        d.style.left = g.position+'px';
      d.dataset.guideid = g.id;
      d.style.pointerEvents = 'all';
      d.addEventListener('pointerdown', e => this._drag(e, g));
      d.addEventListener('dblclick',  () => { RF.Core.DocumentModel.guides = RF.Core.DocumentModel.guides.filter(x=>x.id!==g.id); this.render(); });
      this._layer.appendChild(d);
    });
  },

  _drag(e, guide) {
    e.preventDefault(); e.stopPropagation();
    const onMove = ev => {
      const pt = this._canvasPt(ev);
      guide.position = Math.round(guide.orientation==='h' ? pt.y : pt.x);
      this.render();
    };
    const onUp = () => { document.removeEventListener('pointermove',onMove); document.removeEventListener('pointerup',onUp); };
    document.addEventListener('pointermove',onMove);
    document.addEventListener('pointerup',onUp);
  },

  _renderSnap(guides) {
    if (!this._snapLayer) return;
    RF.clear(this._snapLayer);
    (guides||[]).forEach(g => {
      const d = document.createElement('div');
      d.className = 'snap-guide show ' + (g.o==='h'?'h':'v');
      if (g.o==='h') d.style.top  = g.p+'px';
      else           d.style.left = g.p+'px';
      this._snapLayer.appendChild(d);
    });
    clearTimeout(this._snapTimer);
    this._snapTimer = setTimeout(()=>{ if(this._snapLayer) RF.clear(this._snapLayer); }, 700);
  },

  _canvasPt(e) {
    const surf = document.getElementById('canvas-surface');
    const rect = surf?.getBoundingClientRect();
    const DM   = RF.Core.DocumentModel;
    return { x:(e.clientX-rect.left)/DM.zoom, y:(e.clientY-rect.top)/DM.zoom };
  },
};


// ═══════════════════════════════════════════════════════════════════════════════
// RF.UX.Alignment — Align, distribute, equal spacing/size.
// ═══════════════════════════════════════════════════════════════════════════════
