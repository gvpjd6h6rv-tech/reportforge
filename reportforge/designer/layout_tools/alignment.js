// ─────────────────────────────────────────────────────────────────────────────
// layout_tools/alignment.js  –  Align & Distribute  (features 16–23)
// ─────────────────────────────────────────────────────────────────────────────
RF.Alignment = {

  _selected() { return RF.AppState.selectedElements; },

  _commit(label) {
    RF.AppState.isDirty = true;
    RF.EventBus.emit('layout:changed');
    RF.EventBus.emit('status', label);
  },

  // ── Alignment ──────────────────────────────────────────────────────────────
  // Reference is the bounding box of all selected elements unless exactly
  // one is selected (then it's that element itself).

  alignLeft()   { this._align('left');   },
  alignRight()  { this._align('right');  },
  alignHCenter(){ this._align('hcenter');},
  alignTop()    { this._align('top');    },
  alignBottom() { this._align('bottom'); },
  alignVCenter(){ this._align('vcenter');},

  _align(mode) {
    const els = this._selected();
    if (els.length < 2) return;
    RF.History.snapshot('before-align');

    const ref = this._bbox(els);
    els.forEach(el => {
      switch (mode) {
        case 'left':    el.x = ref.x; break;
        case 'right':   el.x = ref.x + ref.w - el.w; break;
        case 'hcenter': el.x = ref.x + (ref.w - el.w) / 2; break;
        case 'top':     el.y = ref.y; break;
        case 'bottom':  el.y = ref.y + ref.h - el.h; break;
        case 'vcenter': el.y = ref.y + (ref.h - el.h) / 2; break;
      }
      el.x = Math.round(el.x);
      el.y = Math.round(el.y);
    });
    this._commit(`Align ${mode}`);
  },

  // ── Distribution (features 21–23) ─────────────────────────────────────────
  distributeHorizontal() { this._distribute('h'); },
  distributeVertical()   { this._distribute('v'); },
  equalSpacing()         { this._equalSpace(); },

  _distribute(axis) {
    const els = this._selected();
    if (els.length < 3) return;
    RF.History.snapshot('before-distribute');

    if (axis === 'h') {
      const sorted = [...els].sort((a,b) => a.x - b.x);
      const first  = sorted[0].x;
      const last   = sorted[sorted.length-1].x + sorted[sorted.length-1].w;
      const total  = sorted.reduce((s,e)=>s+e.w, 0);
      const gap    = (last - first - total) / (sorted.length - 1);
      let cur = first;
      sorted.forEach(el => { el.x = Math.round(cur); cur += el.w + gap; });
    } else {
      const sorted = [...els].sort((a,b) => a.y - b.y);
      const first  = sorted[0].y;
      const last   = sorted[sorted.length-1].y + sorted[sorted.length-1].h;
      const total  = sorted.reduce((s,e)=>s+e.h, 0);
      const gap    = (last - first - total) / (sorted.length - 1);
      let cur = first;
      sorted.forEach(el => { el.y = Math.round(cur); cur += el.h + gap; });
    }
    this._commit(`Distribute ${axis==='h'?'horizontal':'vertical'}`);
  },

  _equalSpace() {
    const els = this._selected();
    if (els.length < 3) return;
    RF.History.snapshot('before-equal-space');

    // Sort by horizontal center
    const sorted = [...els].sort((a,b) => (a.x+a.w/2) - (b.x+b.w/2));
    const totalW  = sorted.reduce((s,e)=>s+e.w, 0);
    const span    = sorted[sorted.length-1].x + sorted[sorted.length-1].w - sorted[0].x;
    const gap     = (span - totalW) / (sorted.length - 1);
    let cur = sorted[0].x;
    sorted.forEach(el => { el.x = Math.round(cur); cur += el.w + gap; });
    this._commit('Equal spacing');
  },

  // ── Bounding box of a set of elements ─────────────────────────────────────
  _bbox(els) {
    const minX = Math.min(...els.map(e => e.x));
    const minY = Math.min(...els.map(e => e.y));
    const maxX = Math.max(...els.map(e => e.x + e.w));
    const maxY = Math.max(...els.map(e => e.y + e.h));
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  },
};

RF.Distribution = RF.Alignment; // same module
