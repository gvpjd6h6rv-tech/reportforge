'use strict';

const InsertEngine = {
  _startPos:null,

  setTool(tool){
    DS.tool=tool;
    document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));
    const cs=document.getElementById('workspace');
    cs.className='';cs.classList.add(`tool-${tool}`);
    if(tool==='pointer') SelectionEngine._drag=null;
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
    else if(tool==='box') newEl=mkEl('rect',secId,x,relY,w,h,{bgColor:'transparent',borderColor:'#000',borderWidth:1});
    if(!newEl)return;
    DS.elements.push(newEl);
    _canonicalCanvasWriter().renderElement(newEl);
    DS.selectOnly(newEl.id);
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
