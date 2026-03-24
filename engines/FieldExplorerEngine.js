'use strict';

const FieldExplorerEngine = {
  _dragField: null,
  _expanded: new Set(['database']),

  init(){
    this.render();
  },

  render(){
    const tree=document.getElementById('field-tree');
    tree.innerHTML='';
    Object.entries(FIELD_TREE).forEach(([key,node])=>{
      tree.appendChild(this._buildNode(key,node,0));
    });
  },

  _buildNode(key,node,depth){
    const div=document.createElement('div');div.className='tree-node';
    const hasChildren=node.children&&Object.keys(node.children).length>0;
    const label=document.createElement('div');label.className='tree-node-label';
    const isOpen=this._expanded.has(key);
    label.innerHTML=`
      <span class="tree-arrow">${hasChildren?(isOpen?'▼':'▶'):''}</span>
      <span class="tree-icon">${node.icon||'📁'}</span>
      <span class="tree-text">${node.label}</span>`;
    div.appendChild(label);
    if(hasChildren){
      const children=document.createElement('div');
      children.className='tree-children'+(isOpen?' open':'');
      Object.entries(node.children).forEach(([ck,cn])=>{
        if(cn.path){
          children.appendChild(this._buildField(cn));
        } else {
          children.appendChild(this._buildNode(ck,cn,depth+1));
        }
      });
      div.appendChild(children);
      label.addEventListener('click',()=>{
        const open=children.classList.toggle('open');
        label.querySelector('.tree-arrow').textContent=open?'▼':'▶';
        if(open)this._expanded.add(key);else this._expanded.delete(key);
      });
    }
    return div;
  },

  _buildField(field){
    const div=document.createElement('div');div.className='tree-field';
    const typeIcon={'string':'abc','number':'#','currency':'$','date':'📅'}[field.vtype]||'•';
    div.innerHTML=`<span style="font-size:10px">⬚</span><span class="tree-text">${field.label}</span><span class="tree-field-type">${typeIcon}</span>`;
    div.title=field.path;
    div.draggable=true;
    div.addEventListener('dblclick',()=>this._insertField(field));
    div.addEventListener('dragstart',e=>{
      this._dragField=field;
      div.classList.add('dragging');
      document.getElementById('field-drag-ghost').style.display='block';
      document.getElementById('field-drag-ghost').textContent=`{${field.path}}`;
      e.dataTransfer.setData('text/plain',field.path);
      e.dataTransfer.effectAllowed='copy';
    });
    div.addEventListener('dragend',()=>{
      div.classList.remove('dragging');
      document.getElementById('field-drag-ghost').style.display='none';
      document.getElementById('field-drop-indicator').style.display='none';
      this._dragField=null;
    });
    return div;
  },

  _insertField(field){
    const secId = field.path.startsWith('item.') ? 's-d1' : 's-ph';
    const el=mkEl('field',secId,4,DS.getSection(secId)?4:4,150,14,{
      fieldPath:field.path,
      fieldFmt:field.vtype==='currency'?'currency':field.vtype==='date'?'date':null,
      content:field.path,fontSize:8,
    });
    DS.elements.push(el);_canonicalCanvasWriter().renderElement(el);
    DS.selectOnly(el.id);
    SelectionEngine.renderHandles();PropertiesEngine.render();FormatEngine.updateToolbar();
    DS.saveHistory();
    document.getElementById('sb-msg').textContent=`Campo '${field.path}' insertado`;
  },

  setupCanvasDrop(){
    const canvas=document.getElementById('workspace');
    canvas.addEventListener('dragover',e=>{
      if(!this._dragField)return;
      e.preventDefault();e.dataTransfer.dropEffect='copy';
      const pos=getCanvasPos(e);
      const ind=document.getElementById('field-drop-indicator');
      ind.style.display='block';
      ind.style.left=DS.snap(pos.x)+'px';
      ind.style.top=DS.snap(pos.y)+'px';
      ind.style.width='150px';ind.style.height='14px';
      document.getElementById('field-drag-ghost').style.left=(e.clientX+10)+'px';
      document.getElementById('field-drag-ghost').style.top=(e.clientY-10)+'px';
    });
    canvas.addEventListener('drop',e=>{
      if(!this._dragField)return;
      e.preventDefault();
      const ind=document.getElementById('field-drop-indicator');ind.style.display='none';
      const field=this._dragField;
      const pos=getCanvasPos(e);
      const x=DS.snap(pos.x),y=DS.snap(pos.y);
      const target=DS.getSectionAtY(y);
      if(!target)return;
      const secId=target.section.id;
      const relY=DS.snap(Math.max(0,y-DS.getSectionTop(secId)));
      const fmtDef=field.vtype==='currency'?'currency':field.vtype==='date'?'date':null;
      const el=mkEl('field',secId,x,relY,150,14,{
        fieldPath:field.path,fieldFmt:fmtDef,content:field.path,fontSize:8,
      });
      DS.elements.push(el);_canonicalCanvasWriter().renderElement(el);
      DS.selectOnly(el.id);
      SelectionEngine.renderHandles();PropertiesEngine.render();FormatEngine.updateToolbar();
      DS.saveHistory();
      document.getElementById('sb-msg').textContent=`Campo '${field.path}' colocado`;
    });
    canvas.addEventListener('dragleave',()=>{
      if(this._dragField) document.getElementById('field-drop-indicator').style.display='none';
    });
  },
};

if (typeof window !== 'undefined') {
  window.FieldExplorerEngine = FieldExplorerEngine;
}

if (typeof module !== 'undefined') {
  module.exports = FieldExplorerEngine;
}
