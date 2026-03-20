#!/usr/bin/env bash
echo "════════════════════════════════════════"
echo "RF INTERACTION LATENCY"
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

  // Measure 10 samples of each operation, report p50 and p95
  const measure = async (label, fn, budget) => {
    const times = [];
    for (let i=0; i<10; i++) {
      const t0 = Date.now();
      await fn();
      times.push(Date.now()-t0);
    }
    times.sort((a,b)=>a-b);
    const p50 = times[4], p95 = times[Math.floor(times.length*0.95)];
    if (p50 < budget) ok(label+' p50='+p50+'ms p95='+p95+'ms (<'+budget+'ms budget)');
    else bad(label+' p50='+p50+'ms exceeds '+budget+'ms budget');
  };

  // 1. Selection latency
  await measure('selection', async () => {
    await page.evaluate(() => {
      DS.selection.clear(); DS.selection.add(DS.elements[0]?.id);
      SelectionEngine.renderHandles&&SelectionEngine.renderHandles();
    });
  }, 30);

  // 2. Zoom latency
  await measure('zoom-set', async () => {
    await page.evaluate(() => { DesignZoomEngine.set(1.5); DesignZoomEngine.reset(); });
  }, 50);

  // 3. renderAll latency
  await measure('renderAll', async () => {
    await page.evaluate(() => CanvasEngine.renderAll&&CanvasEngine.renderAll());
  }, 50);

  // 4. Drag start latency (mousedown → first pointermove response)
  const di = await page.evaluate(() => {
    const e=DS.elements[0]; const d=document.querySelector('[data-id="'+e?.id+'"]');
    const b=d?.getBoundingClientRect();
    return b ? {x:Math.round(b.x+4),y:Math.round(b.y+4)} : null;
  });
  if (di) {
    const t0 = Date.now();
    await page.mouse.move(di.x, di.y);
    await page.mouse.down();
    await page.mouse.move(di.x+20, di.y);
    const dragStart = Date.now()-t0;
    await page.mouse.up();
    await page.evaluate(()=>{DS.undo&&DS.undo();CanvasEngine.renderAll();});
    if (dragStart < 200) ok('drag-start latency: '+dragStart+'ms (<200ms budget)');
    else bad('drag-start too slow: '+dragStart+'ms');
  }

  // 5. History (undo/redo) latency
  await measure('undo', async () => {
    await page.evaluate(() => { DS.undo&&DS.undo(); });
  }, 20);

  console.log('  --- Latency: '+pass+' PASS, '+fail+' FAIL');
  await browser.close(); process.exit(fail>0?1:0);
})().catch(e=>{console.log('  FAIL: '+e.message.slice(0,120));process.exit(1);});
EOF
kill $PID 2>/dev/null
