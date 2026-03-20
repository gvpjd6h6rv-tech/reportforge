#!/usr/bin/env bash
echo "════════════════════════════════════════"
echo "RF PERFORMANCE BUDGET"
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

  // 1. Drag latency < 16ms per frame (60fps target)
  const dragInfo = await page.evaluate(() => {
    const el=DS.elements[0]; if(!el)return null;
    const div=document.querySelector('[data-id="'+el.id+'"]');
    const bb=div?.getBoundingClientRect();
    return bb ? {bbX:Math.round(bb.x),bbY:Math.round(bb.y),hasBB:(bb.width||0)>0} : null;
  });
  if (dragInfo?.hasBB) {
    const t0 = Date.now();
    await page.mouse.move(dragInfo.bbX+4, dragInfo.bbY+4);
    await page.mouse.down();
    for(let i=1;i<=20;i++) await page.mouse.move(dragInfo.bbX+4+i*5, dragInfo.bbY+4);
    await page.mouse.up();
    const dragMs = Date.now() - t0;
    const msPerFrame = dragMs / 20;
    if (msPerFrame < 50) ok('drag latency: '+msPerFrame.toFixed(1)+'ms/frame (<50ms budget)');
    else bad('drag latency exceeded budget: '+msPerFrame.toFixed(1)+'ms/frame (>50ms)');
    await page.evaluate(() => { DS.undo&&DS.undo(); CanvasEngine.renderAll(); });
  }

  // 2. Zoom render budget < 100ms
  const zoomLatency = await page.evaluate(() => {
    const t0=performance.now();
    DesignZoomEngine.set(2.0);
    const t1=performance.now();
    DesignZoomEngine.reset();
    const t2=performance.now();
    return { zoomIn: Math.round(t1-t0), zoomOut: Math.round(t2-t1) };
  });
  if (zoomLatency.zoomIn < 100) ok('zoom-in render: '+zoomLatency.zoomIn+'ms (<100ms budget)');
  else bad('zoom-in too slow: '+zoomLatency.zoomIn+'ms');
  if (zoomLatency.zoomOut < 100) ok('zoom-out render: '+zoomLatency.zoomOut+'ms (<100ms budget)');
  else bad('zoom-out too slow: '+zoomLatency.zoomOut+'ms');

  // 3. Selection render budget < 32ms
  const selLatency = await page.evaluate(() => {
    const t0=performance.now();
    DS.selection.add(DS.elements[0]?.id);
    SelectionEngine.renderHandles&&SelectionEngine.renderHandles();
    const t1=performance.now();
    DS.selection.clear();
    return Math.round(t1-t0);
  });
  if (selLatency < 32) ok('selection render: '+selLatency+'ms (<32ms budget)');
  else bad('selection render too slow: '+selLatency+'ms (>32ms)');

  // 4. FPS estimate ≥ 30
  const fps = await page.evaluate(() =>
    new Promise(r=>{let f=0,t0=performance.now();
      (function tick(){f++;performance.now()-t0<1000?requestAnimationFrame(tick):r(f);})();
    })
  );
  if (fps >= 30) ok('FPS: '+fps+' (≥30 target)');
  else bad('FPS too low: '+fps+' (<30)');

  // 5. renderAll budget < 50ms
  const renderLatency = await page.evaluate(() => {
    const t0=performance.now(); CanvasEngine.renderAll&&CanvasEngine.renderAll();
    return Math.round(performance.now()-t0);
  });
  if (renderLatency < 50) ok('CanvasEngine.renderAll: '+renderLatency+'ms (<50ms)');
  else bad('renderAll too slow: '+renderLatency+'ms (>50ms)');

  console.log('  --- Performance budget: '+pass+' PASS, '+fail+' FAIL');
  await browser.close(); process.exit(fail>0?1:0);
})().catch(e=>{console.log('  FAIL: '+e.message.slice(0,120));process.exit(1);});
EOF
kill $PID 2>/dev/null
