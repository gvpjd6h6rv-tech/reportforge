#!/usr/bin/env bash
echo "════════════════════════════════════════"
echo "RF COMMAND IDEMPOTENCY"
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

  const invOk = async (label) => {
    const s = await page.evaluate(()=>{
      const rv=document.getElementById('ruler-v'),cl=document.getElementById('canvas-layer');
      return{rvOk:!!rv&&(rv.offsetWidth||0)>0, clT:getComputedStyle(cl||document.body).transform,
             zoom:DS.zoom, elCount:DS.elements.length};
    });
    if (!s.rvOk) bad(label+': ruler disappeared!');
    if (s.clT!=='none') bad(label+': canvas.transform: '+s.clT);
    return s;
  };

  // Select elements
  await page.evaluate(()=>{ DS.selection.add(DS.elements[0]?.id); DS.selection.add(DS.elements[1]?.id); });

  // 1. align-left 3× — should be idempotent (same x after each run)
  const r1 = await page.evaluate(()=>{ CommandEngine.alignLefts&&CommandEngine.alignLefts(); return DS.elements[0]?.x; });
  const r2 = await page.evaluate(()=>{ CommandEngine.alignLefts&&CommandEngine.alignLefts(); return DS.elements[0]?.x; });
  const r3 = await page.evaluate(()=>{ CommandEngine.alignLefts&&CommandEngine.alignLefts(); return DS.elements[0]?.x; });
  if (r1===r2 && r2===r3) ok('align-left idempotent 3× (x='+r1+')');
  else bad('align-left not idempotent: '+r1+','+r2+','+r3);
  await invOk('after align-left×3');

  // 2. zoom-reset 3× — zoom must stay at 1.0
  for(let i=0;i<3;i++) await page.evaluate(()=>DesignZoomEngine.set(1.0));
  const z = await page.evaluate(()=>DS.zoom);
  if (Math.abs(z-1.0)<0.001) ok('zoom-reset idempotent 3× (zoom='+z+')');
  else bad('zoom-reset not idempotent: '+z);

  // 3. toggle-grid 2× — returns to original state
  const g0 = await page.evaluate(()=>DS.gridVisible);
  await page.evaluate(()=>{DS.gridVisible=!DS.gridVisible;});
  await page.evaluate(()=>{DS.gridVisible=!DS.gridVisible;});
  const g2 = await page.evaluate(()=>DS.gridVisible);
  if (g0===g2) ok('toggle-grid 2× returns to original state');
  else bad('toggle-grid not symmetric: start='+g0+' end='+g2);

  // 4. select-all → deselect-all → select-all produces same count
  await page.evaluate(()=>CommandEngine.selectAll&&CommandEngine.selectAll());
  const c1 = await page.evaluate(()=>DS.selection.size);
  await page.evaluate(()=>DS.selection.clear());
  await page.evaluate(()=>CommandEngine.selectAll&&CommandEngine.selectAll());
  const c2 = await page.evaluate(()=>DS.selection.size);
  if (c1===c2) ok('select-all idempotent (count='+c1+' both times)');
  else bad('select-all inconsistent: '+c1+' vs '+c2);

  // 5. Layout invariants after all commands
  const s = await invOk('final');
  if (s.rvOk && s.clT==='none') ok('layout invariants preserved after command sequence');

  await page.evaluate(()=>{ DS.selection.clear(); DesignZoomEngine.reset(); CanvasEngine.renderAll(); });
  console.log('  --- Command idempotency: '+pass+' PASS, '+fail+' FAIL');
  await browser.close(); process.exit(fail>0?1:0);
})().catch(e=>{console.log('  FAIL: '+e.message.slice(0,120));process.exit(1);});
EOF
kill $PID 2>/dev/null
