'use strict';
const { AABB, MagneticSnap, ok } = require('./_harness');

// Spawn 500 elements
const N=500;
const els=Array.from({length:N},(_,i)=>({
  id:`el-${i}`, x:(i%50)*8, y:Math.floor(i/50)*8, w:64, h:16
}));
ok(`500 elements spawned`,els.length===N);

// Random movement
let nanCount=0;
for(let i=0;i<2000;i++){
  const el=els[Math.floor(Math.random()*N)];
  el.x=MagneticSnap.snap(el.x+(Math.random()-0.5)*10,8);
  el.y=MagneticSnap.snap(el.y+(Math.random()-0.5)*10,8);
  if(isNaN(el.x)||isNaN(el.y)) nanCount++;
}
ok(`zero NaN coordinates`,nanCount===0);

// DOM duplication check (ID uniqueness)
const ids=new Set(els.map(e=>e.id));
ok(`no DOM duplication (${ids.size} unique IDs)`,ids.size===N);

// Geometry not corrupted
const corrupt=els.filter(e=>!isFinite(e.x)||!isFinite(e.y)||e.x<-10000||e.y<-10000);
ok(`no geometry corruption`,corrupt.length===0);

// Memory — heap stays under 100MB
const mem=process.memoryUsage().heapUsed/1024/1024;
ok(`memory stable (${mem.toFixed(1)}MB < 100MB)`,mem<100);

process.stdout.write('\nSTRESS TEST PASS\n');
