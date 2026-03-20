#!/usr/bin/env bash
# repo-state-machine.sh — State machine validation — editor state transitions
echo "════════════════════════════════════════"
echo "RF STATE MACHINE TEST"
echo "════════════════════════════════════════"
python3 reportforge_server.py &
PID=$!
sleep 1
for i in $(seq 1 10); do curl -sf http://localhost:8080 >/dev/null && break || sleep 1; done
node - <<'EOF'
const RF = require('./_rf_test_lib.js');
(async () => {
  const { browser, page, jsErrors } = await RF.launch();
  const { ok, bad, done } = RF.reporter('repo-state-machine.sh');
// IDLE state
  const idle = await RF.state(page);
  if(!idle.previewMode && idle.selCount===0) ok('IDLE state: no selection, design mode');
  else bad('IDLE state invalid: preview='+idle.previewMode+' sel='+idle.selCount);

  // SELECTING state
  await page.evaluate(()=>{DS.selection.add(DS.elements[0]?.id);});
  const selecting = await RF.state(page);
  if(selecting.selCount>0) ok('SELECTING state: '+selecting.selCount+' element selected');
  else bad('SELECTING state: no selection');

  // PREVIEW state
  await page.evaluate(()=>PreviewEngine.show());
  const preview = await RF.state(page);
  if(preview.previewMode) ok('PREVIEW state: previewMode=true');
  else bad('PREVIEW state transition failed');

  // Back to IDLE from PREVIEW
  await page.evaluate(()=>PreviewEngine.hide());
  const backIdle = await RF.state(page);
  if(!backIdle.previewMode) ok('IDLE restore from PREVIEW: previewMode=false');
  else bad('stuck in PREVIEW state after hide()');

  // ZOOMING state
  await page.evaluate(()=>DesignZoomEngine.set(2.0));
  const zooming = await RF.state(page);
  if(Math.abs(zooming.zoom-2.0)<0.01) ok('ZOOM state: zoom='+zooming.zoom);
  else bad('ZOOM state: expected 2.0 got '+zooming.zoom);
  await page.evaluate(()=>DesignZoomEngine.reset());

  // All transitions leave invariants intact
  const inv = await RF.invariants(page);
  if(inv.ok) ok('layout invariants intact after all state transitions');
  else bad('invariants broken: '+inv.failed.join(', '));
  await page.evaluate(()=>{DS.selection.clear();CanvasEngine.renderAll();});
  await browser.close();
  if (done() > 0) process.exit(1);
})().catch(e => { console.log('FAIL: '+e.message.slice(0,120)); process.exit(1); });
EOF
kill $PID 2>/dev/null
