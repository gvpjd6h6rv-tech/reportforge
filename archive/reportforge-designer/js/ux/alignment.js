import RF from '../rf.js';

/**
 * ux/alignment.js — RF.UX.Alignment
 * Layer   : UX
 * Purpose : Align (left/right/top/bottom/center) and distribute (horizontal/
 *           vertical spacing) selected elements. Fires LAYOUT_CHANGED.
 * Deps    : RF.Core.DocumentModel
 */

RF.UX.Alignment = {

  _sel()    { return RF.Core.DocumentModel.selectedElements; },
  _commit(label) {
    RF.Core.DocumentModel.isDirty = true;
    RF.emit(RF.E.LAYOUT_CHANGED);
    RF.emit(RF.E.STATUS, label);
  },

  alignLeft()    { this._align('left');    },
  alignRight()   { this._align('right');   },
  alignHCenter() { this._align('hcenter'); },
  alignTop()     { this._align('top');     },
  alignBottom()  { this._align('bottom');  },
  alignVCenter() { this._align('vcenter'); },
  alignBaseline(){ this._align('baseline');},

  _align(mode) {
    const els = this._sel();
    if (els.length<2) return;
    RF.H.snapshot('before-align');
    const ref = this._bbox(els);
    els.forEach(el => {
      switch(mode) {
        case 'left':     el.x = ref.x; break;
        case 'right':    el.x = ref.x+ref.w-el.w; break;
        case 'hcenter':  el.x = ref.x+(ref.w-el.w)/2; break;
        case 'top':      el.y = ref.y; break;
        case 'bottom':   el.y = ref.y+ref.h-el.h; break;
        case 'vcenter':  el.y = ref.y+(ref.h-el.h)/2; break;
        case 'baseline': el.y = ref.y+ref.h-el.h; break;
      }
      el.x=Math.round(el.x); el.y=Math.round(el.y);
    });
    this._commit('Align ' + mode);
  },

  distributeH()    { this._distribute('h');  },
  distributeV()    { this._distribute('v');  },
  equalSpacing()   { this._equalSpace();     },
  equalWidth()     { this._equalSize('w');   },
  equalHeight()    { this._equalSize('h');   },

  _distribute(axis) {
    const els = this._sel();
    if (els.length<3) return;
    RF.H.snapshot('before-distribute');
    if (axis==='h') {
      const sorted = [...els].sort((a,b)=>a.x-b.x);
      const first=sorted[0].x, last=sorted.at(-1).x+sorted.at(-1).w;
      const total=sorted.reduce((s,e)=>s+e.w,0);
      const gap=(last-first-total)/(sorted.length-1);
      let cur=first;
      sorted.forEach(el=>{el.x=Math.round(cur);cur+=el.w+gap;});
    } else {
      const sorted=[...els].sort((a,b)=>a.y-b.y);
      const first=sorted[0].y, last=sorted.at(-1).y+sorted.at(-1).h;
      const total=sorted.reduce((s,e)=>s+e.h,0);
      const gap=(last-first-total)/(sorted.length-1);
      let cur=first;
      sorted.forEach(el=>{el.y=Math.round(cur);cur+=el.h+gap;});
    }
    this._commit('Distribute ' + (axis==='h'?'H':'V'));
  },

  _equalSpace() {
    const els = this._sel();
    if (els.length<3) return;
    RF.H.snapshot('before-equal-space');
    const sorted=[...els].sort((a,b)=>(a.x+a.w/2)-(b.x+b.w/2));
    const total=sorted.reduce((s,e)=>s+e.w,0);
    const span=sorted.at(-1).x+sorted.at(-1).w-sorted[0].x;
    const gap=(span-total)/(sorted.length-1);
    let cur=sorted[0].x;
    sorted.forEach(el=>{el.x=Math.round(cur);cur+=el.w+gap;});
    this._commit('Equal spacing');
  },

  _equalSize(dim) {
    const els = this._sel();
    if (els.length<2) return;
    RF.H.snapshot('before-equal-size');
    const ref = Math.max(...els.map(e=>e[dim]));
    els.forEach(el => { el[dim]=ref; });
    this._commit('Equal ' + (dim==='w'?'width':'height'));
  },

  _bbox(els) {
    return {
      x:Math.min(...els.map(e=>e.x)), y:Math.min(...els.map(e=>e.y)),
      w:Math.max(...els.map(e=>e.x+e.w))-Math.min(...els.map(e=>e.x)),
      h:Math.max(...els.map(e=>e.y+e.h))-Math.min(...els.map(e=>e.y)),
    };
  },
};


// ═══════════════════════════════════════════════════════════════════════════════
// RF.UX.FormatPainter — Copy visual style from one element to many.
// ═══════════════════════════════════════════════════════════════════════════════
