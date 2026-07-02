'use strict';

// FIX-3: explicit tool-class list so setTool never touches non-tool classes
// (workspace, rf-synthetic-scrollbars, etc.)
const _TOOL_CLASSES = [
  'tool-pointer','tool-text','tool-field',
  'tool-line','tool-line-v','tool-box','tool-barcode','tool-section',
];

// RF-INTERACTION-AUDIT-1 (BUG NEW 3): single source for "no explicit size
// given" fallback dimensions, shared by insertAtDefaultPosition() (explicit
// default-position insert) and onMouseUp()'s click-without-drag case for
// line/line-v — a "minimal visible line" means the same thing everywhere,
// not two different magic sizes depending on which code path created it.
const _DEFAULT_W = {text:200,field:200,line:200,'line-v':2,box:200,barcode:200};
const _DEFAULT_H = {text:16, field:16, line:2,  'line-v':60,box:40, barcode:60};
// Below this drag distance (model units) on the dominant axis, treat the
// gesture as a click, not a drag.
const _LINE_CLICK_THRESHOLD = 3;
// Fixed thickness for a line's non-dominant axis, both while drawing (ghost)
// and on the final element — a horizontal line stays 2px tall no matter how
// much vertical wobble the drag had, and vice versa.
const _LINE_THIN_AXIS = 2;

