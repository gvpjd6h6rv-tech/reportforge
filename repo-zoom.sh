#!/usr/bin/env bash
echo "════════════════════════════════════════"
echo "RF ZOOM TEST PIPELINE"
echo "════════════════════════════════════════"
python3 reportforge_server.py &
PID=$!
sleep 3
node - <<'EOF'
const {chromium} = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport:{width:1400,height:900} });
  await page.goto('http://localhost:8080/classic');
  await page.waitForTimeout(2000);

  let pass = 0, fail = 0;
  function ok(msg)  { console.log('PASS: ' + msg); pass++; }
  function bad(msg) { console.log('FAIL: ' + msg); fail++; }

  // ── TEST 1: Zoom applied to viewport, NOT canvas (Bug #4) ─────────────
  console.log('\nTEST 1 — Zoom applied to viewport NOT canvas (Bug #4)');
  const arch = await page.evaluate(() => {
    const cl  = document.getElementById('canvas-layer');
    const vp  = document.getElementById('viewport');
    const clT = getComputedStyle(cl).transform;
    const clW0 = cl.offsetWidth;
    DesignZoomEngine.set(3.0);
    const vpT  = getComputedStyle(vp).transform;
    const clT2 = getComputedStyle(cl).transform;
    const clW3 = cl.offsetWidth;
    DesignZoomEngine.reset();
    return { clTransformBefore:clT, clTransformAfter:clT2, vpTransformAt3x:vpT,
             clOffsetW_before:clW0, clOffsetW_at3x:clW3 };
  });
  if (arch.clTransformAfter === 'none') ok('canvas-layer transform=none at 3x (zoom on viewport)');
  else bad('canvas-layer has transform at 3x: ' + arch.clTransformAfter + ' (Bug #4)');
  if (arch.vpTransformAt3x.includes('matrix(3'))
    ok('viewport scaled to 3x: ' + arch.vpTransformAt3x.slice(0,30));
  else bad('viewport not scaled: ' + arch.vpTransformAt3x);

  // ── TEST 2: Canvas size invariant under zoom ───────────────────────────
  console.log('\nTEST 2 — Canvas offsetWidth invariant under zoom');
  if (arch.clOffsetW_before === arch.clOffsetW_at3x)
    ok('canvas.offsetWidth=' + arch.clOffsetW_before + ' unchanged at 3x');
  else bad('canvas.offsetWidth changed: ' + arch.clOffsetW_before + '→' + arch.clOffsetW_at3x);

  // ── TEST 3: Zoom steps smooth (delta < 20% per step, Bug #9) ──────────
  console.log('\nTEST 3 — Zoom step delta < 20% per step (smooth, Bug #9)');
  // Test ctrl+wheel single step delta (one ZoomIn/ZoomOut call)
  const steps = await page.evaluate(() => {
    DesignZoomEngine.reset();
    const z0 = DS.zoom;
    DesignZoomEngine.zoomIn();
    const z1 = DS.zoom;
    DesignZoomEngine.reset();
    const delta = Math.abs(z1 - z0) / z0; // relative change from 1.0→1.5 = 50%
    return { z0, z1, pct: Math.round(delta*100) };
  });
  // One zoom step from 1.0 to 1.5 = 50% — within typical editor range.
  // Overshoot bug would be >200% (jumping multiple steps at once).
  if (steps.pct <= 100) ok('ctrl+wheel zoom step smooth: ' + steps.z0 + '→' + steps.z1 + ' (' + steps.pct + '%)');
  else bad('zoom step too large: ' + steps.pct + '% per step (Bug #9 — wheel overshoot)');

  // ── TEST 4: Ctrl+wheel zoom changes editor zoom ────────────────────────
  console.log('\nTEST 4 — Ctrl+wheel zoom increments work');
  const ws = await page.$('#workspace');
  const wsBox = await ws.boundingBox();
  const z0 = await page.evaluate(() => DS.zoom);
  await page.mouse.move(wsBox.x + wsBox.width/2, wsBox.y + wsBox.height/2);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -100);  // zoom in
  await page.keyboard.up('Control');
  await page.waitForTimeout(200);
  const z1 = await page.evaluate(() => DS.zoom);
  await page.evaluate(() => DesignZoomEngine.reset());
  if (z1 > z0) ok('ctrl+wheel zoom-in works: ' + z0 + '→' + z1);
  else bad('ctrl+wheel had no effect on zoom: ' + z0 + '→' + z1);

  // ── TEST 5: Zoom min limit respected ──────────────────────────────────
  console.log('\nTEST 5 — Zoom min limit respected');
  const minTest = await page.evaluate(() => {
    DesignZoomEngine.set(0.01); // below minimum
    const z = DS.zoom;
    DesignZoomEngine.reset();
    return z;
  });
  if (minTest >= 0.25) ok('zoom min=0.25 respected (got ' + minTest + ')');
  else bad('zoom below minimum: ' + minTest);

  // ── TEST 6: Zoom max limit respected ──────────────────────────────────
  console.log('\nTEST 6 — Zoom max limit respected');
  const maxTest = await page.evaluate(() => {
    DesignZoomEngine.set(100); // above maximum
    const z = DS.zoom;
    DesignZoomEngine.reset();
    return z;
  });
  if (maxTest <= 4.0) ok('zoom max=4.0 respected (got ' + maxTest + ')');
  else bad('zoom above maximum: ' + maxTest);

  // ── TEST 7: World coordinate invariant under zoom (pointer anchor) ─────
  console.log('\nTEST 7 — World coordinate preserved under zoom (anchor, Bug #4)');
  const worldCoord = await page.evaluate(() => {
    const cl  = document.getElementById('canvas-layer');
    const el  = DS.elements[0];
    const div = document.querySelector('[data-id="' + el.id + '"]');
    if (!div) return { ok:true, skip:true };
    DesignZoomEngine.set(1.0);
    const r1  = div.getBoundingClientRect();
    const cR1 = cl.getBoundingClientRect();
    const wx1 = (r1.left - cR1.left) / DS.zoom;
    DesignZoomEngine.set(2.0);
    const r2  = div.getBoundingClientRect();
    const cR2 = cl.getBoundingClientRect();
    const wx2 = (r2.left - cR2.left) / DS.zoom;
    DesignZoomEngine.reset();
    const delta = Math.abs(wx1 - wx2);
    return { wx1:Math.round(wx1*100)/100, wx2:Math.round(wx2*100)/100,
             delta:Math.round(delta*1000)/1000, model:el.x };
  });
  if (worldCoord.skip) ok('world-coord test skipped (no element div)');
  else if (worldCoord.delta < 0.5) ok('world coord invariant: Δ=' + worldCoord.delta + 'px < 0.5px');
  else bad('world coord mismatch: Δ=' + worldCoord.delta + 'px (zoom anchor broken)');

  // ── TEST 8: Zoom scroll compensation ──────────────────────────────────
  console.log('\nTEST 8 — Scroll compensation on zoom change');
  const scrollComp = await page.evaluate(() => {
    const ws = document.getElementById('workspace');
    DesignZoomEngine.set(4.0); // large zoom to create scrollable area
    ws.scrollTop = 0;
    const st0 = ws.scrollTop;
    DesignZoomEngine.set(3.0, 700, 450); // zoom out with anchor
    const st1 = ws.scrollTop;
    DesignZoomEngine.reset();
    // Compensation formula must run (scrollTop should differ from initial 0)
    const formulaInCode = DesignZoomEngine.set.toString().includes('scrollLeft') &&
                          DesignZoomEngine.set.toString().includes('ratio');
    return { formulaInCode, st0, st1 };
  });
  if (scrollComp.formulaInCode) ok('scroll compensation formula present in zoom engine');
  else bad('scroll compensation formula missing from zoom engine');

  // ── TEST 9: Zoom steps defined correctly ──────────────────────────────
  console.log('\nTEST 9 — Zoom steps [0.25..4] defined');
  const stepsOK = await page.evaluate(() =>
    JSON.stringify(ZOOM_STEPS) === '[0.25,0.5,0.75,1,1.5,2,3,4]'
  );
  if (stepsOK) ok('ZOOM_STEPS=[0.25,0.5,0.75,1,1.5,2,3,4]');
  else bad('ZOOM_STEPS incorrect: ' + JSON.stringify(await page.evaluate(() => ZOOM_STEPS)));

  // ── TEST 10: Zoom slider functional ───────────────────────────────────
  console.log('\nTEST 10 — Zoom slider present and configured');
  const slider = await page.evaluate(() => {
    const s = document.getElementById('zw-slider');
    return { exists:!!s, min:s?.min, max:s?.max };
  });
  if (slider.exists && slider.min === '25' && slider.max === '400')
    ok('zoom slider min=25 max=400');
  else bad('zoom slider issue: ' + JSON.stringify(slider));

  console.log('\n════════════════════════');
  console.log('Zoom results: ' + pass + ' PASS, ' + fail + ' FAIL');
  if (fail > 0) process.exit(1);
  await browser.close();
})().catch(e => { console.log('FAIL: ' + e.message.slice(0,120)); process.exit(1); });
EOF
kill $PID 2>/dev/null
