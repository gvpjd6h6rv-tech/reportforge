'use strict';

const SectionResizeEngine = {
  _drag:null,
  _useCentralRouter(){
    return window.RF?.RuntimeServices?.isEngineCoreInteractionEnabled?.() !== false;
  },
  _clientPoint(e){
    if(e && e.client && typeof e.client.x === 'number' && typeof e.client.y === 'number'){
      return e.client;
    }
    return { x: e.clientX, y: e.clientY };
  },
  attach(){
    if(this._useCentralRouter()) return;
    document.querySelectorAll('.section-resize-handle').forEach(h=>{
      h.addEventListener('pointerdown',e=>{
        e.stopPropagation();e.preventDefault();
        this.onPointerDown(e, h.dataset.sectionId);
      });
    });
  },
  onPointerDown(e, sectionId){
    if(e.button!==0)return;
    const sec=DS.getSection(sectionId);if(!sec)return;
    const client=this._clientPoint(e);
    this._drag={sectionId:sec.id,startY:client.y,startH:sec.height};
    const handle=document.querySelector(`.section-resize-handle[data-section-id="${sectionId}"]`);
    if(handle) handle.classList.add('dragging');
    document.getElementById('resize-badge').style.display='block';
  },
  onMouseMove(e){
    if(!this._drag)return;
    const d=this._drag;
    const sec=DS.getSection(d.sectionId);if(!sec)return;
    const client=this._clientPoint(e);
    const dy=RF.Geometry.unscale(client.y-d.startY);
    const newH=Math.round(Math.max(CFG.SECTION_MIN_H,Math.min(CFG.SECTION_MAX_H,d.startH+dy)));
    sec.height=newH;
    if(!d._rafPending){
      d._rafPending=true;
      requestAnimationFrame(()=>{
        d._rafPending=false;
        if (typeof window !== 'undefined' && typeof window.__rfTraceLegacy === 'function') {
          window.__rfTraceLegacy('SectionResizeEngine.onMouseMove', 'direct-layout-sync', {
            sectionId: sec.id,
            height: sec.height,
          });
        }
        if (typeof RenderScheduler !== 'undefined') {
          RenderScheduler.layout(() => {
            if (typeof SectionLayoutEngine !== 'undefined') SectionLayoutEngine.updateSync();
            if (typeof CanvasLayoutEngine !== 'undefined') CanvasLayoutEngine.updateSync();
            if (typeof WorkspaceScrollEngine !== 'undefined') WorkspaceScrollEngine.updateSync();
          }, 'SectionResizeEngine.onMouseMove.layoutSync');
          RenderScheduler.handles(() => {
            if (typeof SelectionEngine !== 'undefined') SelectionEngine.renderHandles();
          }, 'SectionResizeEngine.onMouseMove.handles');
          RenderScheduler.visual(() => {
            if (typeof OverlayEngine !== 'undefined') OverlayEngine.render();
          }, 'SectionResizeEngine.onMouseMove.overlay');
        } else {
          const message = 'updateSync SHOULD NOT BE ACTIVE IN CANONICAL RUNTIME (SectionResizeEngine.onMouseMove)';
          console.error(message);
          throw new Error(message);
        }
        const badge=document.getElementById('resize-badge');
        badge.textContent=`${sec.abbr}: ${sec.height}px`;
        badge.style.left=(client.x+12)+'px';badge.style.top=(client.y-20)+'px';
      });
    }
  },
  onMouseUp(e){
    if(!this._drag)return;
    const isCancel = e && e.phase === 'cancel';
    document.querySelectorAll('.section-resize-handle').forEach(h=>h.classList.remove('dragging'));
    document.getElementById('resize-badge').style.display='none';
    if(isCancel){
      this._drag=null;
      return;
    }
    DS.saveHistory();
    SectionEngine.updateSectionsList();
    if (typeof RenderScheduler !== 'undefined') {
      RenderScheduler.layout(() => {
        if (typeof window !== 'undefined' && typeof window.__rfTraceLegacy === 'function') {
          window.__rfTraceLegacy('SectionResizeEngine.onMouseUp', 'canvas-sync', { via: 'RenderScheduler.layout' });
        }
        if (typeof SectionLayoutEngine !== 'undefined') SectionLayoutEngine.updateSync();
        if (typeof CanvasLayoutEngine !== 'undefined') CanvasLayoutEngine.updateSync();
        if (typeof WorkspaceScrollEngine !== 'undefined') WorkspaceScrollEngine.update();
      }, 'SectionResizeEngine.onMouseUp.canvasSync');
    } else {
      const message = 'updateSync SHOULD NOT BE ACTIVE IN CANONICAL RUNTIME (SectionResizeEngine.onMouseUp)';
      console.error(message);
      throw new Error(message);
    }
    this._drag=null;
  },
};

if (typeof module !== 'undefined') {
  module.exports = SectionResizeEngine;
}
