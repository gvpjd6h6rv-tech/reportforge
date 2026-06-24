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

// SSOT: engines/RuntimeConfig.js zoom.steps — single place to change zoom granularity.
const ZOOM_STEPS=[...(typeof RF !== 'undefined' && RF.RuntimeConfig ? RF.RuntimeConfig.zoom.steps : [0.25,0.5,0.75,1.0,1.25,1.5,1.75,2.0,3.0,4.0])];
function _snapZoom(z){return ZOOM_STEPS.reduce((a,b)=>Math.abs(b-z)<Math.abs(a-z)?b:a,ZOOM_STEPS[0]);}

function _zoomDebugMeta() {
  if (!window.__RF_ZOOM_DEBUG_META) {
    window.__RF_ZOOM_DEBUG_META = { lastEvent: 'init', lastFunction: 'boot' };
  }
  return window.__RF_ZOOM_DEBUG_META;
}

function _refreshZoomDebugPanel() {
  if (typeof window.RF_REFRESH_ZOOM_DEBUG_PANEL === 'function') {
    window.RF_REFRESH_ZOOM_DEBUG_PANEL();
  }
}

function _uiSnapshot(focus = null) {
  if (typeof window.RF_UI_TRACE?.snapshot !== 'function') return null;
  return window.RF_UI_TRACE.snapshot({ focus });
}

function _uiTrace(event, detail = {}) {
  if (typeof window.RF_UI_TRACE !== 'function') return null;
  return window.RF_UI_TRACE(event, detail);
}

function _commitZoomDebug({ zoom, sliderValue, pctText, tbValue, assetVersion, commit, event, fn }) {
  const meta = _zoomDebugMeta();
  if (event) meta.lastEvent = event;
  if (fn) meta.lastFunction = fn;
  window.RF_DEBUG_ZOOM = {
    zoom,
    sliderValue,
    pctText,
    tbValue,
    assetVersion: assetVersion || '',
    commit: commit || '',
    lastEvent: meta.lastEvent,
    lastFunction: meta.lastFunction,
  };
  _refreshZoomDebugPanel();
  if (typeof window.RF_REFRESH_BUILD_DEBUG === 'function') {
    window.RF_REFRESH_BUILD_DEBUG();
  }
}

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
    cl.style.setProperty('--layout-canvas-top',  lay.marginTop  + CFG.RULER_H + 'px');
  }
  if (vp) {
  }
}

const DesignZoomEngine={
  _apply(z, anchorClientX, anchorClientY, meta = {}){
    const PAGE_W = CFG.PAGE_W;
    const ws = document.getElementById('workspace');
    const vp = document.getElementById('viewport');
    const cl = document.getElementById('canvas-layer');
    if (!vp || !cl) return;
    const oldZ = DS.zoom;
    const beforeUI = _uiSnapshot('#zw-slider');
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
    DS.setZoom(z, meta.fn || 'DesignZoomEngine._apply');
    const applyZoomChrome = () => {
      vp.style.transform       = `scale(${z})`;
      vp.style.transformOrigin = 'top left';
      vp.style.transformBox    = 'border-box';
      vp.style.display = 'block';
      vp.style.width   = PAGE_W + 'px';
      // RF-DESIGN-ZOOM400-SCROLLBAR-CR-PARITY-1: a margin/padding/sibling
      // reserved OUTSIDE vp's own pre-transform box gets swallowed by vp's
      // transform:scale(z) once z is large enough — the scrollable-overflow
      // a transformed descendant contributes to its overflow:auto ancestor
      // is computed from vp's scaled ink overflow alone, not from layout
      // siblings/margins placed beside it (proven live: neither
      // marginBottom nor #workspace padding-bottom nor a real sibling div
      // changed the visible gap at zoom>1, even though scrollHeight grew
      // numerically). Folding the gap INTO vp's own pre-transform height
      // instead means it scales WITH vp's transform like the canvas itself,
      // giving a real, zoom-proportional gap before the scrollbar.
      vp.style.height = (cl.offsetHeight + CFG.RULER_H) + 'px';
      cl.style.transform = 'none';
      cl.style.transformOrigin = '';
      cl.style.transformBox = '';
      cl.style.setProperty('--geo-zoom', z);
    };
    if (typeof RenderScheduler !== 'undefined') {
      RenderScheduler.flushSync(applyZoomChrome, 'DesignZoomEngine._apply');
    } else {
      applyZoomChrome();
    }
    ZoomWidget.sync({
      event: meta.event || 'programmatic',
      fn: meta.fn || 'DesignZoomEngine._apply',
    });
    const afterUI = _uiSnapshot('#zw-slider');
    _uiTrace('zoom', {
      phase: 'after',
      event: meta.event || 'programmatic',
      fn: meta.fn || 'DesignZoomEngine._apply',
      source: 'DesignZoomEngine._apply',
      before: beforeUI,
      after: afterUI,
      dsZoomBefore: oldZ,
      dsZoomAfter: DS.zoom,
      focus: '#zw-slider',
    });
    const pct = Math.round(z * 100) + '%';
    const sel = document.getElementById('tb-zoom');
    if (sel) { for (let o of sel.options) if (o.text === pct) { o.selected = true; break; } }
  },
  set(z, anchorClientX, anchorClientY, meta = {}){
    z = Math.max(0.01, Math.min(4.0, parseFloat(z)));
    this._apply(z, anchorClientX, anchorClientY, meta);
  },
  setFree(z, anchorClientX, anchorClientY, meta = {}){
    z = Math.max(0.01, Math.min(4.0, parseFloat(z)));
    this._apply(z, anchorClientX, anchorClientY, meta);
  },
  get(){ return DS.zoom; },
  zoomIn(ax,ay,meta = {}){ const i=ZOOM_STEPS.indexOf(_snapZoom(DS.zoom)); if(i<ZOOM_STEPS.length-1) this.set(ZOOM_STEPS[i+1],ax,ay,{ ...meta, event: meta.event || 'plus', fn: meta.fn || 'DesignZoomEngine.zoomIn' }); },
  zoomOut(ax,ay,meta = {}){ const i=ZOOM_STEPS.indexOf(_snapZoom(DS.zoom)); if(i>0) this.set(ZOOM_STEPS[i-1],ax,ay,{ ...meta, event: meta.event || 'minus', fn: meta.fn || 'DesignZoomEngine.zoomOut' }); },
  reset(meta = {}){ this.set(1.0, undefined, undefined, { ...meta, event: meta.event || 'reset', fn: meta.fn || 'DesignZoomEngine.reset' }); },
};

