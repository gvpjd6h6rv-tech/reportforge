'use strict';

function _contracts() {
  return (typeof ContractGuards !== 'undefined' && ContractGuards)
    || (window.RF?.RuntimeServices?.getContractGuards?.() || null)
    || null;
}

function assertSelectionState(source) {
  const guards = _contracts();
  if (guards && typeof DS !== 'undefined') guards.assertSelectionState(DS.selection, source);
}

function assertLayoutContract(el, source) {
  const guards = _contracts();
  if (guards && el) guards.assertLayoutContract(el, source);
}

function assertRectShape(rect, source) {
  const guards = _contracts();
  if (guards && rect) guards.assertRectShape(rect, source);
}

function assertZoomContract(source) {
  const guards = _contracts();
  if (guards && typeof DS !== 'undefined') guards.assertZoomContract(DS.zoom, source);
}

function _multiDebug() {
  return window.RF?.MultiSelectDebug || null;
}

function _selectedElementsFromIds(ids) {
  return (ids || []).map((id) => DS.getElementById(id)).filter(Boolean);
}

function _bindMultiSelectionBoxEvents(box) {
  if (!box || box.__rfMultiBound === true) return;
  box.__rfMultiBound = true;
  box.addEventListener('click', event => {
    const debug = _multiDebug();
    if(debug && debug.isEnabled()) debug.tracePointer(event, { resolvedLogicalElementId: box.dataset.selId || null, resolvedVisualBoxId: box.dataset.selId || null });
  });
  box.addEventListener('dblclick', event => {
    const debug = _multiDebug();
    if(debug && debug.isEnabled()) debug.tracePointer(event, { resolvedLogicalElementId: box.dataset.selId || null, resolvedVisualBoxId: box.dataset.selId || null });
    event.stopPropagation();
    const targetId = box.dataset.selId || null;
    const targetEl = targetId ? DS.getElementById(targetId) : null;
    const targetDiv = targetId ? document.querySelector(`.cr-element[data-id="${targetId}"]`) : null;
    if(targetEl && targetEl.type === 'text' && targetDiv){
      event.preventDefault();
      SelectionEngine.startTextEdit(targetDiv, targetEl);
    }
  });
}

function _applyMultiSelectionBoxState(box, el, rect, primaryId, debug, probes) {
  box.className='sel-box sel-box-multi-item';
  box.dataset.selId=el.id;
  if(el.id===primaryId) box.dataset.primary='true';
  else delete box.dataset.primary;
  if(debug) debug.assignBoxDomInstanceId(box);
  box.style.setProperty('--sel-x',rect.left+'px');
  box.style.setProperty('--sel-y',rect.top+'px');
  box.style.setProperty('--sel-w',rect.width+'px');
  box.style.setProperty('--sel-h',rect.height+'px');
  if(probes?.overlayPointerEventsOff) box.style.pointerEvents = 'none';
  else box.style.pointerEvents = '';
  if(probes?.compositionStress){
    box.style.outline = `1px solid ${el.id===primaryId ? '#ff0066' : '#00a3ff'}`;
    box.style.backgroundColor = 'rgba(255,255,0,0.02)';
    box.dataset.rfDebugLabel = el.id;
  } else {
    box.style.outline = '';
    box.style.backgroundColor = '';
    delete box.dataset.rfDebugLabel;
  }
}

function _multiOverlayMatchesSelection(layer, expectedIds) {
  if (!layer) return false;
  const boxes = [...layer.querySelectorAll('.sel-box')];
  if (boxes.length !== expectedIds.length) return false;
  const boxIds = boxes.map((node) => node.dataset.selId || null);
  if (boxIds.some((id) => !id)) return false;
  const expected = new Set(expectedIds);
  return boxIds.every((id) => expected.has(id))
    && expectedIds.every((id) => boxIds.includes(id));
}

function _renderMultiSelectionBoxes(layer, selectedElements, primaryId, debug, probes, allowReuse = true, allowStaleRetention = false) {
  const reusable = allowReuse
    ? new Map([...layer.querySelectorAll('.sel-box[data-sel-id]')].map((node) => [node.dataset.selId, node]))
    : new Map();
  [...layer.querySelectorAll('.sel-box:not([data-sel-id])')].forEach((node) => node.remove());
  [...layer.querySelectorAll('.sel-handle')].forEach((node) => node.remove());
  if (!allowReuse) {
    [...layer.querySelectorAll('.sel-box[data-sel-id]')].forEach((node) => node.remove());
  }
  const seen = new Set();
  selectedElements.forEach((el) => {
    assertLayoutContract(el, 'SelectionEngine.renderHandles.multi');
    const rect=SelectionEngine._selectionRect(el);
    assertRectShape(rect, 'SelectionEngine.renderHandles.multi.rect');
    const box = reusable.get(el.id) || document.createElement('div');
    _bindMultiSelectionBoxEvents(box);
    _applyMultiSelectionBoxState(box, el, rect, primaryId, debug, probes);
    if(box.parentNode!==layer) layer.appendChild(box);
    seen.add(el.id);
  });
  if (!allowStaleRetention) {
    reusable.forEach((node, id) => {
      if(!seen.has(id)) node.remove();
    });
  }
}

