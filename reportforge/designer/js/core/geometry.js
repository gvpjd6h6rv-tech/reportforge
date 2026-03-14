/**
 * RF.Geometry v5.0 — Precision Geometry Engine
 * =============================================
 * Stage 1 deliverables (all runtime-verifiable):
 *   - Matrix2D: 2D affine transforms (translate/scale/rotate) at float64 precision
 *   - AABB: axis-aligned bounding box collision detection
 *   - MagneticSnap: grid snapping with 0.001px tolerance
 *   - PointerNorm: unified Mouse/Touch/Pen → canvas coordinates
 *   - DOMRect-based overlay positioning (existing, preserved)
 */

window.RF = window.RF || {};
const RF = window.RF;

/* ── Matrix2D ─────────────────────────────────────────────────────────────
 * Represents a 3×3 affine matrix stored as [a,b,c,d,e,f]:
 *   | a  c  e |
 *   | b  d  f |
 *   | 0  0  1 |
 */
class Matrix2D {
  constructor(a=1,b=0,c=0,d=1,e=0,f=0){ this.a=a;this.b=b;this.c=c;this.d=d;this.e=e;this.f=f; }
  static identity(){ return new Matrix2D(); }
  static translate(tx,ty){ return new Matrix2D(1,0,0,1,tx,ty); }
  static scale(sx,sy=sx){ return new Matrix2D(sx,0,0,sy,0,0); }
  static rotate(rad){
    const cos=Math.cos(rad),sin=Math.sin(rad);
    return new Matrix2D(cos,sin,-sin,cos,0,0);
  }
  /** Multiply: this × m */
  multiply(m){
    return new Matrix2D(
      this.a*m.a + this.c*m.b,
      this.b*m.a + this.d*m.b,
      this.a*m.c + this.c*m.d,
      this.b*m.c + this.d*m.d,
      this.a*m.e + this.c*m.f + this.e,
      this.b*m.e + this.d*m.f + this.f
    );
  }
  /** Transform a point {x,y} */
  transformPoint(x,y){ return { x: this.a*x + this.c*y + this.e, y: this.b*x + this.d*y + this.f }; }
  /** Inverse (assumes invertible) */
  inverse(){
    const det = this.a*this.d - this.b*this.c;
    if(Math.abs(det)<1e-10) return Matrix2D.identity();
    const id=1/det;
    return new Matrix2D(
       this.d*id, -this.b*id,
      -this.c*id,  this.a*id,
      (this.c*this.f - this.d*this.e)*id,
      (this.b*this.e - this.a*this.f)*id
    );
  }
  /** CSS transform string */
  toCSSMatrix(){ return `matrix(${this.a},${this.b},${this.c},${this.d},${this.e},${this.f})`; }
  toArray(){ return [this.a,this.b,this.c,this.d,this.e,this.f]; }
}

/* ── AABB ─────────────────────────────────────────────────────────────────
 * Axis-Aligned Bounding Box: {x,y,w,h} in pre-transform canvas space.
 */
class AABB {
  constructor(x,y,w,h){ this.x=x;this.y=y;this.w=w;this.h=h; }
  get x2(){ return this.x+this.w; }
  get y2(){ return this.y+this.h; }
  get cx(){ return this.x+this.w/2; }
  get cy(){ return this.y+this.h/2; }
  /** True if this overlaps other (touching edges = no overlap) */
  overlaps(other){
    return this.x < other.x2 && this.x2 > other.x &&
           this.y < other.y2 && this.y2 > other.y;
  }
  /** Intersection rectangle or null */
  intersection(other){
    const ix=Math.max(this.x,other.x), iy=Math.max(this.y,other.y);
    const ix2=Math.min(this.x2,other.x2), iy2=Math.min(this.y2,other.y2);
    if(ix>=ix2||iy>=iy2) return null;
    return new AABB(ix,iy,ix2-ix,iy2-iy);
  }
  /** Minimum translation vector to separate from other */
  mtv(other){
    if(!this.overlaps(other)) return {dx:0,dy:0};
    const ox=Math.min(this.x2-other.x, other.x2-this.x);
    const oy=Math.min(this.y2-other.y, other.y2-this.y);
    return ox<oy ? {dx:(this.cx<other.cx?-ox:ox),dy:0} : {dx:0,dy:(this.cy<other.cy?-oy:oy)};
  }
  /** Expand by margin */
  expand(m){ return new AABB(this.x-m,this.y-m,this.w+m*2,this.h+m*2); }
  /** From a DOM element rect in canvas space */
  static fromRect(r){ return new AABB(r.x,r.y,r.w,r.h); }
}

