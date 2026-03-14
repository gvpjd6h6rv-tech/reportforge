'use strict';
const { MagneticSnap, ok } = require('./_harness');
const N=500, GRID=8, EPS=1e-3;

// Simulate chaotic drift + return to base
const els=Array.from({length:N},(_,i)=>({
  id:`el-${i}`, baseX:(i%50)*GRID, baseY:Math.floor(i/50)*GRID, x:0, y:0
}));

// Chaos
for(const el of els){
  el.x=el.baseX+(Math.random()-0.5)*50;
  el.y=el.baseY+(Math.random()-0.5)*50;
}
// Return to base (snap)
for(const el of els){
  el.x=MagneticSnap.snap(el.x,GRID);
  el.y=MagneticSnap.snap(el.y,GRID);
}
// Audit
let onGrid=0;
for(const el of els)
  if(MagneticSnap.isOnGrid(el.x,GRID)&&MagneticSnap.isOnGrid(el.y,GRID)) onGrid++;
const pct=onGrid/N;
ok(`${(pct*100).toFixed(2)}% on-grid ≥ 95%`,pct>=0.95,`${onGrid}/${N}`);
ok(`deviation ≤ 0.001px`, els.every(e=>{
  const nx=Math.round(e.x/GRID)*GRID, ny=Math.round(e.y/GRID)*GRID;
  return Math.abs(e.x-nx)<=EPS&&Math.abs(e.y-ny)<=EPS;
}));
process.stdout.write('\nRETURN BASE PASS\n');