function _resolveRenderSelectionIds(selectionEngine, selectedIds) {
  const drag = selectionEngine && selectionEngine._drag ? selectionEngine._drag : null;
  if (drag && drag.type === 'move' && Array.isArray(drag.subjectIds) && drag.subjectIds.length > 1) {
    return [...drag.subjectIds];
  }
  return [...(selectedIds || [])];
}

const AlignEngine = {
  alignLeft()   { if(typeof CommandEngine!=='undefined') CommandEngine.alignLefts?.();   else this._fallback('left');   DS.saveHistory(); },
  alignRight()  { if(typeof CommandEngine!=='undefined') CommandEngine.alignRights?.();  else this._fallback('right');  DS.saveHistory(); },
  alignTop()    { if(typeof CommandEngine!=='undefined') CommandEngine.alignTops?.();    else this._fallback('top');    DS.saveHistory(); },
  alignBottom() { if(typeof CommandEngine!=='undefined') CommandEngine.alignBottoms?.(); else this._fallback('bottom'); DS.saveHistory(); },
  alignCenter() { if(typeof CommandEngine!=='undefined') CommandEngine.alignCenters?.(); DS.saveHistory(); },
  _fallback(dir){
    const ids=[...DS.selection]; if(ids.length<2) return;
    const els=ids.map(id=>DS.getElementById(id)).filter(Boolean);
    if(dir==='left'){ const minX=Math.min(...els.map(e=>e.x)); els.forEach(e=>DS.updateElementLayout(e.id,{x:minX})); }
    if(dir==='right'){ const maxR=Math.max(...els.map(e=>e.x+e.w)); els.forEach(e=>DS.updateElementLayout(e.id,{x:maxR-e.w})); }
    if(dir==='top'){ const minY=Math.min(...els.map(e=>e.y)); els.forEach(e=>DS.updateElementLayout(e.id,{y:minY})); }
    if(dir==='bottom'){ const maxB=Math.max(...els.map(e=>e.y+e.h)); els.forEach(e=>DS.updateElementLayout(e.id,{y:maxB-e.h})); }
    _canonicalCanvasWriter().renderAll();
  },
};

const AlignmentGuides = {
  _guides: [],
  _showRaf: null,
  clear(){
    if(this._showRaf){
      cancelAnimationFrame(this._showRaf);
      this._showRaf = null;
    }
    this._guides.forEach(g=>g.remove());
    this._guides=[];
  },
  _overlay(){
    return document.getElementById('guide-layer');
  },
  _canvasRect(){
    const canvas = document.getElementById('canvas-layer');
    return canvas ? canvas.getBoundingClientRect() : null;
  },
  _selectionRect(elId){
    const selBox = document.querySelector('#handles-layer .sel-box');
    if(!selBox) return null;
    const rect = selBox.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    };
  },
  _addLine(kind, styleText){
    const overlay = this._overlay();
    if(!overlay) return;
    const g=document.createElement('div');
    g.className=`rf-guide rf-guide-${kind} crystal-edge-guide`;
    g.style.cssText=styleText;
    overlay.appendChild(g);
    this._guides.push(g);
  },
  _renderFromSelBox(elId){
    this.clear();
    const overlay = this._overlay();
    const canvasRect = this._canvasRect();
    const rect = this._selectionRect(elId);
    if(!overlay || !canvasRect || !rect) return;
    const fullW = Math.ceil(canvasRect.width);
    const fullH = Math.ceil(canvasRect.height);
    const color = 'rgba(255, 0, 0, 0.72)';
    const base = `position:absolute;background:${color};pointer-events:none;z-index:65;`;
    this._addLine('h top', `${base}left:${Math.round(canvasRect.left)}px;top:${Math.round(rect.top)}px;width:${fullW}px;height:1px;`);
    this._addLine('h bottom', `${base}left:${Math.round(canvasRect.left)}px;top:${Math.round(rect.bottom)}px;width:${fullW}px;height:1px;`);
    this._addLine('v left', `${base}left:${Math.round(rect.left)}px;top:${Math.round(canvasRect.top)}px;width:1px;height:${fullH}px;`);
    this._addLine('v right', `${base}left:${Math.round(rect.right)}px;top:${Math.round(canvasRect.top)}px;width:1px;height:${fullH}px;`);
  },
  show(elId){
    if(this._showRaf){
      cancelAnimationFrame(this._showRaf);
      this._showRaf = null;
    }
    this._showRaf = requestAnimationFrame(()=>{
      this._showRaf = null;
      this._renderFromSelBox(elId);
    });
  },
};

