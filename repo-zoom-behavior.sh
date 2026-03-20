#!/usr/bin/env bash
echo "════════════════════════════════════════"
echo "RF ZOOM BEHAVIOR TEST"
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

  // Wheel < 20% per step
  await page.evaluate(()=>DesignZoomEngine.set(1.0));
  const ws=await page.evaluate(()=>{const r=document.getElementById('workspace').getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2};});
  await page.mouse.move(ws.x,ws.y);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0,-100);
  await page.keyboard.up('Control');
  await page.waitForTimeout(150);
  const z1=await page.evaluate(()=>DS.zoom);
  const wheelPct=Math.round(Math.abs(z1-1.0)*100);
  if(wheelPct<=20) ok('Wheel zoom step: '+wheelPct+'% <= 20%');
  else bad('Wheel zoom step too large: '+wheelPct+'%');
  await page.evaluate(()=>DesignZoomEngine.reset());

  // Canvas invariant under zoom
  const w0=await page.evaluate(()=>document.getElementById('canvas-layer').offsetWidth);
  await page.evaluate(()=>DesignZoomEngine.set(3.0));
  const vpT=await page.evaluate(()=>getComputedStyle(document.getElementById('viewport')).transform);
  const clT=await page.evaluate(()=>getComputedStyle(document.getElementById('canvas-layer')).transform);
  const w3=await page.evaluate(()=>document.getElementById('canvas-layer').offsetWidth);
  await page.evaluate(()=>DesignZoomEngine.reset());
  if(w0===w3) ok('Canvas offsetWidth invariant: '+w0+'=='+w3);
  else bad('Canvas offsetWidth changed: '+w0+'→'+w3);
  if(clT==='none') ok('canvas-layer transform=none at 3x');
  else bad('canvas-layer has transform: '+clT);
  if(vpT.includes('matrix(3')) ok('viewport transform=scale(3) at 3x');
  else bad('viewport transform unexpected: '+vpT.slice(0,30));

  // Zoom min/max limits
  await page.evaluate(()=>DesignZoomEngine.set(0.01));
  const zMin=await page.evaluate(()=>DS.zoom);
  if(zMin>=0.25) ok('zoom min=0.25 enforced (got '+zMin+')');
  else bad('zoom below minimum: '+zMin);
  await page.evaluate(()=>DesignZoomEngine.set(999));
  const zMax=await page.evaluate(()=>DS.zoom);
  if(zMax<=4.0) ok('zoom max=4.0 enforced (got '+zMax+')');
  else bad('zoom above maximum: '+zMax);
  await page.evaluate(()=>DesignZoomEngine.reset());

  // Independent zoom modes
  await page.evaluate(()=>DesignZoomEngine.set(2.0));
  await page.evaluate(()=>PreviewEngine.show());
  const pvZoom=await page.evaluate(()=>DS.zoom);
  await page.evaluate(()=>PreviewEngine.hide());
  const dvZoom=await page.evaluate(()=>DS.zoom);
  if(Math.abs(dvZoom-2.0)<0.01) ok('Design zoom restored after preview (2.0→'+pvZoom+'→'+dvZoom+')');
  else bad('Design zoom not restored (got '+dvZoom+')');
  await page.evaluate(()=>DesignZoomEngine.reset());

  // World coordinate invariant
  const wc=await page.evaluate(()=>{
    const cl=document.getElementById('canvas-layer'), el=DS.elements[0];
    const div=document.querySelector('[data-id="'+el.id+'"]');
    if(!div)return{skip:true};
    DesignZoomEngine.set(1.0);
    const r1=div.getBoundingClientRect(),cR1=cl.getBoundingClientRect();
    const wx1=(r1.left-cR1.left)/DS.zoom;
    DesignZoomEngine.set(2.0);
    const r2=div.getBoundingClientRect(),cR2=cl.getBoundingClientRect();
    const wx2=(r2.left-cR2.left)/DS.zoom;
    DesignZoomEngine.reset();
    return{wx1:Math.round(wx1*10)/10,wx2:Math.round(wx2*10)/10,delta:Math.round(Math.abs(wx1-wx2)*1000)/1000};
  });
  if(!wc.skip){
    if(wc.delta<0.5) ok('World coord invariant: Δ='+wc.delta+'px < 0.5px');
    else bad('World coord drift: Δ='+wc.delta+'px (wx1='+wc.wx1+' wx2='+wc.wx2+')');
  }

  console.log('\n════════ Zoom: '+pass+' PASS, '+fail+' FAIL');
  await browser.close(); if(fail>0)process.exit(1);
})().catch(e=>{console.log('FAIL: '+e.message.slice(0,120));process.exit(1);});
EOF
kill $PID 2>/dev/null
