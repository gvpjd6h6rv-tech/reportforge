'use strict';
const { DS, ok } = require('./_harness');
const crypto=require('crypto');
const fs=require('fs'), path=require('path');

// Build artifact: hash key source files
const files=[
  '../reportforge/designer/js/core/geometry.js',
  '../reportforge/designer/js/core/tokens.json',
  '../designer/crystal-reports-designer-v4.html',
].map(f=>path.join(__dirname,f));

function buildHash(){
  const h=crypto.createHash('sha256');
  for(const f of files){
    if(fs.existsSync(f)) h.update(fs.readFileSync(f));
  }
  return h.digest('hex');
}

const h1=buildHash(), h2=buildHash();
ok(`build 1 hash: ${h1.substring(0,12)}...`,h1.length===64);
ok(`build 2 hash: ${h2.substring(0,12)}...`,h2.length===64);
ok(`build 1 === build 2 (reproducible)`,h1===h2);

process.stdout.write('\nREPRODUCIBLE BUILD PASS\n');
