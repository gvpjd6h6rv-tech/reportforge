'use strict';

function _canonicalCanvasWriter(){
  window.__RF_CANONICAL_CANVAS_OWNER__ = 'CanvasLayoutEngine';
  if (typeof CanvasLayoutEngine === 'undefined') {
    const message = 'CANVAS OWNER MISSING IN CANONICAL RUNTIME';
    console.error(message);
    throw new Error(message);
  }
  return CanvasLayoutEngine;
}

const SectionEngine = {
  container: null,
  init(){
    this.container = document.getElementById('sections-layer');
    this.render();
  },
  render(){
    if (typeof RenderScheduler !== 'undefined') {
      RenderScheduler.flushSync(() => {
        this.container.innerHTML='';
        this.container.style.width = RF.Geometry.scale(CFG.PAGE_W) + 'px';
        for(const sec of DS.sections){
          const div = document.createElement('div');
          div.className='cr-section';
          div.dataset.sectionId = sec.id;
          div.dataset.stype = sec.stype;
          div.style.height = RF.Geometry.scale(sec.height) + 'px';
          div.style.position='relative';
          div.style.width = RF.Geometry.scale(CFG.PAGE_W) + 'px';
          if(sec.visible === false) div.style.display='none';
          const label = document.createElement('div');
          label.className='section-label';
          label.textContent = sec.abbr;
          label.title=sec.label;
          div.appendChild(label);
          const handle = document.createElement('div');
          handle.className='section-resize-handle';
          handle.dataset.sectionId = sec.id;
          div.appendChild(handle);
          this.container.appendChild(div);
        }
      }, 'SectionEngine.render');
    } else {
      this.container.innerHTML='';
      this.container.style.width = RF.Geometry.scale(CFG.PAGE_W) + 'px';
      for(const sec of DS.sections){
        const div = document.createElement('div');
        div.className='cr-section';
        div.dataset.sectionId = sec.id;
        div.dataset.stype = sec.stype;
        div.style.height = RF.Geometry.scale(sec.height) + 'px';
        div.style.position='relative';
        div.style.width = RF.Geometry.scale(CFG.PAGE_W) + 'px';
        if(sec.visible === false) div.style.display='none';
        const label = document.createElement('div');
        label.className='section-label';
        label.textContent = sec.abbr;
        label.title=sec.label;
        div.appendChild(label);
        const handle = document.createElement('div');
        handle.className='section-resize-handle';
        handle.dataset.sectionId = sec.id;
        div.appendChild(handle);
        this.container.appendChild(div);
      }
    }
    SectionResizeEngine.attach();
    if (typeof RenderScheduler !== 'undefined') {
      RenderScheduler.layout(() => {
        if (typeof CanvasLayoutEngine === 'undefined') {
          const message = 'CANVAS LEGACY WRITER SHOULD NOT BE ACTIVE IN CANONICAL RUNTIME (SectionEngine.render.layout)';
          console.error(message);
          throw new Error(message);
        }
        CanvasLayoutEngine.renderAll();
        if (typeof CanvasLayoutEngine !== 'undefined') CanvasLayoutEngine.updateSync();
        if (typeof WorkspaceScrollEngine !== 'undefined') WorkspaceScrollEngine.update();
      }, 'SectionEngine.render.layout');
      RenderScheduler.visual(() => {
        if (typeof OverlayEngine !== 'undefined') OverlayEngine.render();
      }, 'SectionEngine.render.overlay');
    }
    this.updateSectionsList();
  },
  updateSectionsList(){
    const list=document.getElementById('sections-list');
    list.innerHTML='';
    for(const sec of DS.sections){
      const d=document.createElement('div');
      d.className='panel-section-item';
      d.innerHTML=`<span>${sec.label}</span><span style="color:#999;font-size:9px">${sec.height}px</span>`;
      d.dataset.sectionId=sec.id;
      d.addEventListener('click',()=>{
        document.querySelectorAll('.panel-section-item').forEach(x=>x.classList.remove('selected'));
        d.classList.add('selected');
      });
      list.appendChild(d);
    }
  },
};

if (typeof window !== 'undefined') {
  window._canonicalCanvasWriter = _canonicalCanvasWriter;
  window.SectionEngine = SectionEngine;
}

if (typeof module !== 'undefined') {
  module.exports = SectionEngine;
}
