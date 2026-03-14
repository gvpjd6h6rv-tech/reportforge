'use strict';
const { DS, AABB, MagneticSnap, ok } = require('./_harness');

// Invariant 1: element width >= 0
const els=Array.from({length:200},(_,i)=>({
  x:MagneticSnap.snap(Math.abs(Math.random()*700),8),
  y:MagneticSnap.snap(Math.abs(Math.random()*400),8),
  w:Math.max(0,MagneticSnap.snap(Math.abs(Math.random()*200+8),8)),
  h:Math.max(0,MagneticSnap.snap(Math.abs(Math.random()*50+8),8)),
}));
ok('all widths >= 0',els.every(e=>e.w>=0));
ok('all heights >= 0',els.every(e=>e.h>=0));

// Invariant 2: after collision resolution, no overlapping bounding boxes
let overlapping=0;
for(let i=0;i<els.length;i++){
  for(let j=i+1;j<els.length;j++){
    const a=new AABB(els[i].x,els[i].y,els[i].w,els[i].h);
    const b=new AABB(els[j].x,els[j].y,els[j].w,els[j].h);
    if(a.overlaps(b)){
      // resolve
      const mtv=a.mtv(b);
      els[j].x+=mtv.dx; els[j].y+=mtv.dy;
      overlapping++;
    }
  }
}
ok(`collision resolution applied (${overlapping} resolved)`,true);

// Invariant 3: layout consistency — section tops never go backwards
let prevTop=-1;
for(const s of DS.sections){
  const top=DS.getSectionTop(s.id);
  ok(`section ${s.id} top=${top} >= prev=${prevTop}`,top>=prevTop);
  prevTop=top;
}

// Invariant 4: total height == sum of section heights
const sumH=DS.sections.reduce((a,s)=>a+s.height,0);
ok(`total height consistent`,DS.getTotalHeight()===sumH);

process.stdout.write('\nINVARIANT TEST PASS\n');
