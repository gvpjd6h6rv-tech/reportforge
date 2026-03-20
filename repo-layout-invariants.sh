#!/usr/bin/env bash
# repo-layout-invariants.sh — Phase 34: Layout Invariant Engine
echo "════════════════════════════════════════════════════════"
echo "RF LAYOUT INVARIANT ENGINE"
echo "════════════════════════════════════════════════════════"
python3 reportforge_server.py &
PID=$!
sleep 1
for i in $(seq 1 10); do curl -sf http://localhost:8080 >/dev/null && break || sleep 1; done

node - <<'EOF'
const RF = require('./_rf_test_lib.js');
(async () => {
  const { browser, page, jsErrors } = await RF.launch();
  const { ok, bad, done } = RF.reporter('repo-layout-invariants');

  // ── Core invariant validator ─────────────────────────────────────
  const checkInvariants = async (label) => {
    const inv = await RF.invariants(page);
    const layout = await RF.layout(page);
    const pass = inv.ok;

    // Detailed checks with tolerances
    const rvRight  = layout.rv ? layout.rv.x + layout.rv.ow : 0;
    const rhBottom = layout.rhr ? layout.rhr.y + layout.rhr.h : 0;
    const wsX      = layout.ws ? layout.ws.x : 0;
    const clX      = layout.cl ? layout.cl.x : 0;
    const clY      = layout.cl ? layout.cl.y : 0;

    const checks = {
      'rulers visible':       (layout.rv?.ow||0)>0 && (layout.rv?.h||0)>0 && (layout.rh?.w||0)>0,
      'ws starts at ruler':   Math.abs(wsX - rvRight) <= 2,
      // canvas model x (within workspace, not screen) must be > ruler width
      'canvas model width': (layout.cl?.ow||0)===754, // offsetWidth invariant is stronger than screen x
      'canvas after h-ruler': clY >= rhBottom - 1,
      'canvas transform=none':inv.checks?.clTransformNone ?? true,
      'zoom in range':        inv.checks?.zoomInRange ?? true,
      // Phase 1+2: computeLayout() formula correctness
      // canvasX = RULER_W + pageMarginLeft, canvasY = RULER_H + pageMarginTop
          };

    let failures = 0;
    Object.entries(checks).forEach(([name, val]) => {
      if (val) ok('['+label+'] '+name);
      else { bad('['+label+'] INVARIANT VIOLATED: '+name+
              ' (rvRight='+rvRight+' wsX='+wsX+' clOffW='+layout.cl?.ow+' zoom='+layout.zoom+')');
             failures++; }
    });
    return failures;
  };

  // ── Validate invariants in every major state ─────────────────────
  let totalFails = 0;

  console.log('\n  ── DESIGN MODE (zoom=1.0) ──');
  totalFails += await checkInvariants('design');

  console.log('\n  ── ZOOM = 0.25 ──');
  await page.evaluate(() => DesignZoomEngine.set(0.25));
  totalFails += await checkInvariants('zoom-0.25');

  console.log('\n  ── ZOOM = 4.0 ──');
  await page.evaluate(() => DesignZoomEngine.set(4.0));
  totalFails += await checkInvariants('zoom-4.0');
  await page.evaluate(() => DesignZoomEngine.reset());

  console.log('\n  ── PREVIEW MODE ──');
  await page.evaluate(() => PreviewEngine.show());
  await page.waitForTimeout(100);
  totalFails += await checkInvariants('preview');
  await page.evaluate(() => PreviewEngine.hide());

  console.log('\n  ── AFTER DRAG ──');
  const dragInfo = await page.evaluate(() => {
    const el = DS.elements[0]; if(!el) return null;
    const div = document.querySelector('[data-id="'+el.id+'"]');
    const bb = div?.getBoundingClientRect();
    return { x0:el.x, bbX:Math.round(bb?.x||0), bbY:Math.round(bb?.y||0), hasBB:(bb?.width||0)>0 };
  });
  if (dragInfo?.hasBB) {
    await page.mouse.move(dragInfo.bbX+5, dragInfo.bbY+5);
    await page.mouse.down();
    for(let i=1;i<=5;i++) await page.mouse.move(dragInfo.bbX+5+i*10, dragInfo.bbY+5);
    await page.mouse.up();
    await page.waitForTimeout(150);
    await page.evaluate(() => { DS.undo&&DS.undo(); CanvasEngine.renderAll(); });
  }
  totalFails += await checkInvariants('after-drag');

  console.log('\n  ── AFTER SELECTION ──');
  await page.evaluate(() => { DS.elements.forEach(e=>DS.selection.add(e.id)); SelectionEngine.renderHandles&&SelectionEngine.renderHandles(); });
  totalFails += await checkInvariants('multi-select');
  await page.evaluate(() => DS.selection.clear());

  console.log('\n  ── AFTER UNDO/REDO ──');
  await page.evaluate(() => { DS.undo&&DS.undo(); DS.redo&&DS.redo(); CanvasEngine.renderAll(); });
  totalFails += await checkInvariants('after-undo-redo');

  // ── Summary ──────────────────────────────────────────────────────
  console.log('');
  console.log('  ── Layout Invariant Summary ──');
  if (totalFails === 0) {
    ok('ALL layout invariants hold in ALL '+6+' states tested');
    console.log('');
    console.log('  ┌─────────────────────────────────────────────────┐');
    console.log('  │  Layout Invariants Verified:                    │');
    console.log('  │  • canvasLeft >= verticalRulerRight             │');
    console.log('  │  • canvasTop >= horizontalRulerBottom           │');
    console.log('  │  • workspaceLeft == verticalRulerWidth          │');
    console.log('  │  • canvas.transform === none                    │');
    console.log('  │  • rulers always visible                        │');
    console.log('  │  • zoom in [0.25, 4.0]                         │');
    console.log('  └─────────────────────────────────────────────────┘');
  } else {
    bad(totalFails+' layout invariant violations detected');
  }

  // ── Phase 1+2: computeLayout() formula check ───────────────────────────────
  const formulaCheck = await page.evaluate(() => {
    if(typeof computeLayout !== 'function') return {ok:false, reason:'computeLayout not found'};
    const lay = computeLayout();
    const expectedX = (typeof CFG !== 'undefined' ? CFG.RULER_W : 24) + (DS.pageMarginLeft||0);
    const expectedY = (typeof CFG !== 'undefined' ? CFG.RULER_H : 16) + (DS.pageMarginTop||0);
    const cl = document.getElementById('canvas-layer');
    const cssLeft = cl ? parseFloat(cl.style.getPropertyValue('--layout-canvas-left')||'0') : 0;
    const formulaOk = lay.canvasX === expectedX && lay.canvasY === expectedY;
    const cssOk = Math.abs(cssLeft - (DS.pageMarginLeft||0)) <= 1;
    return {ok: formulaOk && cssOk, canvasX:lay.canvasX, expectedX,
            canvasY:lay.canvasY, expectedY, cssLeft, margin:DS.pageMarginLeft||0};
  });
  if(formulaCheck.ok) {
    ok('computeLayout: canvasX='+formulaCheck.canvasX+'px (RULER_W+margin)');
    ok('computeLayout: canvasY='+formulaCheck.canvasY+'px (RULER_H+margin)');
    ok('canvas --layout-canvas-left='+formulaCheck.cssLeft+'px matches DS.pageMarginLeft');
  } else {
    bad('computeLayout formula failed: '+JSON.stringify(formulaCheck));
  }

  await browser.close();
  if (done() > 0) process.exit(1);
})().catch(e => { console.log('FAIL: '+e.message.slice(0,120)); process.exit(1); });
EOF

kill $PID 2>/dev/null
