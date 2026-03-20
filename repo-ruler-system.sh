#!/usr/bin/env bash
echo "════════════════════════════════════════"
echo "RF RULER SYSTEM CHECK"
echo "════════════════════════════════════════"
python3 reportforge_server.py &
PID=$!
sleep 3
node - <<'EOF'
const SUITE='REPO_RULER_SYSTEM';
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

  const rulers = await page.evaluate(()=>{
    const rv=document.getElementById('ruler-v');
    const rh=document.getElementById('ruler-h-canvas');
    const inner=document.getElementById('ruler-v-inner');
    const rhr=document.getElementById('ruler-h-row');
    const rc=document.getElementById('ruler-corner');
    function R(el){if(!el)return null;const r=el.getBoundingClientRect();
      return{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)};}
    const ws=document.getElementById('workspace');
    return{rv:R(rv),rh:R(rh),rhr:R(rhr),rc:R(rc),
           innerH:inner?.height,innerW:inner?.width,innerTop:inner?.style.top,
           wsClientH:ws?.clientHeight,
           rvBg:rv?getComputedStyle(rv).backgroundColor:null,
           rhBg:rh?getComputedStyle(rh).backgroundColor:null};
  });
  if(rulers.rv&&rulers.rv.w>0&&rulers.rv.h>0) ok('ruler-v visible: w='+rulers.rv.w+' h='+rulers.rv.h);
  else bad('ruler-v missing or zero size');
  if(rulers.rh&&rulers.rh.w>0&&rulers.rh.h>0) ok('ruler-h-canvas visible: w='+rulers.rh.w+' h='+rulers.rh.h);
  else bad('ruler-h-canvas missing or zero size');
  if(rulers.rhr&&rulers.rhr.h>0) ok('ruler-h-row visible: h='+rulers.rhr.h);
  else bad('ruler-h-row missing');
  if(rulers.rc) ok('ruler-corner exists');
  else bad('ruler-corner missing');
  if(rulers.innerH>=rulers.wsClientH) ok('v-ruler canvas fills workspace ('+rulers.innerH+'>='+rulers.wsClientH+')');
  else bad('v-ruler canvas too short: '+rulers.innerH+' < '+rulers.wsClientH+' (ruler appears cut off)');
  // Preview mode rulers
  await page.evaluate(()=>PreviewEngine.show());
  await page.waitForTimeout(200);
  const pv=await page.evaluate(()=>{
    const rv=document.getElementById('ruler-v');
    const rh=document.getElementById('ruler-h-canvas');
    const r=rv?.getBoundingClientRect();
    return{rvH:Math.round(r?.height||0),rvDisplay:getComputedStyle(rv||document.body).display,
           rhW:Math.round(rh?.getBoundingClientRect().width||0)};
  });
  await page.evaluate(()=>PreviewEngine.hide());
  if(pv.rvH>0) ok('ruler-v visible in preview: h='+pv.rvH);
  else bad('ruler-v not visible in preview mode');
  if(pv.rhW>0) ok('ruler-h-canvas visible in preview: w='+pv.rhW);
  else bad('ruler-h-canvas not visible in preview mode');
  console.log('\n──────────────────────────────');
  console.log(SUITE+': '+pass+' PASS, '+fail+' FAIL');
  await browser.close();
  if(fail>0)process.exit(1);
})().catch(e=>{console.log('FAIL: '+e.message.slice(0,150));process.exit(1);});
EOF
kill $PID 2>/dev/null
