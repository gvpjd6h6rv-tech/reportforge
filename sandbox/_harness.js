'use strict';
const path = require('path');
const fs   = require('fs');

// Load geometry.js into sandbox
const geoSrc = fs.readFileSync(path.join(__dirname,'../reportforge/designer/js/core/geometry.js'),'utf8');
const sandbox = { window: { RF: {} } };
new Function('window', geoSrc)(sandbox.window);
const GEO = sandbox.window.RF.Geometry;
const { Matrix2D, AABB, MagneticSnap } = GEO;

// Minimal DS stub
const DS = {
  zoom: 1.0, previewZoom: 1.0,
  sections: [
    {id:'s-rh',stype:'rh',label:'Report Header', abbr:'RH',height:110},
    {id:'s-ph',stype:'ph',label:'Page Header',   abbr:'PH',height:80},
    {id:'s-d1',stype:'det',label:'Detail',        abbr:'D', height:14,iterates:'items'},
    {id:'s-pf',stype:'pf',label:'Page Footer',   abbr:'PF',height:120},
    {id:'s-rf',stype:'rf',label:'Report Footer', abbr:'RF',height:30},
  ],
  elements: [],
  getSectionTop(id){
    let top=0;
    for(const s of this.sections){ if(s.id===id)return top; top+=s.height; }
    return 0;
  },
  getTotalHeight(){ return this.sections.reduce((a,s)=>a+s.height,0); },
  getElementById(id){ return this.elements.find(e=>e.id===id)||null; },
};

let _pass=0, _fail=0;
function ok(label,cond,note=''){
  process.stdout.write(`  ${cond?'✅':'❌'} ${label}${note?' | '+note:''}\n`);
  if(cond)_pass++; else _fail++;
}
function done(stageName){
  const total=_pass+_fail;
  const pct=total>0?(_pass/total*100).toFixed(1):'100.0';
  process.stdout.write(`\n${stageName} — ${pct}% (${_pass}/${total})\n`);
  if(_fail>0){ process.stdout.write(`FAIL: ${_fail} tests failed\n`); process.exit(1); }
  process.stdout.write(`${stageName.split(' ').slice(-1)[0].toUpperCase().replace(/[^A-Z ]/g,'')} PASS\n`);
  // print the required exact stage log line — caller does it
}

module.exports = { GEO, Matrix2D, AABB, MagneticSnap, DS, ok, done,
                   get pass(){ return _pass; }, get fail(){ return _fail; } };
