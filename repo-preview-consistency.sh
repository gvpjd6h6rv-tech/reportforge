#!/usr/bin/env bash
echo "════════════════════════════════════════"
echo "RF PREVIEW CONSISTENCY TEST"
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
  const bad=m=>{console.log('FAIL: '+m);fail++;};

  const measure=async()=>page.evaluate(()=>{
    const R=id=>{const el=document.getElementById(id);if(!el)return null;const r=el.getBoundingClientRect();return{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)};};
    return{rv:R('ruler-v'),ws:R('workspace'),cl:R('canvas-layer'),vp:R('viewport'),zoom:DS.zoom};
  });

  // Design baseline
  const D=await measure();

  // Switch to preview
  await page.evaluate(()=>PreviewEngine.show());
  await page.waitForTimeout(300);
  const P=await measure();

  // ruler-v identical in both modes
  if(P.rv.x===D.rv.x) ok('ruler-v.x identical Design/Preview ('+D.rv.x+')');
  else bad('ruler-v.x differs: design='+D.rv.x+' preview='+P.rv.x);
  if(P.rv.w===D.rv.w) ok('ruler-v.w identical Design/Preview');
  else bad('ruler-v.w differs');

  // workspace identical
  if(P.ws.x===D.ws.x) ok('workspace.x identical Design/Preview ('+D.ws.x+')');
  else bad('workspace.x differs: design='+D.ws.x+' preview='+P.ws.x);

  // canvas identical
  if(P.cl.x===D.cl.x) ok('canvas.x identical Design/Preview ('+D.cl.x+')');
  else bad('canvas.x differs: design='+D.cl.x+' preview='+P.cl.x);

  // zoom restored correctly
  await page.evaluate(()=>DesignZoomEngine.set(2.0));
  const dz=await page.evaluate(()=>DS.zoom);
  await page.evaluate(()=>PreviewEngine.show());
  const pzAfterSwitch=await page.evaluate(()=>DS.zoom);
  await page.evaluate(()=>PreviewEngine.hide());
  const dzAfterBack=await page.evaluate(()=>DS.zoom);
  if(Math.abs(dzAfterBack-2.0)<0.01) ok('Design zoom restored after preview (2.0→'+pzAfterSwitch+'→'+dzAfterBack+')');
  else bad('Design zoom NOT restored (got '+dzAfterBack+' expected 2.0)');
  await page.evaluate(()=>DesignZoomEngine.reset());

  // Preview elements selectable (Crystal Reports allows drag in preview)
  await page.evaluate(()=>PreviewEngine.show());
  await page.waitForTimeout(300);
  const previewDrag=await page.evaluate(()=>{
    const el=document.querySelector('.cr-element');
    if(!el)return{ok:false,reason:'no element'};
    const cs=getComputedStyle(el);
    return{ok:cs.pointerEvents!=='none',pointerEvents:cs.pointerEvents};
  });
  await page.evaluate(()=>PreviewEngine.hide());
  if(previewDrag.ok) ok('cr-elements interactive in preview (pointer-events='+previewDrag.pointerEvents+')');
  else bad('cr-elements not interactive in preview: '+previewDrag.reason);

  // Guides work in preview
  await page.evaluate(()=>{PreviewEngine.show();const e=DS.elements[0];DS.selection.add(e?.id);AlignmentGuides.show(e?.id);});
  const guidesPV=await page.evaluate(()=>document.querySelectorAll('.rf-guide,.snap-guide').length);
  await page.evaluate(()=>{AlignmentGuides.clear();DS.selection.clear();PreviewEngine.hide();});
  if(guidesPV>0) ok('snap guides work in preview mode ('+guidesPV+' guides)');
  else bad('snap guides do NOT appear in preview mode');

  console.log('\n════════ Preview consistency: '+pass+' PASS, '+fail+' FAIL');
  await browser.close(); if(fail>0)process.exit(1);
})().catch(e=>{console.log('FAIL: '+e.message.slice(0,120));process.exit(1);});
EOF
kill $PID 2>/dev/null