/* ── MagneticSnap ─────────────────────────────────────────────────────────
 * Grid snapping with configurable grid and 0.001px tolerance.
 */
const MagneticSnap = {
  GRID: 8,        // design token grid (px)
  TOLERANCE: 4,   // snap radius in canvas px
  PRECISION: 1e-3, // 0.001px

  /** Snap a value to nearest grid multiple */
  snap(v, grid=this.GRID){
    const snapped = Math.round(v / grid) * grid;
    const delta = Math.abs(v - snapped);
    return delta <= this.TOLERANCE ? +snapped.toFixed(3) : +v.toFixed(3);
  },
  /** Snap a point {x,y} */
  snapPoint(x, y, grid=this.GRID){
    return { x: this.snap(x,grid), y: this.snap(y,grid) };
  },
  /** Snap point to nearest of: grid, other element edges, center lines */
  snapWithGuides(x, y, guides=[]){
    let sx=this.snap(x), sy=this.snap(y);
    for(const g of guides){
      if(Math.abs(x-g.x) < this.TOLERANCE){ sx=+g.x.toFixed(3); }
      if(Math.abs(y-g.y) < this.TOLERANCE){ sy=+g.y.toFixed(3); }
    }
    return {x:sx, y:sy};
  },
  /** Verify a value is on-grid within PRECISION */
  isOnGrid(v, grid=this.GRID){
    // Use round-trip to avoid floating-point modulo artifacts
    const nearest = Math.round(v / grid) * grid;
    return Math.abs(v - nearest) < this.PRECISION + Number.EPSILON * grid;
  },
};

/* ── PointerNorm ──────────────────────────────────────────────────────────
 * Unified Mouse/Touch/Pen → pre-transform canvas coordinates.
 */
const PointerNorm = {
  /** Extract clientX/Y from any pointer/mouse/touch event */
  clientPos(e){
    if(e.touches && e.touches.length > 0) return {x:e.touches[0].clientX, y:e.touches[0].clientY};
    if(e.changedTouches && e.changedTouches.length > 0) return {x:e.changedTouches[0].clientX, y:e.changedTouches[0].clientY};
    return {x:e.clientX||0, y:e.clientY||0};
  },
  /** Convert client coords → pre-transform canvas space */
  toCanvas(e){
    const {x,y} = this.clientPos(e);
    return RF.Geometry.toCanvasSpace(x, y);
  },
  /** Pointer pressure (1.0 for mouse, real value for pen) */
  pressure(e){ return (e.pressure !== undefined && e.pressure > 0) ? e.pressure : 1.0; },
  /** Pointer type string */
  type(e){ return e.pointerType || (e.touches ? 'touch' : 'mouse'); },
};

/* ── RF.Geometry v5 ───────────────────────────────────────────────────────
 * Extends the existing geometry module with Stage 1 capabilities.
 */
RF.Geometry = Object.assign(RF.Geometry || {}, {
  // Stage 1 additions
  Matrix2D,
  AABB,
  MagneticSnap,
  PointerNorm,

  /** Build canvas transform matrix from current zoom */
  canvasMatrix(){
    const zoom = (typeof DS !== 'undefined' ? DS.zoom : 1) || 1;
    return Matrix2D.scale(zoom);
  },
  /** Build inverse canvas matrix (screen → model) */
  canvasMatrixInverse(){
    return this.canvasMatrix().inverse();
  },
  /** Get AABB for a .cr-element in canvas space */
  elementAABB(elOrId){
    const r = this.getElementRect(elOrId);
    return r ? AABB.fromRect(r) : null;
  },
  /** Get all element AABBs in canvas space */
  allElementAABBs(){
    const result = [];
    document.querySelectorAll('.cr-element').forEach(el => {
      const r = this.getElementRect(el);
      if(r) result.push({id:el.dataset.id, aabb: AABB.fromRect(r)});
    });
    return result;
  },
  /** Detect overlapping pairs */
  findOverlaps(){
    const boxes = this.allElementAABBs();
    const pairs = [];
    for(let i=0;i<boxes.length;i++){
      for(let j=i+1;j<boxes.length;j++){
        if(boxes[i].aabb.overlaps(boxes[j].aabb)){
          pairs.push({a:boxes[i].id, b:boxes[j].id, mtv:boxes[i].aabb.mtv(boxes[j].aabb)});
        }
      }
    }
    return pairs;
  },
});

window.RF = RF;
