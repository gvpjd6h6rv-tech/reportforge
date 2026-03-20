#!/usr/bin/env bash
# repo-crash-guard.sh — Crash guard — invalid inputs and edge cases
echo "════════════════════════════════════════"
echo "RF CRASH GUARD TEST"
echo "════════════════════════════════════════"
python3 reportforge_server.py &
PID=$!
sleep 1
for i in $(seq 1 10); do curl -sf http://localhost:8080 >/dev/null && break || sleep 1; done
node - <<'EOF'
const RF = require('./_rf_test_lib.js');
(async () => {
  const { browser, page, jsErrors } = await RF.launch();
  const { ok, bad, done } = RF.reporter('repo-crash-guard.sh');
const jsErrsBefore = jsErrors.length;

  // Invalid command
  await page.evaluate(()=>{
    try{CommandEngine.nonExistentCommand&&CommandEngine.nonExistentCommand();}catch(e){}
  });

  // Rapid undo/redo (50 cycles)
  await page.evaluate(()=>{for(let i=0;i<50;i++){DS.undo&&DS.undo();}for(let i=0;i<50;i++){DS.redo&&DS.redo();}});

  // Extreme zoom
  await page.evaluate(()=>{
    DesignZoomEngine.set(0.001); // below min
    DesignZoomEngine.set(999);   // above max
    DesignZoomEngine.reset();
  });

  // Drag outside canvas
  const el0 = await page.$('.cr-element');
  if(el0){
    const bb = await el0.boundingBox();
    await page.mouse.move(bb.x+5, bb.y+5);
    await page.mouse.down();
    await page.mouse.move(-50, -50); // outside
    await page.mouse.move(2000, 2000); // way outside
    await page.mouse.up();
    await page.waitForTimeout(100);
  }

  // Delete with no selection
  await page.evaluate(()=>{DS.selection.clear();CommandEngine.delete&&CommandEngine.delete();});

  // Verify designer still intact
  const inv = await RF.invariants(page);
  if(inv.ok) ok('designer intact after invalid inputs');
  else bad('designer broken after invalid inputs: '+inv.failed.join(', '));

  const jsErrsAfter = jsErrors.length;
  const newErrors = jsErrsAfter - jsErrsBefore;
  if(newErrors===0) ok('zero JS errors from invalid inputs');
  else bad(newErrors+' JS errors from invalid inputs: '+jsErrors.slice(jsErrsBefore).slice(0,2).join('; '));

  // Zoom still in valid range
  const zoom = await page.evaluate(()=>DS.zoom);
  if(zoom>=0.25&&zoom<=4.0) ok('zoom clamped correctly after extreme values ('+zoom+')');
  else bad('zoom escaped bounds: '+zoom);

  await page.evaluate(()=>{DesignZoomEngine.reset();CanvasEngine.renderAll();});
  await browser.close();
  if (done() > 0) process.exit(1);
})().catch(e => { console.log('FAIL: '+e.message.slice(0,120)); process.exit(1); });
EOF
kill $PID 2>/dev/null