const SelectionEngine = {
  _drag: null,
  _activeElementId: null,
  _focusedElementId: null,
  _dragAnchorId: null,
  _captureOwner: null,
  _overlaySettleToken: 0,
  _overlayStabilityObserver: null,
  _overlayRootObserver: null,
  _activeHandlesLayer(){
    const candidates = [...document.querySelectorAll('#handles-layer')];
    if (!candidates.length) return null;
    const scored = candidates.map((layer) => {
      const style = getComputedStyle(layer);
      const rect = layer.getBoundingClientRect();
      const z = Number.parseFloat(style.zIndex);
      const visible = style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity || '1') !== 0
        && rect.width > 0
        && rect.height > 0;
      return {
        layer,
        score: (visible ? 1 : 0) * 1e12 + (Number.isFinite(z) ? z : 0) * 1e6 + Math.max(0, rect.width * rect.height),
      };
    });
    scored.sort((left, right) => right.score - left.score);
    return scored[0]?.layer || null;
  },
  _overlayObservationRoot(){
    return document.getElementById('canvas-layer')
      || document.getElementById('viewport')
      || document.getElementById('workspace')
      || document.body
      || null;
  },
  _traceOverlayGuard(kind, payload = {}){
    const debug = _multiDebug();
    if(debug && debug.isEnabled()){
      debug.record(kind, {
        source: 'SelectionEngine',
        ...payload,
      });
    }
  },
  _primarySelectionId(){
    const selected = [...DS.selection];
    return selected.length ? selected[selected.length - 1] : null;
  },
  _clearMultiOverlayObserver(){
    if(this._overlayStabilityObserver){
      this._traceOverlayGuard('overlay-stability-observer-disconnect', {
        layerNodeId: this._overlayStabilityObserver.__rfLayerNodeId || null,
      });
      this._overlayStabilityObserver.disconnect();
      this._overlayStabilityObserver = null;
    }
    if(this._overlayRootObserver){
      this._traceOverlayGuard('overlay-root-observer-disconnect', {
        rootNodeId: this._overlayRootObserver.__rfRootNodeId || null,
      });
      this._overlayRootObserver.disconnect();
      this._overlayRootObserver = null;
    }
  },
  _ensureMultiOverlayObserver(expectedIds, token, verify){
    const layer = this._activeHandlesLayer();
    if (!layer || typeof MutationObserver === 'undefined') return;
    const debug = _multiDebug();
    const layerNodeId = debug?.assignNodeDebugId ? debug.assignNodeDebugId(layer, 'rf-layer') : null;
    if (this._overlayStabilityObserver && this._overlayStabilityObserver.__rfTarget === layer) return;
    if (this._overlayStabilityObserver) {
      this._traceOverlayGuard('overlay-stability-observer-rebind', {
        fromLayerNodeId: this._overlayStabilityObserver.__rfLayerNodeId || null,
        toLayerNodeId: layerNodeId,
        expectedIds,
      });
      this._overlayStabilityObserver.disconnect();
      this._overlayStabilityObserver = null;
    }
    const observer = new MutationObserver(() => {
      verify('mutation-observer');
    });
    observer.__rfTarget = layer;
    observer.__rfLayerNodeId = layerNodeId;
    observer.observe(layer, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'data-sel-id', 'data-primary', 'style'],
    });
    this._overlayStabilityObserver = observer;
    this._traceOverlayGuard('overlay-stability-observer-install', {
      token,
      layerNodeId,
      expectedIds,
    });
  },
  _ensureOverlayRootObserver(expectedIds, token, verify){
    const root = this._overlayObservationRoot();
    if (!root || typeof MutationObserver === 'undefined') return;
    const debug = _multiDebug();
    const rootNodeId = debug?.assignNodeDebugId ? debug.assignNodeDebugId(root, 'rf-root') : null;
    if (this._overlayRootObserver && this._overlayRootObserver.__rfTarget === root) return;
    if (this._overlayRootObserver) {
      this._overlayRootObserver.disconnect();
      this._overlayRootObserver = null;
    }
    const observer = new MutationObserver((mutations) => {
      const touchesHandlesLayer = mutations.some((mutation) => {
        if (mutation.target?.id === 'handles-layer') return true;
        return [...mutation.addedNodes, ...mutation.removedNodes].some((node) =>
          node?.nodeType === 1
          && (
            node.id === 'handles-layer'
            || (typeof node.querySelector === 'function' && node.querySelector('#handles-layer'))
          )
        );
      });
      if (!touchesHandlesLayer) return;
      this._traceOverlayGuard('overlay-root-observer-mutation', {
        token,
        expectedIds,
        activeLayerNodeId: debug?.assignNodeDebugId ? debug.assignNodeDebugId(this._activeHandlesLayer(), 'rf-layer') : null,
      });
      this._ensureMultiOverlayObserver(expectedIds, token, verify);
      verify('root-observer');
    });
    observer.__rfTarget = root;
    observer.__rfRootNodeId = rootNodeId;
    observer.observe(root, { childList: true, subtree: true });
    this._overlayRootObserver = observer;
    this._traceOverlayGuard('overlay-root-observer-install', {
      token,
      rootNodeId,
      expectedIds,
    });
  },
  _scheduleMultiOverlaySettle(expectedIds){
    const token = ++this._overlaySettleToken;
    this._clearMultiOverlayObserver();
    if (!expectedIds || expectedIds.length < 2) return;
    const verify = (reason) => {
      if (token !== this._overlaySettleToken) return true;
      const liveSelection = [...DS.selection];
      if (liveSelection.length < 2) {
        this._clearMultiOverlayObserver();
        return true;
      }
      if (JSON.stringify(liveSelection) !== JSON.stringify(expectedIds)) {
        this._clearMultiOverlayObserver();
        return true;
      }
      const layer = this._activeHandlesLayer();
      if (!layer) {
        return false;
      }
      if (_multiOverlayMatchesSelection(layer, expectedIds)) return true;
      const debug = _multiDebug();
      if(debug && debug.isEnabled()){
        debug.assertInvariant('RF-MULTI-INV-007', false, {
          selectedIds: liveSelection,
          overlay: debug.overlaySnapshot(),
          reason,
        });
      }
      this._clearMultiOverlayObserver();
      this.renderHandles();
      return false;
    };
    this._ensureOverlayRootObserver(expectedIds, token, verify);
    this._ensureMultiOverlayObserver(expectedIds, token, verify);
    requestAnimationFrame(() => {
      this._ensureMultiOverlayObserver(expectedIds, token, verify);
      verify('raf-1');
      requestAnimationFrame(() => {
        if (token !== this._overlaySettleToken) return;
        this._ensureMultiOverlayObserver(expectedIds, token, verify);
        verify('raf-2');
      });
    });
  },
  _useCentralRouter(){
    return window.RF?.RuntimeServices?.isEngineCoreInteractionEnabled?.() !== false;
  },
  _previewRect(el){
    const pvEl=document.querySelector(`.pv-el[data-origin-id="${el.id}"]`);
    if(!pvEl) return null;
    const pR=pvEl.getBoundingClientRect();
    const cR=RF.Geometry.canvasRect();
    return {
      left: pR.left-cR.left,
      top: pR.top-cR.top,
      width: pR.width,
      height: pR.height,
    };
  },
  _selectionRect(el){
    if(DS.previewMode){
      const pvRect=this._previewRect(el);
      if(pvRect) return pvRect;
      const vr=RF.Geometry.rectToView(el);
      return { left: vr.left, top: vr.top, width: vr.width, height: vr.height };
    }
    const elDiv=document.querySelector(`.cr-element[data-id="${el.id}"]`);
    const gr=RF.Geometry.elementRect(elDiv);
    if(gr){
      const z = RF.Geometry.zoom();
      return { left: gr.left*z, top: gr.top*z, width: gr.width*z, height: gr.height*z };
    }
    const secTop=DS.getSectionTop(el.sectionId);
    return { left: el.x, top: secTop+el.y, width: el.w, height: el.h };
  },

  onElementPointerDown(e, id){
    if(e.button!==0)return;
    const el=DS.getElementById(id);if(!el)return;
    const targetClosest = (selector) => (
      e.target && typeof e.target.closest === 'function'
        ? e.target.closest(selector)
        : null
    );
    const previewDiv = DS.previewMode
      ? document.querySelector(`#preview-content .pv-el[data-origin-id="${id}"], #preview-content .pv-el[data-id="${id}"]`)
      : null;
    const designDiv = document.querySelector(`#canvas-layer .cr-element[data-id="${id}"]:not(.pv-el), .cr-section .cr-element[data-id="${id}"]:not(.pv-el)`);
    const div = targetClosest(`.cr-element[data-id="${id}"]`) || targetClosest(`.pv-el[data-origin-id="${id}"]`) || previewDiv || designDiv;
    if(!div)return;
    this._activeElementId = id;
    this._focusedElementId = id;
    if(div.setPointerCapture){
      const pointerId = typeof e.pointerId === 'number'
        ? e.pointerId
        : (e.originalEvent ? e.originalEvent.pointerId : null);
      if (typeof pointerId === 'number') {
        div.setPointerCapture(pointerId);
        this._captureOwner = id;
      }
    }
    if(e.detail===2 && el.type==='text'){
      this.startTextEdit(div,el);return;
    }
    const shiftKey = e.modifiers ? !!e.modifiers.shiftKey : !!e.shiftKey;
    if(!shiftKey && !DS.isSelected(id)){
      DS.clearSelectionState();
    }
    if(shiftKey && DS.isSelected(id)){
      DS.removeSelection(id);
    } else {
      DS.addSelection(id);
    }
    const selectedNow = DS.getSelectedElements();
    if(selectedNow.length===0){
      this._drag = null;
      this.renderHandles();
      if(typeof AlignmentGuides!=='undefined') AlignmentGuides.clear();
      PropertiesEngine.render();
      FormatEngine.updateToolbar();
      return;
    }
    this.renderHandles();
    if(typeof AlignmentGuides!=='undefined' && DS.selection.size===1){
      AlignmentGuides.show([...DS.selection][0]);
    } else if(typeof AlignmentGuides!=='undefined'){
      AlignmentGuides.clear();
    }
    PropertiesEngine.render();
    FormatEngine.updateToolbar();
    const canvasPos = getCanvasPos(e);
    this._drag = {
      type:'move',
      startX: canvasPos.x,
      startY: canvasPos.y,
      pointerId: typeof e.pointerId === 'number' ? e.pointerId : null,
      startPositions: selectedNow.map(el=>({id:el.id,x:el.x,y:el.y,sectionId:el.sectionId,sectionTop:DS.getSectionTop(el.sectionId)})),
      livePositions: Object.create(null),
      subjectIds: selectedNow.map(el => el.id),
      anchorId: id,
      moved: false,
    };
    this._dragAnchorId = id;
    const debug = _multiDebug();
    if(debug && debug.isEnabled()){
      debug.beginGesture({
        pointerId: this._drag.pointerId,
        origin: 'SelectionEngine.onElementPointerDown',
        dragType: 'move',
        selectedIds: [...DS.selection],
        activeElementId: this._activeElementId,
        focusedElementId: this._focusedElementId,
        dragSubjectIds: [...this._drag.subjectIds],
        dragAnchorId: this._drag.anchorId,
      });
    }
  },

  onHandlePointerDown(e, pos){
    if(e.button!==0)return;
    const pos2=getCanvasPos(e);
    const sel=DS.getSelectedElements();
    if(sel.length===0)return;
    const el=sel[0];
    this._drag={
      type:'resize',
      handlePos:pos,
      elId:el.id,
      startX:pos2.x,startY:pos2.y,
      origX:el.x,origY:el.y,origW:el.w,origH:el.h,
      subjectIds: [el.id],
      anchorId: el.id,
    };
    this._dragAnchorId = el.id;
    const debug = _multiDebug();
    if(debug && debug.isEnabled()){
      debug.beginGesture({
        pointerId: typeof e.pointerId === 'number' ? e.pointerId : null,
        origin: 'SelectionEngine.onHandlePointerDown',
        dragType: 'resize',
        selectedIds: [...DS.selection],
        activeElementId: this._activeElementId,
        focusedElementId: this._focusedElementId,
        dragSubjectIds: [el.id],
        dragAnchorId: el.id,
      });
    }
  },

  attachElementEvents(div, id){
    if(!this._useCentralRouter()){
      div.addEventListener('pointerdown', e=>{
        e.stopPropagation();e.preventDefault();
        this.onElementPointerDown(e, id);
      });
    }
    div.addEventListener('dblclick', e=>{
      const debug = _multiDebug();
      if(debug && debug.isEnabled()) debug.tracePointer(e, { resolvedLogicalElementId: id, resolvedVisualBoxId: null });
      e.stopPropagation();
      const el = DS.getElementById(id);
      if(el && el.type==='text'){
        e.preventDefault();
        this.startTextEdit(div, el);
      }
    });
    div.addEventListener('contextmenu', e=>{
      e.preventDefault();e.stopPropagation();
      if(!DS.isSelected(id)){ DS.selectOnly(id);this.renderHandles(); }
      ContextMenuEngine.show(e.clientX,e.clientY,'element');
    });
    div.addEventListener('click', e=>{
      const debug = _multiDebug();
      if(debug && debug.isEnabled()) debug.tracePointer(e, { resolvedLogicalElementId: id, resolvedVisualBoxId: null });
    });
    div.addEventListener('gotpointercapture', e=>{
      this._captureOwner = id;
      const debug = _multiDebug();
      if(debug && debug.isEnabled()) debug.tracePointer(e, { resolvedLogicalElementId: id, captureOwner: this._captureOwner });
    });
    div.addEventListener('lostpointercapture', e=>{
      if(this._captureOwner === id) this._captureOwner = null;
      const debug = _multiDebug();
      if(debug && debug.isEnabled()) debug.tracePointer(e, { resolvedLogicalElementId: id, captureOwner: this._captureOwner });
    });
  },

  startTextEdit(div, el){
    DS.selectOnly(el.id);
    div.classList.add('editing','selected');
    const span=div.querySelector('.el-content');
    if(!span)return;
    span.contentEditable='true';
    span.style.pointerEvents='all';
    span.focus();
    const range=document.createRange();
    range.selectNodeContents(span);
    const sel=window.getSelection();sel.removeAllRanges();sel.addRange(range);
    const commit=()=>{
      span.contentEditable='false';
      span.style.pointerEvents='none';
      div.classList.remove('editing');
      DS.saveHistory();
      const idx=DS.elements.findIndex(e=>e.id===el.id);
      if(idx>=0){ DS.elements[idx].content=span.textContent; }
    };
    span.addEventListener('blur',commit,{once:true});
    span.addEventListener('keydown',ke=>{if(ke.key==='Escape'||ke.key==='Enter')span.blur();});
  },

  startRubberBand(e){
    const pos=getCanvasPos(e);
    this._drag={
      type:'rubber',
      startX:pos.x,startY:pos.y,
      curX:pos.x,curY:pos.y,
    };
    const rb=document.getElementById('rubber-band');
    rb.style.display='block';rb.style.left=pos.x+'px';rb.style.top=pos.y+'px';
    rb.style.width='0';rb.style.height='0';
  },

  attachHandleEvent(handleDiv, pos){
    if(!this._useCentralRouter()){
      handleDiv.addEventListener('pointerdown', e=>{
        e.stopPropagation();e.preventDefault();
        this.onHandlePointerDown(e, pos);
      });
    }
  },

  renderHandles(){
    assertSelectionState('SelectionEngine.renderHandles.selection');
    if (typeof RenderScheduler !== 'undefined' && !RenderScheduler.allowsDomWrite()) {
      RenderScheduler.handles(() => SelectionEngine.renderHandles(), 'SelectionEngine.renderHandles');
      return;
    }
    if (typeof RenderScheduler !== 'undefined') {
      RenderScheduler.assertDomWriteAllowed('SelectionEngine.renderHandles');
    }
    RF.Geometry.invalidate();
    const layer=this._activeHandlesLayer() || document.getElementById('handles-layer');
    const debug = _multiDebug();
    const probes = debug && debug.probes ? debug.probes() : null;
    const selectedIds = [...DS.selection];
    const renderSelectionIds = _resolveRenderSelectionIds(this, selectedIds);
    const selectedElements = _selectedElementsFromIds(renderSelectionIds);
    const branch = renderSelectionIds.length === 0 ? 'none' : renderSelectionIds.length === 1 ? 'single' : 'multi';
    if (debug && debug.isEnabled()) {
      debug.record('render-handles-branch', {
        caller: 'SelectionEngine.renderHandles',
        branch,
        selectedIds,
        renderSelectionIds,
        selectedElementsLength: selectedElements.length,
        dragType: this._drag?.type || null,
        dragSubjectIds: this._drag?.subjectIds ? [...this._drag.subjectIds] : [],
      });
    }
    if (layer) {
      if (probes?.forceOverlayTopmost) {
        layer.style.zIndex = '2147483000';
      } else {
        layer.style.zIndex = '';
      }
      layer.dataset.rfDebugComposition = probes?.compositionStress ? 'true' : 'false';
    }
    document.querySelectorAll('.cr-element').forEach(d=>{
      d.classList.toggle('selected',DS.isSelected(d.dataset.id));
    });
    if(renderSelectionIds.length===0){
      this._overlaySettleToken += 1;
      this._clearMultiOverlayObserver();
      while(layer.firstChild)layer.removeChild(layer.firstChild);
      return;
    }
    if(renderSelectionIds.length===1){
      this._overlaySettleToken += 1;
      this._clearMultiOverlayObserver();
      while(layer.firstChild)layer.removeChild(layer.firstChild);
      const id=renderSelectionIds[0];
      const el=DS.getElementById(id);if(!el)return;
      assertLayoutContract(el, 'SelectionEngine.renderHandles.layout');
      const rect=this._selectionRect(el);
      assertRectShape(rect, 'SelectionEngine.renderHandles.rect');
      assertZoomContract('SelectionEngine.renderHandles.zoom');
      const absX=rect.left, absY=rect.top, absW=rect.width, absH=rect.height;
      const positions=[
        {pos:'nw',cx:absX,          cy:absY},
        {pos:'n', cx:absX+absW/2,   cy:absY},
        {pos:'ne',cx:absX+absW,     cy:absY},
        {pos:'w', cx:absX,          cy:absY+absH/2},
        {pos:'e', cx:absX+absW,     cy:absY+absH/2},
        {pos:'sw',cx:absX,          cy:absY+absH},
        {pos:'s', cx:absX+absW/2,   cy:absY+absH},
        {pos:'se',cx:absX+absW,     cy:absY+absH},
      ];
      const selBox=document.createElement('div');
      selBox.className='sel-box';
      selBox.style.setProperty('--sel-x',absX+'px');
      selBox.style.setProperty('--sel-y',absY+'px');
      selBox.style.setProperty('--sel-w',absW+'px');
      selBox.style.setProperty('--sel-h',absH+'px');
      layer.appendChild(selBox);
      positions.forEach(({pos,cx,cy})=>{
        const h=document.createElement('div');
        h.className='sel-handle';h.dataset.pos=pos;
        h.style.left=cx+'px';h.style.top=cy+'px';
        this.attachHandleEvent(h,pos);
        layer.appendChild(h);
      });
    } else {
      const primaryId = renderSelectionIds[renderSelectionIds.length - 1] || this._primarySelectionId();
      const allowStaleRetention = !!(probes?.overlayFrozenStructure && this._drag && this._drag.type === 'move');
      _renderMultiSelectionBoxes(layer, selectedElements, primaryId, debug, probes, true, allowStaleRetention);
      if (!_multiOverlayMatchesSelection(layer, renderSelectionIds)) {
        _renderMultiSelectionBoxes(layer, selectedElements, primaryId, debug, probes, false, false);
        if(debug && debug.isEnabled()){
          debug.assertInvariant('RF-MULTI-INV-006', _multiOverlayMatchesSelection(layer, renderSelectionIds), {
            selectedIds,
            renderSelectionIds,
            selectedElementIds: selectedElements.map((el) => el.id),
            overlay: debug.overlaySnapshot(),
          });
        }
      }
      this._scheduleMultiOverlaySettle(renderSelectionIds);
    }
    this.updateSelectionInfo();
  },

  clearSelection(){
    DS.clearSelectionState();
    this.renderHandles();
    PropertiesEngine.render();
    FormatEngine.updateToolbar();
    this.updateSelectionInfo();
  },

  updateSelectionInfo(){
    const info=document.getElementById('selection-info');
    if(DS.selection.size>1){
      info.style.display='block';
      info.textContent=`${DS.selection.size} objetos seleccionados`;
    } else {
      info.style.display='none';
    }
    SectionEngine.updateSectionsList();
    if(DS.selection.size===1){
      const el=DS.getElementById([...DS.selection][0]);
      if(el){
        document.getElementById('sb-size').style.display='flex';
        document.getElementById('sb-size').textContent=`W: ${el.w}  H: ${el.h}`;
      }
    } else {
      document.getElementById('sb-size').style.display='none';
    }
  },

  onMouseMove(e){
    const pos=getCanvasPos(e);
    document.getElementById('sb-pos').textContent=`X: ${Math.round(pos.x)}   Y: ${Math.round(pos.y)}`;
    RulerEngine.updateCursor(pos.x, pos.y);
    if(!this._drag) return;
    const {type}=this._drag;
    if(type==='move') this._doMove(pos,e);
    else if(type==='resize') this._doResize(pos,e);
    else if(type==='rubber') this._doRubberBand(pos);
    else if(type==='insert') InsertEngine.onMouseMove(pos);
  },

  _doMove(pos,e){
    const d=this._drag;
    d.moved=true;
    const debug = _multiDebug();
    if(debug && debug.isEnabled() && d.subjectIds){
      debug.assertInvariant('RF-MULTI-INV-002', JSON.stringify(d.subjectIds) === JSON.stringify(d.startPositions.map(p => p.id)), {
        dragSubjectIds: d.subjectIds,
        startPositionIds: d.startPositions.map(p => p.id),
      });
    }
    const rawDx=pos.x-d.startX, rawDy=pos.y-d.startY;
    const minX=Math.min(...d.startPositions.map(orig=>orig.x));
    const maxRight=Math.max(...d.startPositions.map(orig=>{
      const el=DS.getElementById(orig.id);
      return el ? orig.x + el.w : orig.x;
    }));
    const minAbsY=Math.min(...d.startPositions.map(orig=>orig.sectionTop + orig.y));
    const dx=Math.max(-minX, Math.min(CFG.PAGE_W - maxRight, rawDx));
    const dy=Math.max(-minAbsY, rawDy);
    d.startPositions.forEach(orig=>{
      const el=DS.getElementById(orig.id);if(!el)return;
      const newAbsY=Math.max(0, orig.sectionTop+orig.y+dy);
      const newLocalY=newAbsY-orig.sectionTop;
      const newX=Math.max(0,Math.min(CFG.PAGE_W-el.w,orig.x+dx));
      d.livePositions[el.id]={
        id: el.id,
        x: newX,
        absY: newAbsY,
        localY: newLocalY,
        sectionId: orig.sectionId,
        sectionTop: orig.sectionTop,
      };
      const div=document.querySelector(`.cr-element[data-id="${orig.id}"]`);
      if(div){
        div.classList.add('dragging');
        const _mp = RF.Geometry.modelToView(newX, newLocalY);
        div.style.left=_mp.x+'px';
        div.style.top =_mp.y+'px';
      }
      if(DS.previewMode){
        document.querySelectorAll(`.pv-el[data-origin-id="${orig.id}"]`).forEach(pv=>{
          pv.classList.add('dragging');
          const z = RF.Geometry.zoom();
          pv.style.left = (newX * z)+'px';
          pv.style.top  = (newAbsY * z)+'px';
        });
      }
    });
    if(!d._rafPending){
      d._rafPending=true;
      requestAnimationFrame(()=>{
        d._rafPending=false;
        this.renderHandles();
        if(typeof AlignmentGuides!=='undefined' && DS.selection.size===1){
          AlignmentGuides.show([...DS.selection][0]);
        }
        if(DS.selection.size===1){
          const selectedId = [...DS.selection][0];
          const live = d.livePositions ? d.livePositions[selectedId] : null;
          if(live) document.getElementById('sb-pos').textContent=`X: ${Math.round(live.x)}   Y: ${Math.round(live.absY)}`;
        }
        if(debug && debug.isEnabled()){
          debug.traceFrame({
            clientX: e?.clientX ?? null,
            clientY: e?.clientY ?? null,
            resolvedLogicalElementId: this._activeElementId,
            resolvedVisualBoxId: this._dragAnchorId,
            dragSubjectIds: d.subjectIds ? [...d.subjectIds] : [],
            dragAnchorId: d.anchorId || null,
            currentDelta: { dx, dy },
          });
          const overlay = debug.overlaySnapshot();
          const selectedIds = [...DS.selection];
          const liveIds = overlay.boxIds.filter(Boolean);
          debug.assertInvariant('RF-MULTI-INV-001', JSON.stringify(selectedIds) === JSON.stringify(d.subjectIds || []), { selectedIds, dragSubjectIds: d.subjectIds || [] });
          debug.assertInvariant('RF-MULTI-INV-003', overlay.boxCount === selectedIds.length, { overlay, selectedIds });
          debug.assertInvariant('RF-MULTI-INV-004', selectedIds.every((id) => liveIds.includes(id)), { overlay, selectedIds });
          if(d._boxDomIds == null){
            d._boxDomIds = Object.fromEntries(overlay.boxes.filter((b) => b.elementId).map((b) => [b.elementId, b.domInstanceId]));
          } else {
            debug.assertInvariant('RF-MULTI-INV-005', overlay.boxes.filter((b) => b.elementId).every((b) => d._boxDomIds[b.elementId] === b.domInstanceId), {
              expectedDomIds: d._boxDomIds,
              overlay,
            });
          }
        }
      });
    }
  },

  _doResize(pos,e){
    const d=this._drag;
    const el=DS.getElementById(d.elId);if(!el)return;
    const dx=pos.x-d.startX, dy=pos.y-d.startY;
    let {origX:x,origY:y,origW:w,origH:h}=d;
    const p=d.handlePos;
    if(p.includes('e')) w=Math.max(CFG.MIN_EL_W, w+dx);
    if(p.includes('s')) h=Math.max(CFG.MIN_EL_H, h+dy);
    if(p.includes('w')){const nw=Math.max(CFG.MIN_EL_W,w-dx);x=x+w-nw;w=nw;}
    if(p.includes('n')){const nh=Math.max(CFG.MIN_EL_H,h-dy);y=y+h-nh;h=nh;}
    DS.updateElementLayout(el.id,{ x, y, w, h });
    _canonicalCanvasWriter().updateElementPosition(d.elId);
    if(DS.previewMode){
      document.querySelectorAll(`.pv-el[data-origin-id="${d.elId}"]`).forEach(pv=>{
        const _pp = RF.Geometry.rectToView(el);
        pv.style.left = _pp.left+'px';
        pv.style.top = _pp.top+'px';
        pv.style.width = _pp.width+'px';
        pv.style.height = _pp.height+'px';
      });
    }
    if(!d._resizeRafPending){
      d._resizeRafPending=true;
      requestAnimationFrame(()=>{
        d._resizeRafPending=false;
        this.renderHandles();
        if(typeof AlignmentGuides!=='undefined'){
          AlignmentGuides.show(d.elId);
        }
      });
    }
    document.getElementById('sb-size').textContent=`W: ${w}  H: ${h}`;
    document.getElementById('sb-size').style.display='flex';
    PropertiesEngine.updatePositionFields(el);
  },

  _doRubberBand(pos){
    const d=this._drag;
    const rb=document.getElementById('rubber-band');
    const x=Math.min(d.startX,pos.x),y=Math.min(d.startY,pos.y);
    const w=Math.abs(pos.x-d.startX),h=Math.abs(pos.y-d.startY);
    rb.style.left=x+'px';rb.style.top=y+'px';rb.style.width=w+'px';rb.style.height=h+'px';
    DS.clearSelectionState();
    DS.elements.forEach(el=>{
      const st=DS.getSectionTop(el.sectionId);
      const ex=el.x,ey=st+el.y,ew=el.w,eh=el.h;
      if(ex<x+w && ex+ew>x && ey<y+h && ey+eh>y) DS.addSelection(el.id);
    });
    this.renderHandles();
  },

  onMouseUp(e){
    if(!this._drag)return;
    const d=this._drag;
    const isCancel = e && e.phase === 'cancel';
    if(!isCancel && d.type==='move' && d.moved){
      const anchor = d.startPositions[0];
      const anchorLive = anchor && d.livePositions ? d.livePositions[anchor.id] : null;
      const anchorAbsY = anchor ? (anchor.sectionTop + anchor.y) : 0;
      const snappedDeltaX = anchor && anchorLive ? (DS.snap(anchorLive.x) - anchor.x) : 0;
      const snappedDeltaAbsY = anchor && anchorLive ? (DS.snap(anchorLive.absY) - anchorAbsY) : 0;
      d.startPositions.forEach(orig=>{
        const el=DS.getElementById(orig.id);if(!el)return;
        const origAbsY = orig.sectionTop + orig.y;
        const rawX = orig.x + snappedDeltaX;
        const rawAbsY = origAbsY + snappedDeltaAbsY;
        const target=DS.getSectionAtY(rawAbsY+el.h/2);
        const nextX=Math.max(0,Math.min(CFG.PAGE_W-el.w,rawX));
        if(target){
          DS.updateElementLayout(el.id,{
            sectionId: target.section.id,
            y: Math.max(0,rawAbsY-DS.getSectionTop(target.section.id)),
          });
        } else {
          DS.updateElementLayout(el.id,{ y: Math.max(0,orig.y + snappedDeltaAbsY) });
        }
        DS.updateElementLayout(el.id,{ x: nextX });
        _canonicalCanvasWriter().updateElementPosition(el.id);
      });
      this.renderHandles();
    }
    if(!isCancel && d.type==='resize'){
      const el=DS.getElementById(d.elId);
      if(el){
        let x=el.x,y=el.y,w=el.w,h=el.h;
        w=Math.max(CFG.MIN_EL_W,DS.snap(w));
        h=Math.max(CFG.MIN_EL_H,DS.snap(h));
        x=DS.snap(x);
        y=DS.snap(y);
        DS.updateElementLayout(el.id,{ x, y, w, h });
        _canonicalCanvasWriter().updateElementPosition(el.id);
        this.renderHandles();
      }
    }
    document.querySelectorAll('.cr-element.dragging').forEach(div=>{
      div.classList.remove('dragging');
    });
    document.querySelectorAll('.pv-el.dragging').forEach(div=>{
      div.classList.remove('dragging');
    });
    if(typeof AlignmentGuides!=='undefined') AlignmentGuides.clear();
    if(!isCancel && d.type==='move' && d.moved) DS.saveHistory();
    if(!isCancel && d.type==='resize') DS.saveHistory();
    if(d.type==='rubber'){
      document.getElementById('rubber-band').style.display='none';
      if(!isCancel && DS.selection.size>0){
        PropertiesEngine.render();FormatEngine.updateToolbar();
      }
    }
    if(!isCancel && d.type==='insert') InsertEngine.onMouseUp(e);
    const debug = _multiDebug();
    if(debug && debug.isEnabled()) debug.endGesture(isCancel ? 'cancel' : 'pointerup');
    this._drag=null;
    this._dragAnchorId = null;
    this._captureOwner = null;
  },
};
SelectionEngine.__active = true;

if (typeof module !== 'undefined') {
  module.exports = SelectionEngine;
}
