'use strict';

// FIX-3: explicit tool-class list so setTool never touches non-tool classes
// (workspace, rf-synthetic-scrollbars, etc.)
const _TOOL_CLASSES = [
  'tool-pointer','tool-text','tool-field',
  'tool-line','tool-line-v','tool-box','tool-barcode','tool-section',
];

const InsertEngine = {
  _startPos:null,

  setTool(tool){
    if(tool !== 'pointer' && DS.previewMode && typeof PreviewEngineMode !== 'undefined'){
      // insert-section uses its own route (CommandRuntimeSections) — keep legacy exit-to-design
      if(tool === 'section'){ PreviewEngineMode.hide(); return; }
      // CR PARITY (RF-CR-PARITY-PREVIEW-INSERT-STAY-IN-PREVIEW): stay in Preview.
      // insertAtDefaultPosition() calls DS.saveHistory(), whose CommandRuntimeInit patch
      // auto-refreshes #preview-content while DS.previewMode stays true. Chain proven by
      // tools/diagnostics/rf-preview-insert/rf_preview_insert_stay_experiment.mjs (gate a–h).
      this.insertAtDefaultPosition(tool);
      return;
    }
    DS.setTool(tool, 'InsertEngine.setTool');
    document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));
    const cs=document.getElementById('workspace');
    // FIX-3: remove only tool-* classes; preserve workspace, rf-synthetic-scrollbars, etc.
    cs.classList.remove(..._TOOL_CLASSES);
    if(tool !== 'pointer') cs.classList.add(`tool-${tool}`);
    if(tool==='pointer') SelectionEngine._drag=null;
  },

  insertAtDefaultPosition(tool){
    const W={text:200,field:200,line:200,'line-v':2,box:200,barcode:200};
    const H={text:16, field:16, line:2,  'line-v':60,box:40, barcode:60};
    const w=W[tool]||120, h=H[tool]||20;
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
    if(DS.previewMode)return;
    if(DS.tool==='pointer'){
      SelectionEngine.clearSelection();
      SelectionEngine.startRubberBand(e);
    } else {
      const pos=getCanvasPos(e);
      SelectionEngine._drag={type:'insert',startX:pos.x,startY:pos.y,curX:pos.x,curY:pos.y};
      const ghost=document.getElementById('insert-ghost');
      ghost.style.display='block';ghost.style.left=pos.x+'px';ghost.style.top=pos.y+'px';
      ghost.style.width='4px';ghost.style.height='4px';
    }
  },

  onMouseMove(pos){
    const d=SelectionEngine._drag;if(!d||d.type!=='insert')return;
    const x=Math.min(d.startX,pos.x),y=Math.min(d.startY,pos.y);
    const w=Math.abs(pos.x-d.startX)||4,h=Math.abs(pos.y-d.startY)||4;
    const ghost=document.getElementById('insert-ghost');
    ghost.style.left=x+'px';ghost.style.top=y+'px';
    ghost.style.width=w+'px';ghost.style.height=h+'px';
  },

  onMouseUp(e){
    const d=SelectionEngine._drag;if(!d||d.type!=='insert')return;
    if(e && e.phase === 'cancel'){
      const ghost=document.getElementById('insert-ghost');
      ghost.style.display='none';
      SelectionEngine._drag=null;
      return;
    }
    const ghost=document.getElementById('insert-ghost');
    ghost.style.display='none';
    const pos=getCanvasPos(e);
    let x=DS.snap(Math.min(d.startX,pos.x));
    let y=DS.snap(Math.min(d.startY,pos.y));
    let w=DS.snap(Math.max(Math.abs(pos.x-d.startX),20));
    let h=DS.snap(Math.max(Math.abs(pos.y-d.startY),12));
    const target=DS.getSectionAtY(y+h/2);
    if(!target)return;
    const secId=target.section.id;
    const relY=DS.snap(Math.max(0,y-DS.getSectionTop(secId)));
    let newEl;
    const tool=DS.tool;
    if(tool==='text') newEl=mkEl('text',secId,x,relY,w,h,{content:'Texto',bgColor:'transparent',borderColor:'transparent'});
    else if(tool==='field') newEl=mkEl('field',secId,x,relY,w,h,{fieldPath:'',content:'Seleccione campo'});
    else if(tool==='line') newEl=mkEl('line',secId,x,relY,w,Math.max(h,2),{borderColor:'#000',lineWidth:1});
    else if(tool==='line-v') newEl=mkEl('line',secId,x,relY,2,Math.max(h,20),{borderColor:'#000',lineWidth:1,lineDir:'v'});
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
    if(tool==='text'){
      const div=document.querySelector(`.cr-element[data-id="${newEl.id}"]`);
      if(div) setTimeout(()=>SelectionEngine.startTextEdit(div,newEl),50);
    }
    if(tool==='field'){
      document.getElementById('sb-msg').textContent='Arrastre un campo desde el Explorador para asignarlo';
    }
  },
};

if (typeof module !== 'undefined') {
  module.exports = InsertEngine;
}
