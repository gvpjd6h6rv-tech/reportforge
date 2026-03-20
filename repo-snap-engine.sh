#!/usr/bin/env bash
echo "════════════════════════════════════════"
echo "RF SNAP ENGINE TEST"
echo "════════════════════════════════════════"
python3 reportforge_server.py &
PID=$!
sleep 3
node - <<'EOF'
const SUITE='REPO_SNAP_ENGINE';
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

  // Align two elements so guides fire
  const setup = await page.evaluate(()=>{
    const e0=DS.elements[0],e1=DS.elements[1];
    if(!e0||!e1)return{skip:true};
    const s=e1.y; e1.y=e0.y; CanvasEngine.renderAll();
    return{skip:false,e0id:e0.id,savedY:s};
  });
  if(setup.skip){console.log('SKIP: not enough elements');process.exit(0);}
  // Trigger guides
  const g1 = await page.evaluate(([id,sy])=>{
    DS.selection.add(id); AlignmentGuides.show(id);
    const n=document.querySelectorAll('.rf-guide,.snap-guide').length;
    AlignmentGuides.clear(); DS.selection.clear();
    DS.elements[1].y=sy; CanvasEngine.renderAll();
    return n;
  },[setup.e0id,setup.savedY]);
  if(g1>0) ok('guides appear during alignment ('+g1+' guides)');
  else bad('no guides produced by AlignmentGuides.show()');
  // Guide count bounded (no duplicates)
  const g2 = await page.evaluate(([id,sy])=>{
    DS.elements[1].y=DS.elements[0].y; CanvasEngine.renderAll();
    DS.selection.add(id); AlignmentGuides.show(id); AlignmentGuides.show(id);
    const n=document.querySelectorAll('.rf-guide,.snap-guide').length;
    AlignmentGuides.clear(); DS.selection.clear();
    DS.elements[1].y=sy; CanvasEngine.renderAll();
    return n;
  },[setup.e0id,setup.savedY]);
  if(g2<=30) ok('guide count bounded after 2× show() ('+g2+')');
  else bad('guide duplication ('+g2+' > 30)');
  // Guides cleared after drag
  const el=await page.$('.rf-el,.cr-element');
  if(el){
    const bb=await el.boundingBox();
    await page.mouse.move(bb.x+4,bb.y+4);
    await page.mouse.down();
    await page.mouse.move(bb.x+20,bb.y+4);
    await page.waitForTimeout(150);
    await page.mouse.up();
    await page.waitForTimeout(100);
    const after=await page.evaluate(()=>document.querySelectorAll('.rf-guide,.snap-guide').length);
    if(after===0) ok('guides cleared after mouseup');
    else bad('guides persist after mouseup: '+after);
  }
  // MagneticSnap API
  const snap=await page.evaluate(()=>{
    const s=window.RF?.Geometry?.MagneticSnap;
    if(!s)return{ok:false};
    return{ok:true,s8:Math.abs(s.snap(7.9,8)-8)<0.001,s16:Math.abs(s.snap(16.1,8)-16)<0.001,
           idem:Math.abs(s.snap(s.snap(5.3,8),8)-s.snap(5.3,8))<0.001};
  });
  if(snap.ok&&snap.s8&&snap.s16&&snap.idem) ok('MagneticSnap precision correct');
  else bad('MagneticSnap error: '+JSON.stringify(snap));
  // Guide delta vs element edges < 0.5px
  const delta=await page.evaluate(()=>{
    const e0=DS.elements[0],e1=DS.elements[1]; if(!e1)return{skip:true};
    const sy=e1.y; e1.y=e0.y; CanvasEngine.renderAll();
    DS.selection.add(e0.id); AlignmentGuides.show(e0.id);
    const guides=[...document.querySelectorAll('.rf-guide-h,.snap-guide.h')];
    let maxD=0;
    guides.forEach(g=>{
      const gR=g.getBoundingClientRect();
      let minD=Infinity;
      document.querySelectorAll('.rf-el,.cr-element').forEach(el=>{
        const r=el.getBoundingClientRect();
        minD=Math.min(minD,Math.abs(gR.top-r.top),Math.abs(gR.top-r.bottom));
      });
      if(minD<Infinity)maxD=Math.max(maxD,minD);
    });
    AlignmentGuides.clear(); DS.selection.clear(); e1.y=sy; CanvasEngine.renderAll();
    return{maxD:Math.round(maxD*100)/100,n:guides.length};
  });
  if(!delta.skip){
    if(delta.maxD<0.5) ok('guide alignment delta='+delta.maxD+'px < 0.5px');
    else bad('guide misalignment: delta='+delta.maxD+'px');
  }
  console.log('\n──────────────────────────────');
  console.log(SUITE+': '+pass+' PASS, '+fail+' FAIL');
  await browser.close();
  if(fail>0)process.exit(1);
})().catch(e=>{console.log('FAIL: '+e.message.slice(0,150));process.exit(1);});
EOF
kill $PID 2>/dev/null
