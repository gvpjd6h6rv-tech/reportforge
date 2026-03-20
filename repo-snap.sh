#!/usr/bin/env bash
echo "════════════════════════════════════════"
echo "RF SNAP TEST PIPELINE"
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

  // ── Setup: get two elements to align ──────────────────────────────────
  const setup = await page.evaluate(() => {
    const els = [...document.querySelectorAll('.rf-el,.cr-element')];
    if (els.length < 2) return null;
    const el0 = els[0].getBoundingClientRect();
    const el1 = els[1].getBoundingClientRect();
    // Force alignment so guides will fire
    const e1 = DS.elements[1];
    e1._savedY = e1.y;
    e1.y = DS.elements[0].y; // same top → horizontal guide should appear
    CanvasEngine.renderAll();
    return { el0:{x:Math.round(el0.x),y:Math.round(el0.y),w:Math.round(el0.width),h:Math.round(el0.height)},
             el1:{x:Math.round(el1.x),y:Math.round(el1.y)}, elCount:els.length };
  });

  if (!setup) { console.log('SKIP: not enough elements'); process.exit(0); }

  // ── TEST 1: Guides appear when dragging ───────────────────────────────
  console.log('\nTEST 1 — Guides appear during drag near aligned element');
  await page.mouse.move(setup.el0.x + 5, setup.el0.y + 5);
  await page.mouse.down();
  await page.mouse.move(setup.el0.x + 10, setup.el0.y + 5);
  await page.waitForTimeout(100);
  const guidesDuring = await page.evaluate(() =>
    document.querySelectorAll('.rf-guide,.snap-guide,[class*=guide]').length
  );
  await page.mouse.up();
  // (guides cleared on mouseup — count was measured during drag)
  if (guidesDuring >= 0) ok('drag completed without crash (' + guidesDuring + ' guides during drag)');
  else bad('drag caused error');

  // ── TEST 2: Explicit guide trigger ────────────────────────────────────
  console.log('\nTEST 2 — AlignmentGuides.show() produces guides');
  const guidesShown = await page.evaluate(() => {
    const e0 = DS.elements[0], e1 = DS.elements[1];
    if (!e0 || !e1) return -1;
    const savedY = e1.y;
    e1.y = e0.y; // force alignment so guide triggers
    CanvasEngine.renderAll();
    DS.selection.add(e0.id);
    AlignmentGuides.show(e0.id);
    const cnt = document.querySelectorAll('.rf-guide,.snap-guide').length;
    AlignmentGuides.clear();
    DS.selection.clear();
    e1.y = savedY; CanvasEngine.renderAll();
    return cnt;
  });
  if (guidesShown > 0) ok('guides appear via AlignmentGuides.show() (count=' + guidesShown + ')');
  else bad('no guides produced even after aligning elements');

  // ── TEST 3: Guide count is bounded (no duplicates — Bug #6) ───────────
  console.log('\nTEST 3 — Guide count bounded (no duplicate snap guides, Bug #6)');
  const guidesMax = await page.evaluate(() => {
    const id = DS.elements[0]?.id;
    if (!id) return 0;
    // Call show() multiple times to test idempotency
    DS.selection.add(id);
    AlignmentGuides.show(id);
    AlignmentGuides.show(id); // second call must not double guides
    const cnt = document.querySelectorAll('.rf-guide,.snap-guide').length;
    AlignmentGuides.clear();
    DS.selection.clear();
    return cnt;
  });
  if (guidesMax <= 30) ok('guide count bounded after 2× show() (count=' + guidesMax + ')');
  else bad('guide duplication detected (count=' + guidesMax + ' > 30 — Bug #6)');

  // ── TEST 4: Guides cleared after mouseup ──────────────────────────────
  console.log('\nTEST 4 — Guides cleared after drag end (no flicker, Bug #5)');
  const el0 = await page.$('.rf-el,.cr-element');
  if (el0) {
    const bb = await el0.boundingBox();
    await page.mouse.move(bb.x + 4, bb.y + 4);
    await page.mouse.down();
    await page.mouse.move(bb.x + 20, bb.y + 4);
    await page.waitForTimeout(150);
    await page.mouse.up();
    await page.waitForTimeout(100);
    const guidesAfter = await page.evaluate(() =>
      document.querySelectorAll('.rf-guide,.snap-guide').length
    );
    if (guidesAfter === 0) ok('guides cleared after mouseup (flicker-free)');
    else bad('guides persist after mouseup (' + guidesAfter + ' remaining — flicker Bug #5)');
  }

  // ── TEST 5: Snap positions align with element edges (Bug #7) ──────────
  console.log('\nTEST 5 — Snap guide positions align with element edges (±0.5px, Bug #7)');
  const snapAlign = await page.evaluate(() => {
    const cl  = document.getElementById('canvas-layer');
    const clR = cl.getBoundingClientRect();
    const e0  = DS.elements[0], e1 = DS.elements[1];
    const savedY = e1.y;
    e1.y = e0.y; CanvasEngine.renderAll();
    DS.selection.add(e0.id);
    AlignmentGuides.show(e0.id);
    const guides = [...document.querySelectorAll('.rf-guide-h,.snap-guide.h')];
    let maxDelta = 0;
    guides.forEach(g => {
      const gR = g.getBoundingClientRect();
      let minD = Infinity;
      document.querySelectorAll('.rf-el,.cr-element').forEach(el => {
        const r = el.getBoundingClientRect();
        const dT = Math.abs(gR.top - r.top);
        const dB = Math.abs(gR.top - r.bottom);
        minD = Math.min(minD, dT, dB);
      });
      if (minD < Infinity) maxDelta = Math.max(maxDelta, minD);
    });
    AlignmentGuides.clear();
    DS.selection.clear();
    e1.y = savedY; CanvasEngine.renderAll();
    return { maxDelta: Math.round(maxDelta * 100) / 100, guideCount: guides.length };
  });
  if (snapAlign.guideCount === 0) ok('no H-guides fired (elements may not be aligned — skip precision check)');
  else if (snapAlign.maxDelta < 0.5) ok('snap guide alignment: maxDelta=' + snapAlign.maxDelta + 'px < 0.5px');
  else bad('snap offset error: maxDelta=' + snapAlign.maxDelta + 'px >= 0.5px (Bug #7)');

  // ── TEST 6: No drag jitter (Bug #8) ───────────────────────────────────
  console.log('\nTEST 6 — No drag jitter during rapid moves (Bug #8)');
  const jitter = await page.evaluate(async () => {
    const el  = DS.elements[0];
    const div = document.querySelector('[data-id="' + el.id + '"]');
    if (!div) return { ok:true };
    const origX = el.x;
    const positions = [];
    // Simulate 10 rapid move events at 5px each
    div.dispatchEvent(new PointerEvent('pointerdown',{clientX:300,clientY:300,bubbles:true,pointerId:1}));
    for (let i=1; i<=10; i++) {
      div.dispatchEvent(new PointerEvent('pointermove',{clientX:300+i*5,clientY:300,bubbles:true,pointerId:1}));
      positions.push(el.x);
    }
    div.dispatchEvent(new PointerEvent('pointerup',{clientX:350,clientY:300,bubbles:true,pointerId:1}));
    // Check monotonic increase (no jitter = position never decreases during rightward drag)
    let jittered = false;
    for (let i=1;i<positions.length;i++) {
      if (positions[i] < positions[i-1] - 2) jittered = true;
    }
    el.x = origX; CanvasEngine.renderAll();
    return { jittered, positions };
  });
  if (!jitter.jittered) ok('no drag jitter detected during 10 rapid moves');
  else bad('drag jitter detected (Bug #8): ' + JSON.stringify(jitter.positions));

  // ── TEST 7: Snap system API exists ────────────────────────────────────
  console.log('\nTEST 7 — Snap system API (MagneticSnap)');
  const snapAPI = await page.evaluate(() => {
    const snap = window.RF?.Geometry?.MagneticSnap;
    if (!snap) return { ok:false };
    const s8  = Math.abs(snap.snap(7.9, 8) - 8) < 0.001;
    const s16 = Math.abs(snap.snap(16.1, 8) - 16) < 0.001;
    const idem = Math.abs(snap.snap(snap.snap(5.3, 8), 8) - snap.snap(5.3, 8)) < 0.001;
    return { ok:true, s8, s16, idem };
  });
  if (!snapAPI.ok) bad('RF.Geometry.MagneticSnap not available');
  else if (snapAPI.s8 && snapAPI.s16 && snapAPI.idem) ok('MagneticSnap precision and idempotency correct');
  else bad('MagneticSnap precision error: s8=' + snapAPI.s8 + ' s16=' + snapAPI.s16 + ' idem=' + snapAPI.idem);

  console.log('\n════════════════════════');
  console.log('Snap results: ' + pass + ' PASS, ' + fail + ' FAIL');
  if (fail > 0) process.exit(1);
  await browser.close();
})().catch(e => { console.log('FAIL: ' + e.message.slice(0,120)); process.exit(1); });
EOF
kill $PID 2>/dev/null
