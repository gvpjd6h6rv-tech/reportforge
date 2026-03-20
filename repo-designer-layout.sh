#!/usr/bin/env bash
echo "════════════════════════════════════════"
echo "RF DESIGNER LAYOUT CHECK"
echo "════════════════════════════════════════"
python3 reportforge_server.py &
PID=$!
sleep 3
node - <<'EOF'
const SUITE='REPO_DESIGNER_LAYOUT';
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

  const layout = await page.evaluate(()=>{
    function R(id){const el=document.getElementById(id);if(!el)return null;
      const r=el.getBoundingClientRect();return{x:Math.round(r.x),y:Math.round(r.y),
      w:Math.round(r.width),h:Math.round(r.height)};}
    return{rv:R('ruler-v'),rh:R('ruler-h-canvas'),rhr:R('ruler-h-row'),
           ws:R('workspace'),vp:R('viewport'),cl:R('canvas-layer')};
  });
  const {rv,rh,rhr,ws,vp,cl}=layout;

  // Invariant 1: workspace starts at ruler right edge
  const wsExpectedX = rv.x+rv.w;
  if(Math.abs(ws.x-wsExpectedX)<=1) ok('workspaceX('+ws.x+') == rulerRight('+wsExpectedX+')');
  else bad('workspace overlaps ruler: ws.x='+ws.x+' rulerRight='+wsExpectedX);

  // Invariant 2: canvas does not overlap rulers
  if(cl.x >= rv.x+rv.w-1) ok('canvas('+cl.x+') right of ruler('+rv.w+'px wide)');
  else bad('canvas overlaps vertical ruler: cl.x='+cl.x+' < rv.right='+(rv.x+rv.w));

  // Invariant 3: canvas top below h-ruler
  if(cl.y >= rhr.y+rhr.h-1) ok('canvas.y('+cl.y+') below h-ruler-row('+rhr.h+'px)');
  else bad('canvas overlaps horizontal ruler: cl.y='+cl.y+' rhr.bottom='+(rhr.y+rhr.h));

  // Invariant 4: canvas not centered with large empty margin
  const offsetInWS = cl.x - ws.x;
  if(offsetInWS < 200) ok('canvas left offset in workspace: '+offsetInWS+'px < 200');
  else bad('canvas centered with large margin: offset='+offsetInWS+'px');

  // Invariant 5: canvas width is report width (754px ±2)
  if(Math.abs(cl.w-754)<=2) ok('canvas width='+cl.w+'px (~754)');
  else bad('canvas width unexpected: '+cl.w+'px');

  // Invariant 6: viewport.transform = none (zoom on viewport not canvas)
  const clT = await page.evaluate(()=>getComputedStyle(document.getElementById('canvas-layer')).transform);
  if(clT==='none') ok('canvas-layer transform=none (zoom on viewport)');
  else bad('canvas-layer has transform: '+clT);

  // Preview mode — same offsets
  await page.evaluate(()=>PreviewEngine.show());
  await page.waitForTimeout(100);
  const pvLayout = await page.evaluate(()=>{
    function R(id){const el=document.getElementById(id);if(!el)return null;
      const r=el.getBoundingClientRect();return{x:Math.round(r.x)};}
    return{ws:R('workspace'),cl:R('canvas-layer'),rv:R('ruler-v')};
  });
  await page.evaluate(()=>PreviewEngine.hide());
  if(pvLayout.ws.x===layout.ws.x) ok('preview workspaceX('+pvLayout.ws.x+')==design('+layout.ws.x+')');
  else bad('preview/design workspace offset mismatch: preview='+pvLayout.ws.x+' design='+layout.ws.x);
  if(pvLayout.cl.x===layout.cl.x) ok('preview canvasX('+pvLayout.cl.x+')==design('+layout.cl.x+')');
  else bad('preview/design canvas offset mismatch: preview='+pvLayout.cl.x+' design='+layout.cl.x);
  console.log('\n──────────────────────────────');
  console.log(SUITE+': '+pass+' PASS, '+fail+' FAIL');
  await browser.close();
  if(fail>0)process.exit(1);
})().catch(e=>{console.log('FAIL: '+e.message.slice(0,150));process.exit(1);});
EOF
kill $PID 2>/dev/null
