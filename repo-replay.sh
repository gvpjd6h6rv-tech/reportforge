#!/usr/bin/env bash
echo "════════════════════════════════════════"
echo "RF INTERACTION REPLAY"
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

  // Define a deterministic interaction script
  const SCRIPT = [
    { op:'select', idx:0 },
    { op:'move',   idx:0, dx:24, dy:0 },
    { op:'zoom',   z:1.5 },
    { op:'select', idx:1 },
    { op:'move',   idx:1, dx:0, dy:16 },
    { op:'zoom',   z:1.0 },
    { op:'undo' },
    { op:'undo' },
    { op:'undo' },
    { op:'undo' },
  ];

  const replay = async () => {
    await page.evaluate(() => { DesignZoomEngine.reset(); DS.selection.clear(); });
    for (const step of SCRIPT) {
      await page.evaluate((s) => {
        if (s.op==='select') { DS.selection.clear(); DS.selection.add(DS.elements[s.idx]?.id); }
        else if (s.op==='move') {
          const e=DS.elements[s.idx]; if(e){e.x=DS.snap(e.x+s.dx);e.y=DS.snap(e.y+s.dy);DS.saveHistory();}
        }
        else if (s.op==='zoom') DesignZoomEngine.set(s.z);
        else if (s.op==='undo') DS.undo&&DS.undo();
      }, step);
    }
    return page.evaluate(() => ({
      el0x:DS.elements[0]?.x, el0y:DS.elements[0]?.y,
      el1x:DS.elements[1]?.x, el1y:DS.elements[1]?.y,
      zoom:DS.zoom, elCount:DS.elements.length,
      clX:Math.round(document.getElementById('canvas-layer')?.getBoundingClientRect().x||0),
    }));
  };

  // Run 1
  const run1 = await replay();
  // Reset
  await page.evaluate(() => { while(DS.historyIndex>0) DS.undo&&DS.undo(); CanvasEngine.renderAll(); });
  // Run 2
  const run2 = await replay();

  // Compare
  const fields = Object.keys(run1);
  let allMatch = true;
  fields.forEach(k => {
    if (run1[k] !== run2[k]) { allMatch=false; bad('replay diverged on '+k+': '+run1[k]+' vs '+run2[k]); }
  });
  if (allMatch) ok('replay deterministic across 2 runs ('+fields.length+' fields match)');

  // Layout stable
  const layout = await page.evaluate(() => {
    const rv=document.getElementById('ruler-v'), cl=document.getElementById('canvas-layer');
    return { rvOk:!!rv&&(rv.offsetWidth||0)>0, clT:getComputedStyle(cl||document.body).transform };
  });
  if (layout.rvOk) ok('rulers stable after replay'); else bad('ruler disappeared!');
  if (layout.clT==='none') ok('canvas.transform=none after replay'); else bad('canvas.transform: '+layout.clT);

  // Cleanup
  await page.evaluate(() => { DesignZoomEngine.reset(); DS.selection.clear(); CanvasEngine.renderAll(); });
  console.log('  --- Replay: '+pass+' PASS, '+fail+' FAIL');
  await browser.close(); process.exit(fail>0?1:0);
})().catch(e=>{console.log('  FAIL: '+e.message.slice(0,120));process.exit(1);});
EOF
kill $PID 2>/dev/null
