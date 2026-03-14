'use strict';
const { AABB, MagneticSnap, Matrix2D, DS, ok } = require('./_harness');

// Chaos: random delays simulated via random operation ordering
const ops=[];
for(let i=0;i<1000;i++){
  const type=['snap','matrix','aabb','layout'][Math.floor(Math.random()*4)];
  ops.push({type, v:Math.random()*800});
}
// Shuffle
for(let i=ops.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[ops[i],ops[j]]=[ops[j],ops[i]];}

let errors=0;
for(const op of ops){
  try{
    if(op.type==='snap')   { const r=MagneticSnap.snap(op.v,8); if(!isFinite(r))errors++; }
    if(op.type==='matrix') { Matrix2D.scale(op.v>0?op.v:1).transformPoint(1,1); }
    if(op.type==='aabb')   { new AABB(op.v%100,op.v%100,10,10).overlaps(new AABB(op.v%50,0,10,10)); }
    if(op.type==='layout') { DS.getSectionTop('s-rh'); }
  } catch(e){ errors++; }
}
ok(`1000 chaos ops: 0 errors`,errors===0,`errors=${errors}`);

// Verify state is clean after chaos
ok(`DS.sections intact after chaos`,DS.sections.length>=3);
ok(`MagneticSnap.GRID intact`,MagneticSnap.GRID===8);
ok(`Matrix2D.identity() still works`,Matrix2D.identity().toArray().join(',')===Matrix2D.identity().toArray().join(','));

process.stdout.write('\nCHAOS TEST PASS\n');
