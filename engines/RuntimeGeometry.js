'use strict';

class Matrix2D{constructor(a=1,b=0,c=0,d=1,e=0,f=0){this.a=a;this.b=b;this.c=c;this.d=d;this.e=e;this.f=f;}static identity(){return new Matrix2D();}static translate(tx,ty){return new Matrix2D(1,0,0,1,tx,ty);}static scale(sx,sy=sx){return new Matrix2D(sx,0,0,sy,0,0);}static rotate(rad){const c=Math.cos(rad),s=Math.sin(rad);return new Matrix2D(c,s,-s,c,0,0);}multiply(m){return new Matrix2D(this.a*m.a+this.c*m.b,this.b*m.a+this.d*m.b,this.a*m.c+this.c*m.d,this.b*m.c+this.d*m.d,this.a*m.e+this.c*m.f+this.e,this.b*m.e+this.d*m.f+this.f);}transformPoint(x,y){return{x:this.a*x+this.c*y+this.e,y:this.b*x+this.d*y+this.f};}inverse(){const det=this.a*this.d-this.b*this.c;if(Math.abs(det)<1e-10)return Matrix2D.identity();const i=1/det;return new Matrix2D(this.d*i,-this.b*i,-this.c*i,this.a*i,(this.c*this.f-this.d*this.e)*i,(this.b*this.e-this.a*this.f)*i);}toCSSMatrix(){return `matrix(${this.a},${this.b},${this.c},${this.d},${this.e},${this.f})`;}toArray(){return[this.a,this.b,this.c,this.d,this.e,this.f];}}
class AABB{constructor(x,y,w,h){this.x=x;this.y=y;this.w=w;this.h=h;}get x2(){return this.x+this.w;}get y2(){return this.y+this.h;}get cx(){return this.x+this.w/2;}get cy(){return this.y+this.h/2;}overlaps(o){return this.x<o.x2&&this.x2>o.x&&this.y<o.y2&&this.y2>o.y;}intersection(o){const ix=Math.max(this.x,o.x),iy=Math.max(this.y,o.y),ix2=Math.min(this.x2,o.x2),iy2=Math.min(this.y2,o.y2);if(ix>=ix2||iy>=iy2)return null;return new AABB(ix,iy,ix2-ix,iy2-iy);}mtv(o){if(!this.overlaps(o))return{dx:0,dy:0};const ox=Math.min(this.x2-o.x,o.x2-this.x),oy=Math.min(this.y2-o.y,o.y2-this.y);return ox<oy?{dx:(this.cx<o.cx?-ox:ox),dy:0}:{dx:0,dy:(this.cy<o.cy?-oy:oy)};}expand(m){return new AABB(this.x-m,this.y-m,this.w+m*2,this.h+m*2);}static fromRect(r){return new AABB(r.left,r.top,r.width,r.height);}}
const MagneticSnap={GRID:8,TOLERANCE:4,PRECISION:1e-3,MODEL_GRID:0.01*96/25.4,snap(v,grid=this.MODEL_GRID||this.GRID){const s=Math.round(v/grid)*grid;return Math.abs(v-s)<=this.TOLERANCE?+s.toFixed(3):+v.toFixed(3);},snapPoint(x,y,grid=this.MODEL_GRID||this.GRID){return{x:this.snap(x,grid),y:this.snap(y,grid)};},snapWithGuides(x,y,guides=[]){let sx=this.snap(x),sy=this.snap(y);for(const g of guides){if(Math.abs(x-g.x)<this.TOLERANCE)sx=+g.x.toFixed(3);if(Math.abs(y-g.y)<this.TOLERANCE)sy=+g.y.toFixed(3);}return{x:sx,y:sy};},isOnGrid(v,grid=this.MODEL_GRID||this.GRID){const n=Math.round(v/grid)*grid;return Math.abs(v-n)<this.PRECISION+Number.EPSILON*grid;}};
const PointerNorm={clientPos(e){if(e.touches&&e.touches.length)return{x:e.touches[0].clientX,y:e.touches[0].clientY};if(e.changedTouches&&e.changedTouches.length)return{x:e.changedTouches[0].clientX,y:e.changedTouches[0].clientY};return{x:e.clientX||0,y:e.clientY||0};},toCanvas(e){const{x,y}=this.clientPos(e);return RF.Geometry.toCanvasSpace(x,y);},pressure(e){return(e.pressure!==undefined&&e.pressure>0)?e.pressure:1.0;},type(e){return e.pointerType||(e.touches?'touch':'mouse');}};

