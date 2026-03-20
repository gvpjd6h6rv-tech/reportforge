#!/usr/bin/env bash
echo "════════════════════════════════════════"
echo "RF DETERMINISM"
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

  const runSequence = async () => {
    await page.evaluate(() => {
      DesignZoomEngine.reset(); DS.selection.clear();
      // Deterministic sequence
      const e=DS.elements[0]; if(!e) return;
      e.x=DS.snap(e.x+16); DS.saveHistory();
      DS.selection.add(e.id); SelectionEngine.renderHandles&&SelectionEngine.renderHandles();
      DesignZoomEngine.set(1.5);
      DS.selection.clear();
      DesignZoomEngine.reset();
      DS.undo&&DS.undo();
    });
    return page.evaluate(() => ({
      el0x:DS.elements[0]?.x,
      el0y:DS.elements[0]?.y,
      elCount:DS.elements.length,
      zoom:DS.zoom,
      selCount:DS.selection.size,
      clX:Math.round(document.getElementById('canvas-layer')?.getBoundingClientRect().x||0),
      wsX:Math.round(document.getElementById('workspace')?.getBoundingClientRect().x||0),
    }));
  };

  const r1 = await runSequence();
  await page.evaluate(() => { while(DS.historyIndex>0) DS.undo&&DS.undo(); CanvasEngine.renderAll(); });
  const r2 = await runSequence();

  // Compare
  const keys = Object.keys(r1);
  let allMatch = true;
  keys.forEach(k => {
    if(r1[k]!==r2[k]){ allMatch=false; bad('non-deterministic: '+k+' run1='+r1[k]+' run2='+r2[k]); }
  });
  if(allMatch) ok('identical results across 2 runs ('+keys.length+' state fields match)');

  // Layout invariants after both runs
  const layout = await page.evaluate(() => {
    const rv=document.getElementById('ruler-v'), cl=document.getElementById('canvas-layer');
    return{rvOk:!!rv&&(rv.offsetWidth||0)>0, clT:getComputedStyle(cl||document.body).transform};
  });
  if(layout.rvOk) ok('ruler stable after determinism test');
  else bad('ruler disappeared!');
  if(layout.clT==='none') ok('canvas.transform=none');
  else bad('canvas.transform: '+layout.clT);

  console.log('  --- Determinism: '+pass+' PASS, '+fail+' FAIL');
  await browser.close(); process.exit(fail>0?1:0);
})().catch(e=>{console.log('  FAIL: '+e.message.slice(0,120));process.exit(1);});
EOF
kill $PID 2>/dev/null
