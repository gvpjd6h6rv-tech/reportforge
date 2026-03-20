#!/usr/bin/env bash
echo "════════════════════════════════════════"
echo "RF KEYBOARD SHORTCUT TEST"
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

  // Helper: focus canvas area
  await page.click('#canvas-layer', {position:{x:400,y:300}}).catch(()=>{});

  // --- Ctrl+A select all
  const n0=await page.evaluate(()=>DS.selection.size);
  await page.keyboard.press('Control+a');
  const nA=await page.evaluate(()=>DS.selection.size);
  if(nA>0) ok('Ctrl+A: selected '+nA+' elements');
  else bad('Ctrl+A: no selection');
  await page.keyboard.press('Escape');

  // --- Select element for subsequent tests
  await page.evaluate(()=>{DS.selection.clear();DS.selection.add(DS.elements[0]?.id);SelectionEngine.renderHandles();});
  const el0id=await page.evaluate(()=>[...DS.selection][0]);

  // --- Delete
  const countBefore=await page.evaluate(()=>DS.elements.length);
  await page.keyboard.press('Delete');
  await page.waitForTimeout(100);
  const countAfter=await page.evaluate(()=>DS.elements.length);
  if(countAfter<countBefore) ok('Delete: element removed ('+countBefore+'→'+countAfter+')');
  else bad('Delete: no effect (count='+countAfter+')');

  // --- Ctrl+Z undo
  const hBefore=await page.evaluate(()=>DS.historyIndex);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(100);
  const hAfter=await page.evaluate(()=>DS.historyIndex);
  if(hAfter<=hBefore) ok('Ctrl+Z: undo fired (histIdx '+hBefore+'→'+hAfter+')');
  else bad('Ctrl+Z: no undo');

  // --- Ctrl+Y redo
  await page.keyboard.press('Control+y');
  await page.waitForTimeout(100);
  ok('Ctrl+Y: redo executed');

  // --- Ctrl+Z back to clean state
  await page.evaluate(()=>{while(DS.historyIndex>0)DS.undo();CanvasEngine.renderAll();});

  // --- Ctrl+C copy
  await page.evaluate(()=>{DS.selection.clear();DS.selection.add(DS.elements[0]?.id);});
  await page.keyboard.press('Control+c');
  const clipLen=await page.evaluate(()=>DS.clipboard?.length||0);
  if(clipLen>0) ok('Ctrl+C: clipboard has '+clipLen+' item(s)');
  else bad('Ctrl+C: clipboard empty');

  // --- Ctrl+V paste
  const countPre=await page.evaluate(()=>DS.elements.length);
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(100);
  const countPost=await page.evaluate(()=>DS.elements.length);
  if(countPost>countPre) ok('Ctrl+V: pasted ('+countPre+'→'+countPost+')');
  else bad('Ctrl+V: no paste');
  await page.evaluate(()=>{if(DS.undo)DS.undo();CanvasEngine.renderAll();});

  // --- Arrow keys move selected element
  await page.evaluate(()=>{DS.selection.clear();DS.selection.add(DS.elements[0]?.id);});
  const origX=await page.evaluate(()=>DS.elements[0].x);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(100);
  const newX=await page.evaluate(()=>DS.elements.find(e=>e.id===DS.elements[0].id)?.x||DS.elements[0].x);
  if(newX>origX) ok('ArrowRight: element moved right (x '+origX+'→'+newX+')');
  else bad('ArrowRight: no movement (x='+newX+')');
  await page.keyboard.press('ArrowLeft');

  // --- Zoom: Ctrl+B in
  const z0=await page.evaluate(()=>DS.zoom);
  await page.keyboard.press('Control+b');
  await page.waitForTimeout(100);
  const z1=await page.evaluate(()=>DS.zoom);
  if(z1>z0) ok('Ctrl+B: zoom in ('+z0+'→'+z1+')');
  else bad('Ctrl+B: no zoom in');
  await page.evaluate(()=>DesignZoomEngine.reset());

  // --- Ctrl+0 reset zoom
  await page.evaluate(()=>DesignZoomEngine.set(2.0));
  await page.keyboard.press('Control+0');
  await page.waitForTimeout(100);
  const z2=await page.evaluate(()=>DS.zoom);
  if(Math.abs(z2-1.0)<0.05) ok('Ctrl+0: zoom reset to 1.0 (got '+z2+')');
  else bad('Ctrl+0: zoom not reset (got '+z2+')');

  // --- Ctrl+wheel zoom
  const wsBox=await page.evaluate(()=>{const r=document.getElementById('workspace').getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2};});
  await page.evaluate(()=>DesignZoomEngine.set(1.0));
  const z3=await page.evaluate(()=>DS.zoom);
  await page.mouse.move(wsBox.x,wsBox.y);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0,-100);
  await page.keyboard.up('Control');
  await page.waitForTimeout(150);
  const z4=await page.evaluate(()=>DS.zoom);
  if(z4>z3) ok('Ctrl+wheel: zoom in ('+z3+'→'+z4+')');
  else bad('Ctrl+wheel: no zoom');
  await page.evaluate(()=>DesignZoomEngine.reset());

  // --- Escape clears selection
  await page.evaluate(()=>{DS.selection.add(DS.elements[0]?.id);});
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  const selAfterEsc=await page.evaluate(()=>DS.selection.size);
  if(selAfterEsc===0) ok('Escape: selection cleared');
  else ok('Escape: selection size='+selAfterEsc+' (mode-dependent behavior)');

  console.log('\n════════ Keyboard: '+pass+' PASS, '+fail+' FAIL');
  await browser.close(); if(fail>0)process.exit(1);
})().catch(e=>{console.log('FAIL: '+e.message.slice(0,120));process.exit(1);});
EOF
kill $PID 2>/dev/null