const RuntimeGeometry = (() => {
  function install() {
    window.RF = window.RF || {};
    const RF = window.RF;
    RF.Geometry = {
      _frameCache: null,
      _cacheFrame: -1,
      invalidate(){ this._frameCache = null; },
      _ensureCache(){ if(!this._frameCache) this._frameCache = {}; },
      _invalidLegacyRectProp(prop){ const msg = `INVALID GEOMETRY SHAPE: use left/top/width/height only (${prop})`; console.error(msg); throw new Error(msg); },
      _rect(left, top, width, height){ const rect = { left, top, width, height }; Object.defineProperties(rect,{ x:{get:()=>this._invalidLegacyRectProp('x'),enumerable:false}, y:{get:()=>this._invalidLegacyRectProp('y'),enumerable:false}, w:{get:()=>this._invalidLegacyRectProp('w'),enumerable:false}, h:{get:()=>this._invalidLegacyRectProp('h'),enumerable:false} }); return Object.freeze(rect); },
      canvasRect(){ if(this._frameCache) return this._frameCache.canvasRect; const el=document.getElementById('canvas-layer'); const r=el?el.getBoundingClientRect():{left:0,top:0,right:0,bottom:0,width:0,height:0}; this._ensureCache(); this._frameCache.canvasRect=r; return r; },
      scrollRect(){ if(this._frameCache&&this._frameCache.scrollRect) return this._frameCache.scrollRect; const el=document.getElementById('workspace'); const r=el?el.getBoundingClientRect():{left:0,top:0,right:0,bottom:0,width:0,height:0}; this._ensureCache(); this._frameCache.scrollRect=r; return r; },
      rulerVRect(){ if(this._frameCache&&this._frameCache.rulerVRect) return this._frameCache.rulerVRect; const el=document.getElementById('ruler-v'); const r=el?el.getBoundingClientRect():{left:0,top:0,right:0,bottom:0,width:0,height:0}; this._ensureCache(); this._frameCache.rulerVRect=r; return r; },
      elementRect(elDiv){ if(!elDiv) return null; const zoom=(typeof DS!=='undefined'?DS.zoom:1)||1; const eR=elDiv.getBoundingClientRect(); const cR=this.canvasRect(); return this._rect((eR.left-cR.left)/zoom,(eR.top-cR.top)/zoom,eR.width/zoom,eR.height/zoom); },
      sectionBand(secDiv){ if(!secDiv) return null; const cR=this.canvasRect(); const sR=secDiv.getBoundingClientRect(); return { y:sR.top-cR.top, h:sR.height }; },
      canvasLeft(){ const cR=this.canvasRect(); const sR=this.scrollRect(); return cR.left-sR.left; },
      rulerVTop(){ const cR=this.canvasRect(); const rR=this.rulerVRect(); return cR.top-rR.top; },
      toCanvasSpace(clientX, clientY){ return this.viewToModel(clientX, clientY); },
      Matrix2D, AABB, MagneticSnap, PointerNorm,
      canvasMatrix(){ const zoom=(typeof DS!=='undefined'?DS.zoom:1)||1; return Matrix2D.scale(zoom); },
      canvasMatrixInverse(){ return this.canvasMatrix().inverse(); },
      elementAABB(elOrId){ const r=this.getElementRect(elOrId); return r?AABB.fromRect(r):null; },
      allElementAABBs(){ const result=[]; document.querySelectorAll('.cr-element').forEach(el=>{const r=this.getElementRect(el); if(r) result.push({id:el.dataset.id,aabb:AABB.fromRect(r)});}); return result; },
      findOverlaps(){ const boxes=this.allElementAABBs(); const pairs=[]; for(let i=0;i<boxes.length;i++) for(let j=i+1;j<boxes.length;j++) if(boxes[i].aabb.overlaps(boxes[j].aabb)) pairs.push({a:boxes[i].id,b:boxes[j].id,mtv:boxes[i].aabb.mtv(boxes[j].aabb)}); return pairs; },
      getCanvasRect(){ return this.canvasRect(); },
      getElementRect(elOrId){ const el=(typeof elOrId==='string')?document.querySelector(`.cr-element[data-id="${elOrId}"]`):elOrId; return this.elementRect(el); },
      getSectionRect(secOrId){ const sec=(typeof secOrId==='string')?document.querySelector(`.cr-section[data-section-id="${secOrId}"]`):secOrId; if(!sec)return null; const zoom=(typeof DS!=='undefined'?DS.zoom:1)||1; const sR=sec.getBoundingClientRect();const cR=this.canvasRect(); return this._rect((sR.left-cR.left)/zoom,(sR.top-cR.top)/zoom,sR.width/zoom,sR.height/zoom); },
      zoom() { return (typeof DS !== 'undefined' ? DS.zoom : 1) || 1; },
      scale(v) { return v * this.zoom(); },
      unscale(v) { return v / this.zoom(); },
      modelToView(x, y) { const z = this.zoom(); return { x: x * z, y: y * z }; },
      viewToModel(clientX, clientY) { const z=this.zoom(); const cR=this.canvasRect(); return { x:(clientX-cR.left)/z, y:(clientY-cR.top)/z }; },
      rectToView(r) { const z=this.zoom(); return this._rect(r.x*z,r.y*z,r.w*z,r.h*z); },
      modelToScreen(x, y) { const dpr=window.devicePixelRatio||1; const r=this.canvasRect(); const ws=document.getElementById('workspace'); return { x:(x*this.zoom()+r.left-(ws?ws.scrollLeft:0))*dpr, y:(y*this.zoom()+r.top-(ws?ws.scrollTop:0))*dpr }; },
      screenToModel(sx, sy) { const dpr=window.devicePixelRatio||1; const r=this.canvasRect(); const ws=document.getElementById('workspace'); const z=this.zoom(); return { x:(sx/dpr-r.left+(ws?ws.scrollLeft:0))/z, y:(sy/dpr-r.top+(ws?ws.scrollTop:0))/z }; },
      snapModel(v, grid) { return (!grid || grid <= 0) ? v : Math.round(v / grid) * grid; },
      roundView(v) { return Math.round(v); },
    };
  }
  return { install };
})();

if (typeof module !== 'undefined') module.exports = { RuntimeGeometry, Matrix2D, AABB, MagneticSnap, PointerNorm };
if (typeof globalThis !== 'undefined') globalThis.RuntimeGeometry = RuntimeGeometry;
