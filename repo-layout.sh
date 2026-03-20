#!/usr/bin/env bash
echo "════════════════════════════════════════"
echo "RF LAYOUT TEST PIPELINE"
echo "════════════════════════════════════════"
python3 reportforge_server.py &
PID=$!
sleep 1
for i in $(seq 1 10); do curl -sf http://localhost:8080 >/dev/null && break || sleep 1; done

node - <<'EOF'
const RF = require('./_rf_test_lib.js');
(async () => {
  const { browser, page } = await RF.launch();
  const { ok, bad, done } = RF.reporter('repo-layout');

  const layout = await page.evaluate(() => {
    function rect(id) {
      const el = document.getElementById(id) || document.querySelector('.'+id);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x:Math.round(r.x), y:Math.round(r.y), w:Math.round(r.width), h:Math.round(r.height) };
    }
    const cl = document.getElementById('canvas-layer');
    const ws = document.getElementById('workspace');
    const vp = document.getElementById('viewport');
    const clR = cl?.getBoundingClientRect();
    const wsR = ws?.getBoundingClientRect();
    return {
      toolbar:       rect('toolbars'),
      workspace:     rect('workspace'),
      rulerHCanvas:  rect('ruler-h-canvas'),
      rulerV:        rect('ruler-v'),
      rulerHRow:     rect('ruler-h-row'),
      sectionGutter: rect('section-gutter'),
      hRulerAlias:   !!document.getElementById('h-ruler'),
      vRulerAlias:   !!document.getElementById('v-ruler'),
      canvasX:       Math.round(clR?.x || 0),
      canvasW:       Math.round(clR?.width || 0),
      wsX:           Math.round(wsR?.x || 0),
      wsW:           Math.round(wsR?.width || 0),
      vpTransform:   getComputedStyle(vp || document.body).transform,
      clTransform:   getComputedStyle(cl || document.body).transform,
    };
  });

  // TEST 1
  layout.toolbar && layout.toolbar.h > 0
    ? ok('toolbar present (h='+layout.toolbar.h+')')
    : bad('toolbar missing or zero-height');
  // TEST 2
  layout.workspace && layout.workspace.w > 200
    ? ok('workspace present (w='+layout.workspace.w+')')
    : bad('workspace missing or too narrow');
  // TEST 3
  layout.rulerHCanvas && layout.rulerHCanvas.w > 0
    ? ok('horizontal ruler visible (w='+layout.rulerHCanvas.w+')')
    : bad('horizontal ruler missing');
  // TEST 4
  layout.rulerV && layout.rulerV.h > 0
    ? ok('vertical ruler visible (h='+layout.rulerV.h+')')
    : bad('vertical ruler missing');
  // TEST 5
  layout.sectionGutter
    ? ok('section gutter present')
    : bad('section gutter missing');
  // TEST 6
  layout.hRulerAlias ? ok('#h-ruler alias exists') : bad('#h-ruler alias missing');
  layout.vRulerAlias ? ok('#v-ruler alias exists') : bad('#v-ruler alias missing');
  // TEST 7
  const leftOffset = layout.canvasX - layout.wsX;
  leftOffset < 200
    ? ok('canvas left offset reasonable (offset='+leftOffset+'px)')
    : bad('canvas appears centered (offset='+leftOffset+'px)');
  // TEST 8
  layout.canvasW > 0 && layout.canvasW < layout.wsW
    ? ok('canvas narrower than workspace (canvas='+layout.canvasW+' ws='+layout.wsW+')')
    : bad('canvas spans full workspace — rulers may be missing');
  // TEST 9
  layout.clTransform === 'none'
    ? ok('canvas-layer has no transform (zoom correctly on viewport)')
    : bad('canvas-layer has transform: '+layout.clTransform);
  // TEST 10
  const relX = layout.canvasX - layout.wsX;
  relX < 200
    ? ok('canvas offset within workspace: '+relX+'px < 200 ✓')
    : bad('canvas.x-ws.x='+relX+' >= 200 — centering bug');
  // TEST 11
  layout.rulerHRow && layout.rulerHRow.h > 0
    ? ok('ruler-h-row visible (h='+layout.rulerHRow.h+')')
    : bad('ruler-h-row collapsed');
  // TEST 12
  const centered = layout.canvasX > (layout.wsX + layout.wsW / 3);
  !centered ? ok('canvas not excessively centered') : bad('canvas centering bug');
  // TEST 13
  const wsRuler = await page.evaluate(() => {
    const rv = document.getElementById('ruler-v');
    const ws = document.getElementById('workspace');
    const rvR = rv?.getBoundingClientRect();
    const wsR = ws?.getBoundingClientRect();
    return { wsX:Math.round(wsR?.x||0), rvRight:Math.round((rvR?.x||0)+(rv?.offsetWidth||0)) };
  });
  Math.abs(wsRuler.wsX - wsRuler.rvRight) <= 1
    ? ok('workspaceX('+wsRuler.wsX+') == rulerRight('+wsRuler.rvRight+')')
    : bad('workspace/ruler mismatch: wsX='+wsRuler.wsX+' rulerRight='+wsRuler.rvRight);

  await browser.close();
  const n = done();
  process.exit(n > 0 ? 1 : 0);
})().catch(e => { console.log('FAIL: '+e.message.slice(0,120)); process.exit(1); });
EOF

kill $PID 2>/dev/null