const PreviewZoomEngine={
  set(z, meta = {}){
    z=Math.max(0.01,Math.min(4.0,parseFloat(z)));
    const beforeUI = _uiSnapshot('#zw-slider');
    _uiTrace('zoom', {
      phase: 'before',
      event: meta.event || 'programmatic',
      fn: meta.fn || 'PreviewZoomEngine.set',
      source: 'PreviewZoomEngine.set',
      before: beforeUI,
      after: null,
      dsZoomBefore: DS.zoom,
      dsZoomAfter: DS.previewZoom || 1.0,
      focus: '#zw-slider',
    });
    DS.previewZoom=z;
    if(DS.previewMode) DesignZoomEngine._apply(z, undefined, undefined, { ...meta, fn: meta.fn || 'PreviewZoomEngine.set' });
    const pv=document.getElementById('preview-content');
    if(pv){ pv.style.zoom=''; pv.style.transform=''; }
    ZoomWidget.sync({
      event: meta.event || 'preview-zoom',
      fn: meta.fn || 'PreviewZoomEngine.set',
    });
    const afterUI = _uiSnapshot('#zw-slider');
    _uiTrace('zoom', {
      phase: 'after',
      event: meta.event || 'preview-zoom',
      fn: meta.fn || 'PreviewZoomEngine.set',
      source: 'PreviewZoomEngine.set',
      before: beforeUI,
      after: afterUI,
      dsZoomBefore: DS.zoom,
      dsZoomAfter: DS.previewZoom || 1.0,
      focus: '#zw-slider',
    });
  },
  get(){return DS.previewZoom||1.0;},
  zoomIn(meta = {}){const i=ZOOM_STEPS.findIndex(s=>Math.abs(s-(DS.previewZoom||1))<0.01);if(i<ZOOM_STEPS.length-1)this.set(ZOOM_STEPS[i+1], { ...meta, event: meta.event || 'plus', fn: meta.fn || 'PreviewZoomEngine.zoomIn' });},
  zoomOut(meta = {}){const i=ZOOM_STEPS.findIndex(s=>Math.abs(s-(DS.previewZoom||1))<0.01);if(i>0)this.set(ZOOM_STEPS[i-1], { ...meta, event: meta.event || 'minus', fn: meta.fn || 'PreviewZoomEngine.zoomOut' });},
  reset(meta = {}){this.set(1.0, { ...meta, event: meta.event || 'reset', fn: meta.fn || 'PreviewZoomEngine.reset' });},
};

