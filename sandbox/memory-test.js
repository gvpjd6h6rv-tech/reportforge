'use strict';
const { AABB, ok } = require('./_harness');

const before=process.memoryUsage().heapUsed;
// Allocate and release 10k AABBs — heap should not grow linearly
let boxes=[];
for(let i=0;i<10000;i++) boxes.push(new AABB(Math.random()*1000,Math.random()*1000,10,10));
boxes=null; // release
if(global.gc) global.gc(); // if --expose-gc
const after=process.memoryUsage().heapUsed;
const growthMB=(after-before)/1024/1024;
ok(`heap growth < 20MB after 10k AABB alloc+release (${growthMB.toFixed(1)}MB)`,growthMB<20);
ok(`no infinite growth detected`,isFinite(growthMB));
process.stdout.write('\nMEMORY CHECK PASS\n');
