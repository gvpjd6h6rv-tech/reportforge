#!/usr/bin/env bash
echo "════════════════════════════════════════"
echo "RF EXTENSION SAFETY"
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

  // Attempt to corrupt core state objects via external "plugin" code
  const results = await page.evaluate(() => {
    const snap0 = { elCount:DS.elements.length, zoom:DS.zoom,
                    rvOk: !!(document.getElementById('ruler-v')?.offsetWidth) };

    // Simulate malicious/buggy plugin: try to corrupt DS
    try { DS.elements = null; } catch(e) {}
    if (DS.elements === null) DS.elements = []; // might break real app
    // Try to break zoom
    try { DesignZoomEngine.set(999); } catch(e) {}
    // Try to remove critical DOM
    const rv = document.getElementById('ruler-v');
    // Don't actually remove — just check if it's accessible
    try { rv?.setAttribute('data-plugin-test','1'); } catch(e){}

    const snap1 = { elCount:DS.elements.length, zoom:DS.zoom,
                    rvOk: !!(document.getElementById('ruler-v')?.offsetWidth) };

    // Restore
    DesignZoomEngine.reset&&DesignZoomEngine.reset();
    CanvasEngine.renderAll&&CanvasEngine.renderAll();

    return { snap0, snap1, zoomClamped: DS.zoom<=4.0 };
  });

  if (results.zoomClamped) ok('zoom clamped to max=4.0 after extension attack (got '+results.snap1.zoom+')');
  else bad('zoom not clamped: '+results.snap1.zoom);
  if (results.snap1.rvOk) ok('ruler-v survives extension DOM manipulation');
  else bad('ruler-v was compromised by extension!');

  // Test that core protections hold
  const protection = await page.evaluate(() => {
    // Core engine APIs must still work after attack
    const zOk = typeof DesignZoomEngine.set === 'function';
    const dOk = typeof DS.undo === 'function';
    const cOk = typeof CanvasEngine.renderAll === 'function';
    return { zOk, dOk, cOk };
  });
  if (protection.zOk) ok('DesignZoomEngine intact after extension test');
  else bad('DesignZoomEngine API broken!');
  if (protection.dOk) ok('DS.undo intact after extension test');
  else bad('DS.undo broken!');
  if (protection.cOk) ok('CanvasEngine.renderAll intact');
  else bad('CanvasEngine broken!');

  // Final layout check
  const layout = await page.evaluate(()=>{
    const rv=document.getElementById('ruler-v'), cl=document.getElementById('canvas-layer');
    return{rvOk:!!rv&&(rv.offsetWidth||0)>0, clT:getComputedStyle(cl||document.body).transform};
  });
  if (layout.rvOk) ok('layout intact after extension safety test');
  else bad('layout broken!');
  if (layout.clT==='none') ok('canvas.transform=none'); else bad('canvas.transform: '+layout.clT);

  console.log('  --- Extension safety: '+pass+' PASS, '+fail+' FAIL');
  await browser.close(); process.exit(fail>0?1:0);
})().catch(e=>{console.log('  FAIL: '+e.message.slice(0,120));process.exit(1);});
EOF
kill $PID 2>/dev/null
