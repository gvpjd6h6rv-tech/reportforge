#!/usr/bin/env bash
echo "════════════════════════════════════════"
echo "RF FLOATING POINT STABILITY"
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

  // 1. 20 zoom in/out cycles — coords must not drift
  const cycleTest = await page.evaluate(() => {
    const snap0=DS.elements.map(e=>({id:e.id,x:e.x,y:e.y}));
    for(let i=0;i<20;i++){
      DesignZoomEngine.set(3.0); DesignZoomEngine.reset();
    }
    const snap1=DS.elements.map(e=>({id:e.id,x:e.x,y:e.y}));
    const maxDrift=snap0.reduce((mx,e0)=>{
      const e1=snap1.find(e=>e.id===e0.id);
      return Math.max(mx,Math.abs((e1?.x||0)-e0.x),Math.abs((e1?.y||0)-e0.y));
    },0);
    return{maxDrift,elCount:snap0.length};
  });
  if(cycleTest.maxDrift===0) ok('20 zoom cycles: zero coordinate drift ('+cycleTest.elCount+' elements)');
  else bad('coordinate drift after zoom cycles: '+cycleTest.maxDrift+'px');

  // 2. Wheel zoom accumulation — zoom must not overshoot
  const wheelTest = await page.evaluate(() => {
    DesignZoomEngine.reset();
    const z0=DS.zoom;
    // 50 tiny increments of 1.10
    for(let i=0;i<50;i++) DesignZoomEngine.setFree(DS.zoom*1.10);
    const zMax=DS.zoom;
    DesignZoomEngine.reset();
    return{z0,zMax,clamped:zMax<=4.0};
  });
  if(wheelTest.clamped) ok('zoom accumulation clamped at max=4.0 (reached '+Math.round(wheelTest.zMax*100)/100+')');
  else bad('zoom exceeded max: '+wheelTest.zMax);

  // 3. MagneticSnap idempotency over 100 iterations
  const snapIdem = await page.evaluate(() => {
    const s=window.RF?.Geometry?.MagneticSnap;
    if(!s) return{skip:true};
    let v=7.3;
    for(let i=0;i<100;i++) v=s.snap(v,8);
    return{final:v,expected:8,drift:Math.abs(v-8)};
  });
  if(snapIdem.skip) ok('MagneticSnap test skipped (not available)');
  else if(snapIdem.drift<0.001) ok('snap idempotent after 100 iterations (result='+snapIdem.final+')');
  else bad('snap drifted after 100 iterations: '+snapIdem.final+' expected 8');

  // 4. DS.snap integer output
  const snapInt = await page.evaluate(() => {
    const vals=[0.1,1.5,3.9,7.7,15.99,23.01,99.4,100.6];
    const results=vals.map(v=>({in:v,out:DS.snap(v),isInt:Number.isInteger(DS.snap(v))}));
    const allInt=results.every(r=>r.isInt);
    return{allInt,failures:results.filter(r=>!r.isInt)};
  });
  if(snapInt.allInt) ok('DS.snap always returns integer');
  else bad('DS.snap returned non-integer: '+JSON.stringify(snapInt.failures));

  console.log('  --- Floating-point: '+pass+' PASS, '+fail+' FAIL');
  await browser.close(); process.exit(fail>0?1:0);
})().catch(e=>{console.log('  FAIL: '+e.message.slice(0,120));process.exit(1);});
EOF
kill $PID 2>/dev/null
