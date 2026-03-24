'use strict';

function _canonicalPreviewWriter(){
  window.RF?.RuntimeServices?.setOwner?.('preview', 'PreviewEngineV19');
  if (typeof PreviewEngineV19 === 'undefined') {
    const message = 'PREVIEW OWNER MISSING IN CANONICAL RUNTIME';
    console.error(message);
    throw new Error(message);
  }
  return PreviewEngineV19;
}

const ZOOM_STEPS=[0.25,0.5,0.75,1.0,1.5,2.0,3.0,4.0];
function _snapZoom(z){return ZOOM_STEPS.reduce((a,b)=>Math.abs(b-z)<Math.abs(a-z)?b:a,ZOOM_STEPS[0]);}

function computeLayout() {
  const rulerWidth  = CFG.RULER_W;
  const rulerHeight = CFG.RULER_H;
  const marginLeft  = DS.pageMarginLeft  || CFG.PAGE_MARGIN_LEFT;
  const marginTop   = DS.pageMarginTop   || CFG.PAGE_MARGIN_TOP;
  const canvasX = rulerWidth  + marginLeft;
  const canvasY = rulerHeight + marginTop;
  const workspaceLeft = rulerWidth;
  const workspaceTop  = rulerHeight;
  return { rulerWidth, rulerHeight, canvasX, canvasY,
           workspaceLeft, workspaceTop, marginLeft, marginTop };
}

function applyLayout() {
  const lay = computeLayout();
  const cl  = document.getElementById('canvas-layer');
  const vp  = document.getElementById('viewport');
  if (cl) {
    cl.style.setProperty('--layout-canvas-left', lay.marginLeft + 'px');
    cl.style.setProperty('--layout-canvas-top',  lay.marginTop  + 16 + 'px');
  }
  if (vp) {
  }
}

const DesignZoomEngine={
  _apply(z, anchorClientX, anchorClientY){
    const PAGE_W = CFG.PAGE_W;
    const ws = document.getElementById('workspace');
    const vp = document.getElementById('viewport');
    const cl = document.getElementById('canvas-layer');
    if (!vp || !cl) return;
    const oldZ = DS.zoom;
    if (ws && oldZ !== z) {
      const ratio = z / oldZ;
      if (anchorClientX !== undefined) {
        const wsRect = ws.getBoundingClientRect();
        const mx = anchorClientX - wsRect.left;
        const my = anchorClientY - wsRect.top;
        ws.scrollLeft = (mx + ws.scrollLeft) * ratio - mx;
        ws.scrollTop  = (my + ws.scrollTop)  * ratio - my;
      } else {
        const cx = ws.clientWidth  / 2;
        const cy = ws.clientHeight / 2;
        ws.scrollLeft = (cx + ws.scrollLeft) * ratio - cx;
        ws.scrollTop  = (cy + ws.scrollTop)  * ratio - cy;
      }
    }
    DS.setZoom(z);
    const applyZoomChrome = () => {
      vp.style.transform       = 'none';
      vp.style.transformOrigin = '';
      vp.style.marginBottom    = '16px';
      vp.style.display = 'block';
      vp.style.width   = (PAGE_W * z) + 'px';
      cl.style.transform = '';
      cl.style.setProperty('--geo-zoom', z);
    };
    if (typeof RenderScheduler !== 'undefined') {
      RenderScheduler.flushSync(applyZoomChrome, 'DesignZoomEngine._apply');
    } else {
      applyZoomChrome();
    }
    ZoomWidget.sync();
    const pct = Math.round(z * 100) + '%';
    const sel = document.getElementById('tb-zoom');
    if (sel) { for (let o of sel.options) if (o.text === pct) { o.selected = true; break; } }
  },
  set(z, anchorClientX, anchorClientY){
    z = Math.max(0.01, Math.min(64.0, parseFloat(z)));
    this._apply(z, anchorClientX, anchorClientY);
  },
  setFree(z, anchorClientX, anchorClientY){
    z = Math.max(0.01, Math.min(64.0, parseFloat(z)));
    this._apply(z, anchorClientX, anchorClientY);
  },
  get(){ return DS.zoom; },
  zoomIn(ax,ay){ const i=ZOOM_STEPS.indexOf(_snapZoom(DS.zoom)); if(i<ZOOM_STEPS.length-1) this.set(ZOOM_STEPS[i+1],ax,ay); },
  zoomOut(ax,ay){ const i=ZOOM_STEPS.indexOf(_snapZoom(DS.zoom)); if(i>0) this.set(ZOOM_STEPS[i-1],ax,ay); },
  reset(){ this.set(1.0); },
};

