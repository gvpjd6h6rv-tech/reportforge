#!/usr/bin/env bash
echo "════════════════════════════════════════"
echo "RF INVARIANTS TEST"
echo "════════════════════════════════════════"
python3 reportforge_server.py & PID=$!; sleep 3
node - <<'EOF'
const {chromium}=require('playwright');
(async()=>{
  const browser=await chromium.launch();
  const page=await browser.newPage({viewport:{width:1400,height:900}});
  await page.goto('http://localhost:8080/classic'); await page.waitForTimeout(2000);
  let pass=0,fail=0;
  const ok=m=>{console.log('PASS: '+m);pass++;};
  const bad=m=>{console.log('FAIL: [INVARIANT VIOLATED] '+m);fail++;};

  const I=await page.evaluate(()=>{
    const R=id=>{const el=document.getElementById(id);if(!el)return null;const r=el.getBoundingClientRect();return{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)};};
    const rv=R('ruler-v'), rh=R('ruler-h-row'), ws=R('workspace'), cl=R('canvas-layer'), vp=R('viewport');
    const wsScrollH=document.getElementById('workspace')?.scrollHeight;
    return {rv,rh,ws,cl,vp,wsScrollH,
      clTransform:getComputedStyle(document.getElementById('canvas-layer')).transform,
      vpTransform:getComputedStyle(document.getElementById('viewport')).transform,
      sectionLabels:[...document.querySelectorAll('.section-label,.sec-label')].filter(l=>getComputedStyle(l).display!=='none').length,
      elCount:DS.elements.length,
      sectCount:DS.sections.length,
      ZOOM_STEPS:JSON.stringify(ZOOM_STEPS),
    };
  });

  // INV-1: Vertical ruler must exist and be visible
  if(I.rv&&I.rv.h>0) ok('INV-1: vertical ruler exists (h='+I.rv.h+'px)');
  else bad('INV-1: vertical ruler missing or zero height');

  // INV-2: Horizontal ruler must exist and be visible
  if(I.rh&&I.rh.h>0) ok('INV-2: horizontal ruler exists (h='+I.rh.h+'px)');
  else bad('INV-2: horizontal ruler missing or zero height');

  // INV-3: Workspace must not overlap vertical ruler
  if(I.ws&&I.rv&&I.ws.x>=I.rv.x+I.rv.w) ok('INV-3: workspace does not overlap vertical ruler');
  else bad('INV-3: workspace OVERLAPS vertical ruler');

  // INV-4: Canvas must not overlap rulers
  if(I.cl&&I.rv&&I.cl.x>I.rv.x+I.rv.w) ok('INV-4: canvas does not overlap vertical ruler');
  else bad('INV-4: canvas OVERLAPS vertical ruler (cl.x='+I.cl?.x+')');

  // INV-5: Canvas must not be excessively centered
  const canvasRelOffset=I.cl&&I.ws?I.cl.x-I.ws.x:9999;
  if(canvasRelOffset<200) ok('INV-5: canvas not excessively centered (offset='+canvasRelOffset+'px)');
  else bad('INV-5: canvas centered with large margins (offset='+canvasRelOffset+'px >= 200)');

  // INV-6: Canvas transform must be none
  if(I.clTransform==='none') ok('INV-6: canvas-layer has no transform (zoom on viewport only)');
  else bad('INV-6: canvas-layer has transform: '+I.clTransform);

  // INV-7: Section labels must not appear
  if(I.sectionLabels===0) ok('INV-7: no section labels visible');
  else bad('INV-7: '+I.sectionLabels+' section label(s) visible (should be hidden)');

  // INV-8: DOM hierarchy intact — canvas-layer inside viewport
  const clInVP=await page.evaluate(()=>!!document.getElementById('canvas-layer')?.closest('#viewport'));
  if(clInVP) ok('INV-8: canvas-layer inside viewport');
  else bad('INV-8: canvas-layer NOT inside viewport');

  // INV-9: Ruler not inside viewport
  const rvInVP=await page.evaluate(()=>!!document.getElementById('ruler-v')?.closest('#viewport'));
  if(!rvInVP) ok('INV-9: ruler-v NOT inside viewport (correct screen-space position)');
  else bad('INV-9: ruler-v INSIDE viewport (will scale with zoom)');

  // INV-10: DS sections > 0 and elements >= 0
  if(I.sectCount>0) ok('INV-10: DS has '+I.sectCount+' sections');
  else bad('INV-10: DS has no sections (corrupted state)');

  // INV-11: ZOOM_STEPS defined correctly
  if(I.ZOOM_STEPS==='[0.25,0.5,0.75,1,1.5,2,3,4]') ok('INV-11: ZOOM_STEPS=[0.25..4]');
  else bad('INV-11: ZOOM_STEPS corrupted: '+I.ZOOM_STEPS);

  // INV-12: 4 corner handles (not 8)
  await page.evaluate(()=>{DS.selection.add(DS.elements[0]?.id);SelectionEngine.renderHandles();});
  const hCount=await page.evaluate(()=>document.querySelectorAll('.sel-handle').length);
  await page.evaluate(()=>DS.selection.clear());
  if(hCount===4) ok('INV-12: exactly 4 corner handles');
  else bad('INV-12: handle count='+hCount+' (expected 4)');

  // INV-13: workspaceX == rulerV.right (both modes)
  await page.evaluate(()=>PreviewEngine.show());
  await page.waitForTimeout(100);
  const pvCheck=await page.evaluate(()=>{
    const rv=document.getElementById('ruler-v')?.getBoundingClientRect();
    const ws=document.getElementById('workspace')?.getBoundingClientRect();
    return {wsX:Math.round(ws?.x),rvRight:Math.round(rv?.x+rv?.width)};
  });
  await page.evaluate(()=>PreviewEngine.hide());
  if(pvCheck.wsX===pvCheck.rvRight) ok('INV-13: workspaceX==rvRight in Preview ('+pvCheck.wsX+')');
  else bad('INV-13: workspaceX('+pvCheck.wsX+') != rvRight('+pvCheck.rvRight+') in Preview');

  console.log('\n════════ Invariants: '+pass+' PASS, '+fail+' FAIL');
  await browser.close(); if(fail>0)process.exit(1);
})().catch(e=>{console.log('FAIL: '+e.message.slice(0,120));process.exit(1);});
EOF
kill $PID 2>/dev/null