const ZoomWidget={
  init(){
    document.getElementById('zw-in').addEventListener('click',()=>this._eng().zoomIn(undefined, undefined, { event: 'plus', fn: 'ZoomWidget.init#zw-in' }));
    document.getElementById('zw-out').addEventListener('click',()=>this._eng().zoomOut(undefined, undefined, { event: 'minus', fn: 'ZoomWidget.init#zw-out' }));
    document.getElementById('zw-pct').addEventListener('dblclick',()=>this._eng().reset({ event: 'reset', fn: 'ZoomWidget.init#zw-pct' }));
    const slider=document.getElementById('zw-slider');
    if(slider){
      slider.addEventListener('input',()=>{
        this._eng().set(parseFloat(slider.value)/100, { event: 'slider', fn: 'ZoomWidget.init#zw-slider' });
      });
    }
    this.sync();
  },
  _eng(){return DS.previewMode?PreviewZoomEngine:DesignZoomEngine;},
  _syncZoomSelect(sel, pct){
    if (!sel) return;
    const exact = [...sel.options].find((o) => o.value === pct || o.text === pct || o.textContent === pct);
    const dynamicAttr = 'data-rf-dynamic-zoom';
    const oldDynamic = sel.querySelector(`option[${dynamicAttr}="true"]`);
    if (exact) {
      if (oldDynamic) oldDynamic.remove();
      exact.selected = true;
      sel.value = exact.value;
      return;
    }
    let dynamic = oldDynamic;
    if (!dynamic) {
      dynamic = document.createElement('option');
      dynamic.setAttribute(dynamicAttr, 'true');
      sel.insertBefore(dynamic, sel.firstChild);
    }
    dynamic.value = pct;
    dynamic.textContent = pct;
    dynamic.selected = true;
    sel.value = pct;
  },
  sync(meta = {}){
    const z=DS.previewMode?(DS.previewZoom||1.0):DS.zoom;
    const pct=Math.round(z*100)+'%';
    const el=document.getElementById('zw-pct');const ml=document.getElementById('zw-mode');
    const zi=document.getElementById('zw-in');const zo=document.getElementById('zw-out');
    const sl=document.getElementById('zw-slider');
    const sel=document.getElementById('tb-zoom');
    if(el)el.textContent=pct;
    if(ml)ml.textContent=DS.previewMode?'PREVIEW':'DISEÑO';
    const sb=document.getElementById('sb-zoom');if(sb)sb.textContent=pct;
    if(zi)zi.disabled=(z>=4.0);if(zo)zo.disabled=(z<=0.25);
    if(sl){
      // step must stay '1' regardless of mode: per the range-input value
      // sanitization algorithm, the browser silently re-snaps an assigned
      // .value to the nearest multiple of `step` — continuous zoom sources
      // (Ctrl+wheel, slider drag) produce values that aren't aligned to a
      // coarser step, which desynced the displayed slider from DS.zoom.
      sl.step = '1';
      sl.value = Math.round(z*100);
    }
    this._syncZoomSelect(sel, pct);
    const sliderValue = sl ? sl.value : '';
    const pctText = el ? el.textContent : '';
    const tb = document.getElementById('tb-zoom');
    const build = window.RF_BUILD_INFO || {};
    const metaState = _zoomDebugMeta();
    const prior = window.RF_DEBUG_ZOOM || {};
    const event = meta.event || prior.lastEvent || metaState.lastEvent || 'programmatic';
    const fn = meta.fn || prior.lastFunction || metaState.lastFunction || 'ZoomWidget.sync';
    _commitZoomDebug({
      zoom: z,
      sliderValue,
      pctText,
      tbValue: tb?.value || '',
      assetVersion: build.assetVersion || '',
      commit: build.commit || '',
      event,
      fn,
    });
  },
};

const ZoomEngine={
  set(z){DesignZoomEngine.set(z);},
  get(){return DesignZoomEngine.get();},
  step(d, source = 'step'){d>0?DesignZoomEngine.zoomIn(undefined, undefined, { event: source, fn: 'ZoomEngine.step' }):DesignZoomEngine.zoomOut(undefined, undefined, { event: source, fn: 'ZoomEngine.step' });}
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
      DesignZoomEngine.set(snapped, anchorX, anchorY, { event: 'programmatic', fn: 'ZoomEngineV19.set' });
      _notify(snapped);
    },
    setFree(z, anchorX, anchorY) {
      const clamped = Math.max(0.25, Math.min(4.0, parseFloat(z)));
      DesignZoomEngine.setFree(clamped, anchorX, anchorY, { event: 'programmatic', fn: 'ZoomEngineV19.setFree' });
      _notify(clamped);
    },
    zoomIn(ax, ay)  { DesignZoomEngine.zoomIn(ax, ay, { event: 'plus', fn: 'ZoomEngineV19.zoomIn' });  _notify(RF.Geometry.zoom()); },
    zoomOut(ax, ay) { DesignZoomEngine.zoomOut(ax, ay, { event: 'minus', fn: 'ZoomEngineV19.zoomOut' }); _notify(RF.Geometry.zoom()); },
    reset()         { this.set(1.0); },
    get zoom() { return RF.Geometry.zoom(); },
    fitWidth() {
      const ws  = document.getElementById('workspace');
      const lay = typeof computeLayout === 'function' ? computeLayout() : { rulerWidth: CFG.RULER_W };
      if (!ws) return;
      const avail = ws.clientWidth - lay.rulerWidth - 32;
      this.setFree(avail / CFG.PAGE_W);
    },
    fitPage() {
      const ws  = document.getElementById('workspace');
      const lay = typeof computeLayout === 'function' ? computeLayout() : { rulerWidth: CFG.RULER_W, rulerHeight: CFG.RULER_H };
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
