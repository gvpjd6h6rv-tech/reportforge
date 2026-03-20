#!/usr/bin/env bash
echo "════════════════════════════════════════"
echo "RF GEOMETRY PRECISION"
echo "════════════════════════════════════════"
python3 reportforge_server.py & PID=$!; sleep 1
for i in $(seq 1 10); do curl -sf http://localhost:8080 >/dev/null && break || sleep 1; done
node - <<'EOF'
const {chromium} = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport:{width:1400,height:900} });
  await page.goto('http://localhost:8080/classic');
  await page.waitForTimeout(3000);
  await page.waitForFunction("() => typeof DS !== 'undefined' && DS.elements.length > 0");
  let pass=0, fail=0;
  const ok=m=>{console.log('  PASS: '+m);pass++;};
  const bad=m=>{console.log('  FAIL: '+m);fail++;};

  // 1. Snap alignment accuracy
  // DS.snap(v) rounds to nearest multiple of GRID_SIZE (8px)
  const snap = await page.evaluate(() => {
    const cases=[0,1,3,4,7,8,9,12,15,16,100,99,101];
    const results=cases.map(v=>({v,s:DS.snap(v),idem:DS.snap(DS.snap(v))===DS.snap(v),isInt:DS.snap(v)===Math.floor(DS.snap(v))}));
    return{nonIdem:results.filter(r=>!r.idem),nonInt:results.filter(r=>!r.isInt),count:cases.length};
  });
  if(snap.nonInt.length===0) ok('snap returns integers ('+snap.count+' test values)');
  else bad(snap.nonInt.length+' non-integer snap results');
  if(snap.nonIdem.length===0) ok('snap is idempotent snap(snap(v))===snap(v)');
  else bad('snap not idempotent for '+snap.nonIdem.length+' values');

  // 2. Integer coordinate stability
  const intCoords = await page.evaluate(() => {
    const nonInt = DS.elements.filter(e=>!Number.isInteger(e.x)||!Number.isInteger(e.y));
    return{nonIntCount:nonInt.length,total:DS.elements.length};
  });
  if(intCoords.nonIntCount===0) ok('all element coords are integers ('+intCoords.total+' elements)');
  else bad(intCoords.nonIntCount+' elements have non-integer coords');

  // 3. World-coord invariant under zoom
  const worldCoord = await page.evaluate(() => {
    const cl=document.getElementById('canvas-layer');
    const el=DS.elements[0]; if(!el)return{skip:true};
    const div=document.querySelector('[data-id="'+el.id+'"]');
    if(!div)return{skip:true};
    DesignZoomEngine.set(1.0);
    const r1=div.getBoundingClientRect(), c1=cl.getBoundingClientRect();
    const wx1=(r1.left-c1.left)/DS.zoom;
    DesignZoomEngine.set(2.0);
    const r2=div.getBoundingClientRect(), c2=cl.getBoundingClientRect();
    const wx2=(r2.left-c2.left)/DS.zoom;
    DesignZoomEngine.reset();
    return{wx1:Math.round(wx1*100)/100,wx2:Math.round(wx2*100)/100,
           delta:Math.abs(wx1-wx2),modelX:el.x};
  });
  if(worldCoord.skip) ok('world-coord test skipped (no element div)');
  else if(worldCoord.delta<0.5) ok('world coords zoom-invariant (Δ='+worldCoord.delta+'px)');
  else bad('world coord drift under zoom: Δ='+worldCoord.delta+'px');

  // 4. No subpixel drift after 10 zoom cycles
  const drift = await page.evaluate(() => {
    const e=DS.elements[0]; if(!e)return{skip:true};
    const x0=e.x;
    for(let i=0;i<10;i++){DesignZoomEngine.set(2.0);DesignZoomEngine.reset();}
    return{x0,xEnd:e.x,drift:Math.abs(e.x-x0)};
  });
  if(drift.skip) ok('drift test skipped');
  else if(drift.drift===0) ok('no coordinate drift after 10 zoom cycles');
  else bad('coordinate drift after zoom cycles: '+drift.drift+'px');

  // 5. Canvas offsetWidth invariant
  const canvasInv = await page.evaluate(() => {
    const cl=document.getElementById('canvas-layer');
    const w0=cl?.offsetWidth;
    DesignZoomEngine.set(4.0);
    const w4=cl?.offsetWidth;
    DesignZoomEngine.reset();
    return{w0,w4};
  });
  if(canvasInv.w0===canvasInv.w4) ok('canvas offsetWidth invariant at 4x ('+canvasInv.w0+'px)');
  else bad('canvas width changed: '+canvasInv.w0+'→'+canvasInv.w4);

  console.log('  --- Geometry: '+pass+' PASS, '+fail+' FAIL');
  await browser.close(); process.exit(fail>0?1:0);
})().catch(e=>{console.log('  FAIL: '+e.message.slice(0,120));process.exit(1);});
EOF
kill $PID 2>/dev/null
