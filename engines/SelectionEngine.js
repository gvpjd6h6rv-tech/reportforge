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
  _threshold: 3,
  clear(){
    this._guides.forEach(g=>g.remove());
    this._guides=[];
  },
  show(elId){
    this.clear();
    const overlay = document.getElementById('guide-layer');
    if(!overlay) return;
    const draggedDiv = document.querySelector('.cr-element[data-id="'+elId+'"]');
    if(!draggedDiv) return;

    const dRect = draggedDiv.getBoundingClientRect();
    const dL=dRect.left, dT=dRect.top, dR=dRect.right, dB=dRect.bottom;
    const vW = window.innerWidth, vH = window.innerHeight;

    document.querySelectorAll('.cr-element').forEach(div=>{
      if(div===draggedDiv) return;
      const r = div.getBoundingClientRect();
      const oL=r.left, oT=r.top, oR=r.right, oB=r.bottom;

      const addH=(y)=>{
        const g=document.createElement('div');
        g.className='rf-guide rf-guide-h snap-guide h';
        g.style.top=Math.round(y)+'px';
        g.style.left='0'; g.style.width=vW+'px';
        overlay.appendChild(g); this._guides.push(g);
      };
      const addV=(x)=>{
        const g=document.createElement('div');
        g.className='rf-guide rf-guide-v snap-guide v';
        g.style.left=Math.round(x)+'px';
        g.style.top='0'; g.style.height=vH+'px';
        overlay.appendChild(g); this._guides.push(g);
      };

      const T=this._threshold;
      if(Math.abs(dT-oT)<T)addH(oT); if(Math.abs(dT-oB)<T)addH(oB);
      if(Math.abs(dB-oT)<T)addH(oT); if(Math.abs(dB-oB)<T)addH(oB);
      if(Math.abs(dL-oL)<T)addV(oL); if(Math.abs(dL-oR)<T)addV(oR);
      if(Math.abs(dR-oL)<T)addV(oL); if(Math.abs(dR-oR)<T)addV(oR);
    });
  },
};

const SelectionEngine = {
  _drag: null,
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
    const div=(e.target&&typeof e.target.closest==='function'
      ? e.target.closest(`.cr-element[data-id="${id}"]`)
      : null) || document.querySelector(`.cr-element[data-id="${id}"]`);
    if(!div)return;
    if(div.setPointerCapture){
      const pointerId = typeof e.pointerId === 'number'
        ? e.pointerId
        : (e.originalEvent ? e.originalEvent.pointerId : null);
      if (typeof pointerId === 'number') div.setPointerCapture(pointerId);
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
    this.renderHandles();
    PropertiesEngine.render();
    FormatEngine.updateToolbar();
    const canvasPos = getCanvasPos(e);
    this._drag = {
      type:'move',
      startX: canvasPos.x,
      startY: canvasPos.y,
      startPositions: DS.getSelectedElements().map(el=>({id:el.id,x:el.x,y:el.y,sectionId:el.sectionId,sectionTop:DS.getSectionTop(el.sectionId)})),
      moved: false,
    };
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
    };
  },

  attachElementEvents(div, id){
    if(!this._useCentralRouter()){
      div.addEventListener('pointerdown', e=>{
        e.stopPropagation();e.preventDefault();
        this.onElementPointerDown(e, id);
      });
    }
    div.addEventListener('contextmenu', e=>{
      e.preventDefault();e.stopPropagation();
      if(!DS.isSelected(id)){ DS.selectOnly(id);this.renderHandles(); }
      ContextMenuEngine.show(e.clientX,e.clientY,'element');
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
    const layer=document.getElementById('handles-layer');while(layer.firstChild)layer.removeChild(layer.firstChild);
    document.querySelectorAll('.cr-element').forEach(d=>{
      d.classList.toggle('selected',DS.isSelected(d.dataset.id));
    });
    if(DS.selection.size===0) return;
    if(DS.selection.size===1){
      const id=[...DS.selection][0];
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
      let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
      DS.getSelectedElements().forEach(el=>{
        assertLayoutContract(el, 'SelectionEngine.renderHandles.multi');
        const rect=this._selectionRect(el);
        assertRectShape(rect, 'SelectionEngine.renderHandles.multi.rect');
        minX=Math.min(minX,rect.left);minY=Math.min(minY,rect.top);
        maxX=Math.max(maxX,rect.left+rect.width);maxY=Math.max(maxY,rect.top+rect.height);
      });
      const outline=document.createElement('div');
      outline.className='sel-box sel-box-multi';
      outline.style.cssText=`position:absolute;left:${minX}px;top:${minY}px;width:${maxX-minX}px;height:${maxY-minY}px;pointer-events:none`;
      layer.appendChild(outline);
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
    const dx=pos.x-d.startX, dy=pos.y-d.startY;
    if(typeof AlignmentGuides!=='undefined' && DS.selection.size===1){
      AlignmentGuides.show([...DS.selection][0]);
    }
    d.startPositions.forEach(orig=>{
      const el=DS.getElementById(orig.id);if(!el)return;
      let newAbsY=orig.sectionTop+orig.y+dy;
      let newX=DS.snap(orig.x+dx);
      const target=DS.getSectionAtY(newAbsY+el.h/2);
      if(target){
        DS.updateElementLayout(el.id,{
          sectionId: target.section.id,
          y: DS.snap(Math.max(0,newAbsY-DS.getSectionTop(target.section.id))),
        });
      } else {
        DS.updateElementLayout(el.id,{ y: DS.snap(Math.max(0,orig.y+dy)) });
      }
      DS.updateElementLayout(el.id,{ x: DS.snap(Math.max(0,Math.min(CFG.PAGE_W-el.w,newX))) });
      const div=document.querySelector(`.cr-element[data-id="${orig.id}"]`);
      if(div){
        div.classList.add('dragging');
        const _mp = RF.Geometry.modelToView(el.x, el.y);
        div.style.left=_mp.x+'px';
        div.style.top =_mp.y+'px';
      }
      if(DS.previewMode){
        document.querySelectorAll(`.pv-el[data-origin-id="${orig.id}"]`).forEach(pv=>{
          pv.classList.add('dragging');
          const _pp = RF.Geometry.rectToView(el);
          pv.style.left = _pp.left+'px';
          pv.style.top  = _pp.top+'px';
        });
      }
    });
    if(!d._rafPending){
      d._rafPending=true;
      requestAnimationFrame(()=>{
        d._rafPending=false;
        this.renderHandles();
        if(DS.selection.size===1){
          const el=DS.getElementById([...DS.selection][0]);
          if(el) document.getElementById('sb-pos').textContent=`X: ${el.x}   Y: ${el.y}`;
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
    if(p.includes('e')) w=Math.max(CFG.MIN_EL_W, DS.snap(w+dx));
    if(p.includes('s')) h=Math.max(CFG.MIN_EL_H, DS.snap(h+dy));
    if(p.includes('w')){const nw=Math.max(CFG.MIN_EL_W,DS.snap(w-dx));x=DS.snap(x+w-nw);w=nw;}
    if(p.includes('n')){const nh=Math.max(CFG.MIN_EL_H,DS.snap(h-dy));y=DS.snap(y+h-nh);h=nh;}
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
    this.renderHandles();
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
    this._drag=null;
  },
};
SelectionEngine.__active = true;

if (typeof module !== 'undefined') {
  module.exports = SelectionEngine;
}
