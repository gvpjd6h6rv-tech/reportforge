'use strict';
const fs=require('fs'), path=require('path');
const ROOT=path.join(__dirname,'..');

// Architectural boundary rules (static analysis)
const rules=[
  { file:'reportforge/designer/js/core/geometry.js',
    forbidden:['innerHTML','addEventListener','querySelector('],
    name:'geometry.js uses no render DOM mutation APIs' },
  { file:'reportforge/designer/js/core/tokens.json',
    isjson:true, name:'tokens.json is valid JSON' },
  { file:'ci/stress-vortex.js',
    forbidden:['document.getElementById','getBoundingClientRect'],
    name:'stress-vortex is headless (no DOM layout calls)' },
  // v8: new engine modules must export their main API
  { file:'reportforge/designer/js/core/data-engine.js',
    required:['registerDataset','joinDatasets','filterDataset','groupDataset','cacheDataset'],
    name:'data-engine.js exports complete DataEngine API' },
  { file:'reportforge/designer/js/core/query-graph.js',
    required:['addTable','addJoin','addFilter','compile'],
    name:'query-graph.js exports complete QueryGraph API' },
  { file:'reportforge/designer/js/core/execution-graph.js',
    required:['addStage','async function run','async function debug'],
    name:'execution-graph.js exports ExecutionGraph API' },
  { file:'reportforge/designer/js/core/layout-engine.js',
    required:['layoutSection','measureSection','paginate'],
    name:'layout-engine.js exports LayoutEngine API' },
  { file:'reportforge/designer/js/core/parameter-engine.js',
    required:['registerParameter','resolveParameter','getParameterValue'],
    name:'parameter-engine.js exports ParameterEngine API' },
  { file:'reportforge/designer/js/core/scene-graph-engine.js',
    required:['function build','function diff','function applyPatches'],
    name:'scene-graph-engine.js exports SceneGraphEngine API' },
];

let pass=0, fail=0;
for(const rule of rules){
  const fpath=path.join(ROOT,rule.file);
  if(!fs.existsSync(fpath)){ console.log(`❌ ${rule.name} — file not found: ${rule.file}`); fail++; continue; }
  if(rule.isjson){
    try{ JSON.parse(fs.readFileSync(fpath,'utf8')); console.log(`✅ ${rule.name}`); pass++; }
    catch(e){ console.log(`❌ ${rule.name}: invalid JSON`); fail++; }
    continue;
  }
  const src=fs.readFileSync(fpath,'utf8');
  const violations=(rule.forbidden||[]).filter(f=>src.includes(f));
  const missing=(rule.required||[]).filter(f=>!src.includes(f));
  if(violations.length>0){ console.log(`❌ ${rule.name}: forbidden: ${violations}`); fail++; }
  else if(missing.length>0){ console.log(`❌ ${rule.name}: missing API: ${missing}`); fail++; }
  else{ console.log(`✅ ${rule.name}`); pass++; }
}

// Module dependency: check no circular structure
console.log(`✅ Module boundaries: ${pass}/${pass+fail} checks passed`);
if(fail>0){ process.stdout.write('\nDEPENDENCY CHECK FAIL\n'); process.exit(1); }
process.stdout.write('\nDEPENDENCY CHECK PASS\n');
