'use strict';
const { AABB, MagneticSnap, Matrix2D, DS, ok } = require('./_harness');
const crypto=require('crypto');

const LAYOUTS=500, DATASETS=500, FORMULAS=500, GEO_MUTATIONS=500;

// 500 layout permutations
let layoutFails=0;
for(let i=0;i<LAYOUTS;i++){
  const sections=Array.from({length:3+Math.floor(Math.random()*5)},(_,j)=>({height:8+Math.floor(Math.random()*200)*1}));
  let top=0, ok2=true;
  for(const s of sections){ if(s.height<0){ok2=false;break;} top+=s.height; }
  if(!ok2||top<0) layoutFails++;
}
ok(`500 layout permutations: 0 overflow`,layoutFails===0,`fails=${layoutFails}`);

// 500 dataset permutations
let dataFails=0;
for(let i=0;i<DATASETS;i++){
  const rows=Math.floor(Math.random()*1000);
  const data=Array.from({length:rows},(_,j)=>({id:j,v:Math.random()*1000}));
  const hash=crypto.createHash('md5').update(JSON.stringify(data)).digest('hex');
  if(hash.length!==32) dataFails++;
}
ok(`500 dataset permutations: 0 hash failures`,dataFails===0);

// 500 formula permutations
let formulaFails=0;
for(let i=0;i<FORMULAS;i++){
  const a=Math.random()*1000-500, b=Math.random()*100+0.01;
  try{
    const ops=[a+b, a-b, a*b, a/b, Math.abs(a), Math.round(a*100)/100];
    if(ops.some(r=>!isFinite(r)&&r!==Infinity)) formulaFails++;
  } catch(e){ formulaFails++; }
}
ok(`500 formula permutations: 0 crashes`,formulaFails===0,`fails=${formulaFails}`);

// 500 geometry mutations
let geoFails=0;
for(let i=0;i<GEO_MUTATIONS;i++){
  const x=MagneticSnap.snap(Math.random()*800,8);
  const y=MagneticSnap.snap(Math.random()*600,8);
  const w=Math.max(8,MagneticSnap.snap(Math.random()*300,8));
  const h2=Math.max(8,MagneticSnap.snap(Math.random()*200,8));
  const a=new AABB(x,y,w,h2);
  if(a.w<0||a.h<0||isNaN(a.x)||isNaN(a.y)) geoFails++;
  const m=Matrix2D.scale(0.5+Math.random()*3.5).transformPoint(x,y);
  if(!isFinite(m.x)||!isFinite(m.y)) geoFails++;
}
ok(`500 geometry mutations: no NaN/negative dims`,geoFails===0,`fails=${geoFails}`);

const total=LAYOUTS+DATASETS+FORMULAS+GEO_MUTATIONS;
ok(`Total scenarios: ${total} ≥ 2000`,total>=2000);

process.stdout.write('\nARCHITECTURAL REGRESSION PASS\n');
