#!/usr/bin/env bash
echo "════════════════════════════════════════"
echo "RF LAYOUT ENGINE VALIDATION"
echo "════════════════════════════════════════"
python3 reportforge_server.py &
PID=$!
sleep 3
node - <<'EOF'
const SUITE='REPO_LAYOUT_ENGINE';
const {chromium} = require('playwright');
const fs = require('fs');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport:{width:1400,height:900} });
  await page.goto('http://localhost:8080/classic');
  await page.waitForTimeout(2000);
  let pass=0,fail=0;
  function ok(m){console.log('PASS: '+m);pass++;}
  function bad(m){console.log('FAIL: '+m);fail++;}

  const le = await page.evaluate(()=>{
    function R(id){const el=document.getElementById(id);if(!el)return{x:0,y:0,w:0,h:0};
      const r=el.getBoundingClientRect();return{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)};}
    const rv=R('ruler-v'),rhr=R('ruler-h-row'),cl=R('canvas-layer'),ws=R('workspace');
    // Layout formula
    const expectedCanvasX = rv.x+rv.w;
    const expectedCanvasY = rhr.y+rhr.h;
    // Page margin offset (CFG values)
    const pgMarginL = CFG?.PAGE_MARGIN_LEFT||0;
    const pgMarginT = CFG?.PAGE_MARGIN_TOP||0;
    return{rv,rhr,cl,ws,expectedCanvasX,expectedCanvasY,
           clActualX:cl.x,clActualY:cl.y,pgMarginL,pgMarginT,
           formulaDeltaX:cl.x-(rv.x+rv.w),
           formulaDeltaY:cl.y-(rhr.y+rhr.h)};
  });
  ok('canvasX='+le.clActualX+'  rulerRight='+(le.rv.x+le.rv.w)+'  delta='+le.formulaDeltaX+'px');
  ok('canvasY='+le.clActualY+'  hRulerBottom='+(le.rhr.y+le.rhr.h)+'  delta='+le.formulaDeltaY+'px');
  if(le.formulaDeltaX>=0) ok('canvas starts at or right of vertical ruler');
  else bad('canvas overlaps vertical ruler by '+Math.abs(le.formulaDeltaX)+'px');
  if(le.formulaDeltaY>=0) ok('canvas starts at or below horizontal ruler');
  else bad('canvas overlaps horizontal ruler by '+Math.abs(le.formulaDeltaY)+'px');
  // workspace = ruler right edge
  if(Math.abs(le.ws.x-(le.rv.x+le.rv.w))<=1) ok('workspace starts at ruler right edge');
  else bad('workspace does not start at ruler right edge: ws.x='+le.ws.x+' expected='+(le.rv.x+le.rv.w));
  // Preview mode
  await page.evaluate(()=>PreviewEngine.show()); await page.waitForTimeout(100);
  const pvLE = await page.evaluate(()=>{
    function R(id){const el=document.getElementById(id);if(!el)return{x:0};const r=el.getBoundingClientRect();return{x:Math.round(r.x),y:Math.round(r.y)};}
    return{cl:R('canvas-layer'),ws:R('workspace')};
  });
  await page.evaluate(()=>PreviewEngine.hide());
  if(pvLE.ws.x===le.ws.x) ok('preview workspace offset == design offset ('+pvLE.ws.x+')');
  else bad('preview workspace offset mismatch: '+pvLE.ws.x+' vs '+le.ws.x);
  console.log('\n──────────────────────────────');
  console.log(SUITE+': '+pass+' PASS, '+fail+' FAIL');
  await browser.close();
  if(fail>0)process.exit(1);
})().catch(e=>{console.log('FAIL: '+e.message.slice(0,150));process.exit(1);});
EOF
kill $PID 2>/dev/null