const InsertEngine = {
  _startPos:null,

  setTool(tool){
    // insert-section uses its own route (CommandRuntimeSections) — keep legacy exit-to-design
    if(tool === 'section' && DS.previewMode && typeof PreviewEngineMode !== 'undefined'){
      PreviewEngineMode.hide();
      return;
    }
    DS.setTool(tool, 'InsertEngine.setTool');
    document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));
    const cs=document.getElementById('workspace');
    // FIX-3: remove only tool-* classes; preserve workspace, rf-synthetic-scrollbars, etc.
    cs.classList.remove(..._TOOL_CLASSES);
    if(tool !== 'pointer') cs.classList.add(`tool-${tool}`);
    if(tool==='pointer') SelectionEngine._drag=null;
    // RF-PREVIEW-INSERT-CLICK-POSITION-1: arm the tool and wait for the user's
    // click/drag on the Preview canvas — do NOT insert immediately. onCanvasMouseDown/
    // onMouseMove/onMouseUp below resolve the real click position (via getCanvasPos()/
    // RF.Geometry.clientToModel, preview-aware) and create the element there, exactly
    // like Design. insertAtDefaultPosition() is kept only for explicit default-position
    // callers, never auto-invoked from tool selection anymore.
    if(tool !== 'pointer' && DS.previewMode){
      const sb=document.getElementById('sb-msg');
      if(sb) sb.textContent='Haga clic o arrastre en el documento para insertar';
    }
  },

  insertAtDefaultPosition(tool){
    const w=_DEFAULT_W[tool]||120, h=_DEFAULT_H[tool]||20;
    const relY=DS.snap(4);
    const needed=DS.snap(relY+h+4);   // minimum section height to keep element in bounds

    // Prefer the first 'det' section that is already tall enough.
    // If none fits, fall back to the tallest visible section and grow it.
    let sec=DS.sections.find(s=>s.stype==='det' && s.height>=needed);
    if(!sec) sec=DS.sections.reduce((best,s)=>(!best||s.height>best.height)?s:best,null);
    if(!sec){ console.warn('[insertAtDefault] no section found'); return; }

    // Grow section to contain the element before rendering (avoids contain:paint clip)
    if(sec.height<needed){
      sec.height=needed;
      const secDiv=document.querySelector(`.cr-section[data-section-id="${sec.id}"]`);
      if(secDiv) secDiv.style.height=sec.height+'px';
      if(typeof SectionLayoutEngine!=='undefined') SectionLayoutEngine.update();
      if(typeof SectionEngine!=='undefined') SectionEngine.updateSectionsList();
    }

    const pageW=(typeof CFG!=='undefined'&&CFG.PAGE_W)||754;
    const x=DS.snap(Math.max(0,Math.round((pageW-w)/2)));

    let newEl;
    if(tool==='text')    newEl=mkEl('text',   sec.id,x,relY,w,h,{content:'Texto',bgColor:'transparent',borderColor:'transparent'});
    else if(tool==='field')   newEl=mkEl('field',  sec.id,x,relY,w,h,{fieldPath:'',content:'Seleccione campo'});
    else if(tool==='line')    newEl=mkEl('line',   sec.id,x,relY,w,Math.max(h,2),{borderColor:'#000',lineWidth:1});
    else if(tool==='line-v')  newEl=mkEl('line',   sec.id,x,relY,2,Math.max(h,20),{borderColor:'#000',lineWidth:1,lineDir:'v'});
    else if(tool==='box')     newEl=mkEl('rect',   sec.id,x,relY,w,h,{bgColor:'transparent',borderColor:'#000',borderWidth:1});
    else if(tool==='barcode') newEl=mkEl('barcode',sec.id,x,relY,w,h,{barcodeType:'code128',showText:true});
    if(!newEl)return;

    DS.setElements([...DS.elements,newEl],'InsertEngine.insertAtDefaultPosition');
    _canonicalCanvasWriter().renderElement(newEl);
    DS.selectOnly(newEl.id,'InsertEngine.insertAtDefaultPosition');
    SelectionEngine.renderHandles();
    PropertiesEngine.render();FormatEngine.updateToolbar();
    DS.saveHistory();
    this.setTool('pointer');

    const _elId=newEl.id;
    if(typeof RenderScheduler!=='undefined'){
      RenderScheduler.post(()=>{
        const div=document.querySelector(`.cr-element[data-id="${_elId}"]`);
        if(div) div.scrollIntoView({behavior:'auto',block:'center',inline:'nearest'});
      },'insert-scroll-to-'+_elId);
    }
    if(tool==='text' && !DS.previewMode){
      // In Preview the design node is display:none; inline edit uses preview double-click parity.
      const div=document.querySelector(`.cr-element[data-id="${newEl.id}"]`);
      if(div) setTimeout(()=>SelectionEngine.startTextEdit(div,newEl),50);
    }
    if(tool==='field'){
      const sb=document.getElementById('sb-msg');
      if(sb) sb.textContent='Arrastre un campo desde el Explorador para asignarlo';
    }
  },

  onCanvasMouseDown(e){
    if(DS.previewMode && DS.tool==='pointer')return; // rubber-band selection stays Design-only
    if(DS.tool==='pointer'){
      SelectionEngine.clearSelection();
      SelectionEngine.startRubberBand(e);
    } else {
      const pos=getCanvasPos(e);
      SelectionEngine._drag={type:'insert',startX:pos.x,startY:pos.y,curX:pos.x,curY:pos.y};
      this._showGhost(pos.x,pos.y,4,4);
    }
  },

  onMouseMove(pos){
    const d=SelectionEngine._drag;if(!d||d.type!=='insert')return;
    const tool=DS.tool;
    // BUG NEW 3: the ghost tracked the drag's full bounding box for every
    // tool, including line/line-v — a diagonal-ish drag drew a fat dashed
    // rectangle instead of a thin line preview. Pin the non-dominant axis to
    // the same fixed thickness the final element will use, anchored at the
    // mousedown point on that axis (matches onMouseUp's anchor below).
    if(tool==='line'){
      const w=Math.abs(pos.x-d.startX)||4;
      this._showGhost(Math.min(d.startX,pos.x), d.startY, w, _LINE_THIN_AXIS);
    } else if(tool==='line-v'){
      const h=Math.abs(pos.y-d.startY)||4;
      this._showGhost(d.startX, Math.min(d.startY,pos.y), _LINE_THIN_AXIS, h);
    } else {
      const x=Math.min(d.startX,pos.x),y=Math.min(d.startY,pos.y);
      const w=Math.abs(pos.x-d.startX)||4,h=Math.abs(pos.y-d.startY)||4;
      this._showGhost(x,y,w,h);
    }
  },

  onMouseUp(e){
    const d=SelectionEngine._drag;if(!d||d.type!=='insert')return;
    if(e && e.phase === 'cancel'){
      this._hideGhost();
      SelectionEngine._drag=null;
      return;
    }
    this._hideGhost();
    const pos=getCanvasPos(e);
    let x=DS.snap(Math.min(d.startX,pos.x));
    let y=DS.snap(Math.min(d.startY,pos.y));
    let w=DS.snap(Math.max(Math.abs(pos.x-d.startX),20));
    let h=DS.snap(Math.max(Math.abs(pos.y-d.startY),12));
    let secId, relY;
    if(DS.previewMode && typeof PreviewInsertPositionResolver !== 'undefined'){
      // DS.getSectionAtY() is the flat Design-declaration-order model — it
      // diverges from the rendered Preview layout (repeating rows, rf/pf
      // print order). Resolve against the actual rendered DOM instead.
      const hit=PreviewInsertPositionResolver.resolve(e.clientX,e.clientY);
      if(!hit){
        const sb=document.getElementById('sb-msg');
        if(sb) sb.textContent='No hay sección destino';
        return;
      }
      secId=hit.sectionId;
      relY=DS.snap(Math.max(0,hit.relY));
    } else {
      const target=DS.getSectionAtY(y+h/2);
      if(!target){
        const sb=document.getElementById('sb-msg');
        if(sb) sb.textContent='No hay sección destino';
        return;
      }
      secId=target.section.id;
      relY=DS.snap(Math.max(0,y-DS.getSectionTop(secId)));
    }
    let newEl;
    const tool=DS.tool;
    if(tool==='text') newEl=mkEl('text',secId,x,relY,w,h,{content:'Texto',bgColor:'transparent',borderColor:'transparent'});
    else if(tool==='field') newEl=mkEl('field',secId,x,relY,w,h,{fieldPath:'',content:'Seleccione campo'});
    else if(tool==='line' || tool==='line-v'){
      // BUG NEW 3: was using the same generic drag-bounding-box sizing as
      // text/field/box (w/h above), so a plain click fell into the generic
      // 20x12 box floor, and any vertical wobble during a "horizontal" drag
      // leaked straight into the line's height. A line only has one
      // meaningful axis — the other stays pinned to _LINE_THIN_AXIS — and a
      // drag distance under the click threshold uses the same documented
      // default insertAtDefaultPosition() would (never a 20x12 box).
      const isV=tool==='line-v';
      const dragDX=Math.abs(pos.x-d.startX), dragDY=Math.abs(pos.y-d.startY);
      const dominant=isV?dragDY:dragDX;
      let lineW,lineH;
      if(dominant<_LINE_CLICK_THRESHOLD){ lineW=_DEFAULT_W[tool]; lineH=_DEFAULT_H[tool]; }
      else if(isV){ lineW=_LINE_THIN_AXIS; lineH=DS.snap(Math.max(dragDY,_LINE_THIN_AXIS)); }
      else { lineW=DS.snap(Math.max(dragDX,_LINE_THIN_AXIS)); lineH=_LINE_THIN_AXIS; }
      newEl=mkEl('line',secId,x,relY,lineW,lineH,{borderColor:'#000',lineWidth:1,lineDir:isV?'v':'h'});
    }
    else if(tool==='box')     newEl=mkEl('rect',secId,x,relY,w,h,{bgColor:'transparent',borderColor:'#000',borderWidth:1});
    else if(tool==='barcode') newEl=mkEl('barcode',secId,x,relY,Math.max(w,120),Math.max(h,40),{barcodeType:'code128',showText:true});
    if(!newEl)return;
    DS.setElements([...DS.elements, newEl], 'InsertEngine.onMouseUp');
    _canonicalCanvasWriter().renderElement(newEl);
    DS.selectOnly(newEl.id, 'InsertEngine.onMouseUp');
    SelectionEngine.renderHandles();
    PropertiesEngine.render();FormatEngine.updateToolbar();
    DS.saveHistory();
    this.setTool('pointer');
    if(tool==='text' && !DS.previewMode){
      // In Preview the design node is display:none; inline edit uses preview double-click parity.
      const div=document.querySelector(`.cr-element[data-id="${newEl.id}"]`);
      if(div) setTimeout(()=>SelectionEngine.startTextEdit(div,newEl),50);
    }
    if(tool==='field'){
      document.getElementById('sb-msg').textContent='Arrastre un campo desde el Explorador para asignarlo';
    }
  },

  // RF-PREVIEW-INSERT-CLICK-POSITION-1: insert-ghost lives inside #canvas-layer,
  // which is positioned/scaled for the Design surface. In Preview the visible
  // document is #preview-content .preview-render-layer, geometry-synced to
  // .preview-hit-layer via a copyable transform (same technique already used
  // by SelectionOverlayPreview for the selection box and hover outline) — so
  // the ghost needs its own layer there instead of the Design #insert-ghost node.
  _ensurePreviewGhostLayer(){
    const content=document.querySelector('#preview-content');
    const hitLayer=document.querySelector('#preview-content .preview-hit-layer');
    if(!content||!hitLayer)return null;
    let layer=content.querySelector(':scope > .preview-insert-ghost-layer');
    if(!layer){
      layer=document.createElement('div');
      layer.className='preview-insert-ghost-layer';
      layer.style.position='absolute';
      layer.style.left='0px';layer.style.top='0px';
      layer.style.overflow='visible';
      layer.style.pointerEvents='none';
      layer.style.zIndex='9999';
      const ghost=document.createElement('div');
      ghost.className='preview-insert-ghost';
      ghost.style.position='absolute';
      ghost.style.border='1px dashed #0060C0';
      ghost.style.background='rgba(0,96,192,.1)';
      ghost.style.pointerEvents='none';
      ghost.style.display='none';
      layer.appendChild(ghost);
      content.appendChild(layer);
    }
    layer.style.height=hitLayer.style.height||'100%';
    layer.style.transform=hitLayer.style.transform||'none';
    layer.style.transformOrigin=hitLayer.style.transformOrigin||'top left';
    return layer.firstChild;
  },

  _ghostEl(){
    return DS.previewMode ? this._ensurePreviewGhostLayer() : document.getElementById('insert-ghost');
  },

  _showGhost(x,y,w,h){
    const ghost=this._ghostEl();
    if(!ghost)return;
    ghost.style.display='block';
    ghost.style.left=x+'px';ghost.style.top=y+'px';
    ghost.style.width=w+'px';ghost.style.height=h+'px';
  },

  _hideGhost(){
    const ghost=this._ghostEl();
    if(ghost) ghost.style.display='none';
  },
};

if (typeof module !== 'undefined') {
  module.exports = InsertEngine;
}
