#!/usr/bin/env bash
echo "════════════════════════════════════════"
echo "RF DESIGNER VISUAL CHECK"
echo "════════════════════════════════════════"
python3 reportforge_server.py &
PID=$!
sleep 3
node - <<'EOF'
const SUITE='REPO_DESIGNER_VISUAL';
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

  const visual = await page.evaluate(()=>{
    function cs(id,p){const el=document.getElementById(id);return el?getComputedStyle(el)[p]:null;}
    const rv=document.getElementById('ruler-v');
    const rh=document.getElementById('ruler-h-canvas');
    const inner=document.getElementById('ruler-v-inner');
    // Check ruler background (Crystal Reports: D4D0C8 ≈ light gray/beige)
    const rvBg=cs('ruler-v','backgroundColor');
    const rvrTop=rv?.getBoundingClientRect();
    // Check canvas background = white
    const clBg=cs('canvas-layer','backgroundColor');
    // Check section labels hidden
    const sectionLabels=[...document.querySelectorAll('.section-label')];
    const labelsHidden=sectionLabels.every(l=>getComputedStyle(l).display==='none');
    // Check ruler-v-inner fills workspace
    const wsH=document.getElementById('workspace')?.clientHeight||0;
    const innerH=inner?.height||0;
    return{rvBg,clBg,sectionLabelsCount:sectionLabels.length,labelsHidden,wsH,innerH,
           rvW:rv?.getBoundingClientRect().width,rvH:rv?.getBoundingClientRect().height};
  });
  if(visual.rvH>0) ok('vertical ruler visible (h='+visual.rvH+'px)');
  else bad('vertical ruler not visible');
  if(visual.rvW>0) ok('vertical ruler has width (w='+visual.rvW+'px)');
  else bad('vertical ruler zero width');
  if(visual.innerH>=visual.wsH) ok('ruler canvas fills workspace ('+visual.innerH+'>='+visual.wsH+'px)');
  else bad('ruler canvas too short: '+visual.innerH+'px < workspace '+visual.wsH+'px (vertical ruler appears cut off)');
  if(visual.clBg==='rgb(255, 255, 255)') ok('canvas background white');
  else bad('canvas background unexpected: '+visual.clBg);
  if(visual.labelsHidden) ok('section labels hidden (count='+visual.sectionLabelsCount+')');
  else bad('section labels visible (count='+visual.sectionLabelsCount+')');
  // Check ruler not blurred (must NOT be inside a scaled container)
  const blur = await page.evaluate(()=>{
    let el=document.getElementById('ruler-v');
    while(el&&el!==document.body){
      const t=getComputedStyle(el).transform;
      if(t&&t!=='none'&&!t.includes('scale(1)')){return{blurred:true,el:el.id,t};}
      el=el.parentElement;
    }
    return{blurred:false};
  });
  if(!blur.blurred) ok('rulers not inside scaled container (crisp)');
  else bad('ruler inside scaled container → blurred: '+blur.el+' '+blur.t);
  console.log('\n──────────────────────────────');
  console.log(SUITE+': '+pass+' PASS, '+fail+' FAIL');
  await browser.close();
  if(fail>0)process.exit(1);
})().catch(e=>{console.log('FAIL: '+e.message.slice(0,150));process.exit(1);});
EOF
kill $PID 2>/dev/null
