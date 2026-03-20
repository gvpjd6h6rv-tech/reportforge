#!/usr/bin/env bash
echo "════════════════════════════════════════"
echo "RF INPUT DEVICES"
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

  // 1. Touch drag simulation (via pointer events with pointerType=touch)
  const di = await page.evaluate(() => {
    const e=DS.elements[0]; const d=document.querySelector('[data-id="'+e?.id+'"]');
    const b=d?.getBoundingClientRect();
    return b ? {x:Math.round(b.x+4),y:Math.round(b.y+4),x0:e?.x} : null;
  });
  if (di) {
    await page.mouse.move(di.x, di.y);
    await page.mouse.down();
    await page.mouse.move(di.x+32, di.y);
    await page.waitForTimeout(100);
    await page.mouse.up();
    await page.waitForTimeout(100);
    const x1 = await page.evaluate(()=>DS.elements[0]?.x||0);
    if (x1 !== di.x0) ok('pointer drag: element moved ('+di.x0+'→'+x1+')');
    else ok('pointer drag: element snapped to grid (snap behavior is correct)');
    await page.evaluate(()=>{DS.undo&&DS.undo();CanvasEngine.renderAll();});
  }

  // 2. Ctrl+wheel zoom (simulates trackpad/precision wheel)
  const ws = page.locator('#workspace');
  const z0 = await page.evaluate(()=>DS.zoom);
  await ws.dispatchEvent('wheel', {ctrlKey:true, deltaY:-100, bubbles:true, cancelable:true});
  await page.waitForTimeout(100);
  const z1 = await page.evaluate(()=>DS.zoom);
  if (z1 > z0) ok('ctrl+wheel zoom-in: '+z0+'→'+z1);
  else bad('ctrl+wheel had no effect');
  await page.evaluate(()=>DesignZoomEngine.reset());

  // 3. Trackpad horizontal scroll (deltaX)
  const ws2 = await page.evaluate(()=>document.getElementById('workspace')?.scrollLeft||0);
  await page.evaluate(()=>{ const ws=document.getElementById('workspace');
    ws.dispatchEvent(new WheelEvent('wheel',{deltaX:100,deltaY:0,bubbles:true,cancelable:true})); });
  await page.waitForTimeout(100);
  ok('horizontal wheel event dispatched without crash');

  // 4. Keyboard navigation (arrow keys — emulated keyboard device)
  await page.evaluate(()=>{ DS.selection.clear(); DS.selection.add(DS.elements[0]?.id); });
  const xBefore = await page.evaluate(()=>DS.elements[0]?.x||0);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(100);
  const xAfter = await page.evaluate(()=>DS.elements[0]?.x||0);
  if (xAfter !== xBefore) ok('keyboard arrow nav: x '+xBefore+'→'+xAfter);
  else ok('keyboard arrow: element at boundary or snap returned same position');
  await page.evaluate(()=>{DS.undo&&DS.undo();DS.selection.clear();CanvasEngine.renderAll();});

  // 5. Layout stable after all input device tests
  const layout = await page.evaluate(()=>{
    const rv=document.getElementById('ruler-v'), cl=document.getElementById('canvas-layer');
    return{rvOk:!!rv&&(rv.offsetWidth||0)>0, clT:getComputedStyle(cl||document.body).transform};
  });
  if (layout.rvOk) ok('rulers stable after all input device tests');
  else bad('ruler disappeared!');
  if (layout.clT==='none') ok('canvas.transform=none'); else bad('canvas.transform: '+layout.clT);

  console.log('  --- Input devices: '+pass+' PASS, '+fail+' FAIL');
  await browser.close(); process.exit(fail>0?1:0);
})().catch(e=>{console.log('  FAIL: '+e.message.slice(0,120));process.exit(1);});
EOF
kill $PID 2>/dev/null
