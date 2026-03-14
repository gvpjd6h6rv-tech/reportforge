'use strict';
const { GEO, Matrix2D, AABB, MagneticSnap, ok } = require('./_harness');
const EPS = 1e-3;
const near = (a,b,e=EPS) => Math.abs(a-b)<=e;

// Zoom precision
[0.25,0.5,0.75,1,1.5,2,3,4].forEach(z=>{
  const m=Matrix2D.scale(z); const p=m.transformPoint(100,100);
  ok(`zoom ${z*100}% precision: 100px → ${p.x}px`,near(p.x,100*z,1e-3)&&near(p.y,100*z,1e-3));
});
// Grid snapping
[[7.9,8],[15.6,16],[23.3,24],[0.4,0],[3.9,4],[100.4,100]].forEach(([v,exp])=>{
  const s=MagneticSnap.snap(v,8); ok(`snap(${v})=${s} expect ${exp}`,near(s,exp));
});
// Collision detection
const a=new AABB(0,0,10,10), b=new AABB(5,5,10,10), c=new AABB(20,20,5,5);
ok('overlap a∩b',a.overlaps(b)); ok('no overlap a∩c',!a.overlaps(c));
const mtv=a.mtv(b); ok('MTV resolves',Math.abs(mtv.dx)+Math.abs(mtv.dy)>0);
// Sub-pixel precision
for(let i=0;i<100;i++){
  const v=Math.random()*800; const s=MagneticSnap.snap(v,8);
  const nearest=Math.round(v/8)*8;
  if(Math.abs(v-nearest)<=MagneticSnap.TOLERANCE)
    ok(`sub-px snap precision`,Math.abs(s-nearest)<=1e-3);
}
process.stdout.write('\nGEOMETRY TEST PASS\n');
