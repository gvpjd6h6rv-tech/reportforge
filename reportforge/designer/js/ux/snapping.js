import RF from '../rf.js';

/**
 * ux/snapping.js — RF.UX.Snapping
 * Layer   : UX
 * Purpose : Computes snap offsets for element move/resize against the grid
 *           and against other elements' edges and centers.
 * Deps    : RF.Core.DocumentModel
 */

RF.UX.Snapping = {
  THRESHOLD: 5,

  snapPoint(x, y, skipId=null) {
    const DM = RF.Core.DocumentModel;
    let sx=x, sy=y;
    if (DM.snapToGrid)  { sx=RF.snap(x,DM.gridSize); sy=RF.snap(y,DM.gridSize); }
    if (DM.snapToElems) { const r=this._snapToElements(sx,sy,skipId); sx=r.x; sy=r.y; }
    return {x:sx,y:sy};
  },

  snapElement(x, y, w, h, skipId) {
    const DM = RF.Core.DocumentModel;
    let sx=x, sy=y;
    if (DM.snapToGrid)  { sx=RF.snap(x,DM.gridSize); sy=RF.snap(y,DM.gridSize); }
    const guides=[];
    if (DM.snapToElems) {
      const r=this._snapRectToElements(sx,sy,w,h,skipId);
      sx=r.x; sy=r.y;
      r.guides.forEach(g=>guides.push(g));
    }
    RF.emit(RF.E.SNAP_GUIDES, guides);
    return {x:sx,y:sy};
  },

  _snapToElements(x,y,skipId) {
    const T=this.THRESHOLD;
    let sx=x,sy=y;
    RF.Core.DocumentModel.layout.elements.forEach(o => {
      if(o.id===skipId) return;
      if(Math.abs(x-o.x)<T)         sx=o.x;
      if(Math.abs(x-(o.x+o.w))<T)   sx=o.x+o.w;
      if(Math.abs(y-o.y)<T)         sy=o.y;
      if(Math.abs(y-(o.y+o.h))<T)   sy=o.y+o.h;
    });
    return {x:sx,y:sy};
  },

  _snapRectToElements(x,y,w,h,skipId) {
    const T=this.THRESHOLD;
    let sx=x,sy=y;
    const guides=[];
    const tryX=(cand,gx)=>{if(Math.abs(sx-cand)<T){sx=cand;guides.push({o:'v',p:gx});}};
    const tryY=(cand,gy)=>{if(Math.abs(sy-cand)<T){sy=cand;guides.push({o:'h',p:gy});}};
    RF.Core.DocumentModel.layout.elements.forEach(o => {
      if(o.id===skipId) return;
      tryX(o.x,         o.x);
      tryX(o.x+o.w,     o.x+o.w);
      tryX(o.x-w,       o.x);
      tryX(o.x+o.w/2-w/2, o.x+o.w/2);
      tryY(o.y,         o.y);
      tryY(o.y+o.h,     o.y+o.h);
      tryY(o.y-h,       o.y);
      tryY(o.y+o.h/2-h/2, o.y+o.h/2);
    });
    return {x:sx,y:sy,guides};
  },

  clearGuides() { RF.emit(RF.E.SNAP_GUIDES,[]); },
};


// ═══════════════════════════════════════════════════════════════════════════════
// RF.UX.Guides — Permanent guide lines draggable from rulers.
// ═══════════════════════════════════════════════════════════════════════════════
