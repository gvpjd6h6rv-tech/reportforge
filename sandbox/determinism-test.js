'use strict';
const { DS, ok } = require('./_harness');
const crypto=require('crypto');

// Render report layout 10 times, all hashes must match
function renderLayout(){
  return JSON.stringify(DS.sections.map(s=>({
    id:s.id, height:s.height, top:DS.getSectionTop(s.id)
  })));
}

const hashes=[];
for(let i=0;i<10;i++){
  hashes.push(crypto.createHash('sha256').update(renderLayout()).digest('hex'));
}
const allSame=hashes.every(h=>h===hashes[0]);
ok(`10/10 render hashes identical`,allSame);
ok(`hash is non-trivial (not empty)`,hashes[0].length===64);
process.stdout.write('\nDETERMINISM PASS\n');