const PreviewZoomEngine={
  set(z){
    z=Math.max(0.01,Math.min(64.0,parseFloat(z)));
    DS.previewZoom=z;
    if(DS.previewMode) DesignZoomEngine._apply(z);
    const pv=document.getElementById('preview-content');
    if(pv){ pv.style.zoom=''; pv.style.transform=''; }
    ZoomWidget.sync();
  },
  get(){return DS.previewZoom||1.0;},
  zoomIn(){const i=ZOOM_STEPS.findIndex(s=>Math.abs(s-(DS.previewZoom||1))<0.01);if(i<ZOOM_STEPS.length-1)this.set(ZOOM_STEPS[i+1]);},
  zoomOut(){const i=ZOOM_STEPS.findIndex(s=>Math.abs(s-(DS.previewZoom||1))<0.01);if(i>0)this.set(ZOOM_STEPS[i-1]);},
  reset(){this.set(1.0);},
};

const ZoomWidget={
  init(){
    document.getElementById('zw-in').addEventListener('click',()=>this._eng().zoomIn());
    document.getElementById('zw-out').addEventListener('click',()=>this._eng().zoomOut());
    document.getElementById('zw-pct').addEventListener('dblclick',()=>this._eng().reset());
    const slider=document.getElementById('zw-slider');
    if(slider){
      slider.addEventListener('input',()=>{
        this._eng().set(parseFloat(slider.value)/100);
      });
    }
    this.sync();
  },
  _eng(){return DS.previewMode?PreviewZoomEngine:DesignZoomEngine;},
  sync(){
    const z=DS.previewMode?(DS.previewZoom||1.0):DS.zoom;
    const pct=Math.round(z*100)+'%';
    const el=document.getElementById('zw-pct');const ml=document.getElementById('zw-mode');
    const zi=document.getElementById('zw-in');const zo=document.getElementById('zw-out');
    const sl=document.getElementById('zw-slider');
    if(el)el.textContent=pct;
    if(ml)ml.textContent=DS.previewMode?'PREVIEW':'DISEÑO';
    const sb=document.getElementById('sb-zoom');if(sb)sb.textContent=pct;
    if(zi)zi.disabled=(z>=4.0);if(zo)zo.disabled=(z<=0.25);
    if(sl)sl.value=Math.round(z*100);
  },
};

const ZoomEngine={
  set(z){DesignZoomEngine.set(z);},
  get(){return DesignZoomEngine.get();},
  step(d){d>0?DesignZoomEngine.zoomIn():DesignZoomEngine.zoomOut();}
};

const ZoomEngineV19 = (() => {
  const _listeners = [];
  function _notify(z) {
    for (const fn of _listeners) {
      try { fn(z); } catch (e) { console.error('[ZoomEngine]', e); }
    }
  }
  return {
    STEPS: ZOOM_STEPS,
    set(z, anchorX, anchorY) {
      const snapped = Math.max(0.25, Math.min(4.0, _snapZoom(parseFloat(z))));
      DesignZoomEngine.set(snapped, anchorX, anchorY);
      _notify(snapped);
    },
    setFree(z, anchorX, anchorY) {
      const clamped = Math.max(0.25, Math.min(4.0, parseFloat(z)));
      DesignZoomEngine.setFree(clamped, anchorX, anchorY);
      _notify(clamped);
    },
    zoomIn(ax, ay)  { DesignZoomEngine.zoomIn(ax, ay);  _notify(RF.Geometry.zoom()); },
    zoomOut(ax, ay) { DesignZoomEngine.zoomOut(ax, ay); _notify(RF.Geometry.zoom()); },
    reset()         { this.set(1.0); },
    get zoom() { return RF.Geometry.zoom(); },
    fitWidth() {
      const ws  = document.getElementById('workspace');
      const lay = typeof computeLayout === 'function' ? computeLayout() : { rulerWidth: 22 };
      if (!ws) return;
      const avail = ws.clientWidth - lay.rulerWidth - 32;
      this.setFree(avail / CFG.PAGE_W);
    },
    fitPage() {
      const ws  = document.getElementById('workspace');
      const lay = typeof computeLayout === 'function' ? computeLayout() : { rulerWidth: 22, rulerHeight: 16 };
      if (!ws || typeof DS === 'undefined') return;
      const availW = ws.clientWidth  - lay.rulerWidth  - 32;
      const availH = ws.clientHeight - lay.rulerHeight - 32;
      const totalH = DS.getTotalHeight();
      this.setFree(Math.min(availW / CFG.PAGE_W, availH / Math.max(totalH, 100)));
    },
    onChange(fn) { _listeners.push(fn); },
  };
})();

if (typeof module !== 'undefined') {
  module.exports = ZoomEngine;
}
