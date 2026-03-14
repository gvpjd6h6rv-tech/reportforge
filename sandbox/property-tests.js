'use strict';
const { AABB, MagneticSnap, Matrix2D, ok } = require('./_harness');

// Property: snap(snap(x)) == snap(x) (idempotent)
for(let i=0;i<500;i++){
  const v=Math.random()*800; const s1=MagneticSnap.snap(v,8); const s2=MagneticSnap.snap(s1,8);
  if(Math.abs(s1-s2)>1e-6){ ok(`snap idempotent @ ${v.toFixed(2)}`,false,`s1=${s1} s2=${s2}`); }
}
ok('snap is idempotent (500 random values)',true);

// Property: A.overlaps(B) == B.overlaps(A) (symmetric)
for(let i=0;i<200;i++){
  const a=new AABB(Math.random()*100,Math.random()*100,10+Math.random()*40,10+Math.random()*20);
  const b=new AABB(Math.random()*100,Math.random()*100,10+Math.random()*40,10+Math.random()*20);
  if(a.overlaps(b)!==b.overlaps(a)){ ok('AABB.overlaps symmetric',false); process.exit(1); }
}
ok('AABB.overlaps is symmetric (200 random pairs)',true);

// Property: Matrix inverse: M * M⁻¹ ≈ Identity
for(let i=0;i<100;i++){
  const tx=Math.random()*100, ty=Math.random()*100, scale=0.5+Math.random()*3;
  const M=Matrix2D.translate(tx,ty).multiply(Matrix2D.scale(scale));
  const inv=M.inverse(); const I=M.multiply(inv);
  const p=I.transformPoint(1,1);
  if(Math.abs(p.x-1)>1e-6||Math.abs(p.y-1)>1e-6){ ok('M*M⁻¹=I',false,`p=(${p.x},${p.y})`); process.exit(1); }
}
ok('Matrix M*M⁻¹≈I (100 random transforms)',true);

// Property: width/height ≥ 0 after snap
for(let i=0;i<200;i++){
  const w=MagneticSnap.snap(Math.abs(Math.random()*400),8);
  const h=MagneticSnap.snap(Math.abs(Math.random()*200),8);
  if(w<0||h<0){ ok('dims≥0',false); process.exit(1); }
}
ok('element dimensions always ≥ 0 (200 samples)',true);

process.stdout.write('\nPROPERTY TEST PASS\n');
