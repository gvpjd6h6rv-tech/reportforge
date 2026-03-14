'use strict';
const { DS, Matrix2D, MagneticSnap, ok } = require('./_harness');

const REPS=100;
const t0=Date.now();
for(let i=0;i<REPS;i++){
  // Simulate render: accumulate section tops + transform per element
  for(const s of DS.sections){
    const top=DS.getSectionTop(s.id);
    const m=Matrix2D.scale(1.0).multiply(Matrix2D.translate(0,top));
    m.transformPoint(0,0);
  }
}
const ms=Date.now()-t0;
ok(`100 render cycles < 200ms (${ms}ms)`,ms<200);

// Snap throughput
const t1=Date.now();
for(let i=0;i<10000;i++) MagneticSnap.snap(Math.random()*800,8);
const ms2=Date.now()-t1;
ok(`10k snap ops < 100ms (${ms2}ms)`,ms2<100);

process.stdout.write('\nPERFORMANCE BASELINE PASS\n');
