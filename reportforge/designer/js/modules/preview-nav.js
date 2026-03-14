import RF from '../rf.js';

/**
 * modules/preview-nav.js — RF.Modules.PreviewNav
 * Layer   : Modules (v4)
 * Purpose : Preview page navigation helpers. Tracks total page count returned
 *           by the render API and provides go/prev/next/last page actions.
 * Deps    : RF.Modules.Preview
 */

RF.Modules.PreviewNav = {
  _page: 1, _total: 1,
  go(n) {
    this._page = Math.max(1, Math.min(n, this._total));
    this._updateUI();
    // In a real implementation, would call API with page param
    RF.emit(RF.E.STATUS, `Preview page ${this._page} of ${this._total}`);
  },
  prev()   { this.go(this._page - 1); },
  next()   { this.go(this._page + 1); },
  goLast() { this.go(this._total); },
  _updateUI() {
    const p=this._page, t=this._total;
    const first=document.getElementById('pv-first'), prev=document.getElementById('pv-prev');
    const next=document.getElementById('pv-next'), last=document.getElementById('pv-last');
    const info=document.getElementById('pv-page-info');
    if(first) first.disabled=p<=1; if(prev) prev.disabled=p<=1;
    if(next)  next.disabled=p>=t;  if(last) last.disabled=p>=t;
    if(info)  info.textContent=`Page ${p} of ${t}`;
  },
};


// ── v4: Extended keyboard shortcuts ────────────────────────────────────────────
