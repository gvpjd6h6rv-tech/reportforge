#!/usr/bin/env bash
echo "════════════════════════════════════════"
echo "RF VISUAL TEST PIPELINE"
echo "════════════════════════════════════════"
python3 reportforge_server.py &
PID=$!
sleep 1
for i in $(seq 1 10); do curl -sf http://localhost:8080 >/dev/null && break || sleep 1; done
node - <<'EOF'
const {chromium} = require('playwright');
const fs = require('fs');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:8080/classic');
  await page.waitForTimeout(2000);

  let failed = 0;

  console.log("\nTEST 1 — Ruler presence (original IDs must have real dimensions)");
  const rulerMetrics = await page.evaluate(() => {
    function m(id){ const el=document.getElementById(id); if(!el)return{w:0,h:0,exists:false};
      const r=el.getBoundingClientRect(); return{w:Math.round(r.width),h:Math.round(r.height),exists:true}; }
    return { hCanvas:m('ruler-h-canvas'), vRuler:m('ruler-v'), hRow:m('ruler-h-row'),
             hAlias:m('h-ruler'), vAlias:m('v-ruler') };
  });
  if (!rulerMetrics.hCanvas.exists || rulerMetrics.hCanvas.w === 0) {
    console.log("FAIL: #ruler-h-canvas missing or zero-width"); failed++;
  } else { console.log("PASS: horizontal ruler visible (w=" + rulerMetrics.hCanvas.w + ")"); }
  if (!rulerMetrics.vRuler.exists || rulerMetrics.vRuler.h === 0) {
    console.log("FAIL: #ruler-v missing or zero-height"); failed++;
  } else { console.log("PASS: vertical ruler visible (h=" + rulerMetrics.vRuler.h + ")"); }
  if (rulerMetrics.hAlias.exists) console.log("PASS: #h-ruler alias exists");
  else { console.log("FAIL: #h-ruler alias missing"); failed++; }
  if (rulerMetrics.vAlias.exists) console.log("PASS: #v-ruler alias exists");
  else { console.log("FAIL: #v-ruler alias missing"); failed++; }

  console.log("\nTEST 2 — Section gutter");
  const gutter = await page.$('#section-gutter');
  if (!gutter) { console.log("FAIL: section gutter missing"); failed++; }
  else { console.log("PASS: section gutter present"); }

  console.log("\nTEST 3 — Canvas offset and layout integrity");
  const offsets = await page.evaluate(() => {
    const canvas = document.querySelector('#canvas-layer');
    const rect = canvas?.getBoundingClientRect();
    const ws = document.getElementById('workspace');
    const wsRect = ws?.getBoundingClientRect();
    // Canvas must not span full viewport width (rulers must be left of it)
    const canvasNotFullWidth = rect && wsRect && rect.width < wsRect.width;
    // Canvas left must be > workspace left (rulers take up space on left)
    const canvasHasLeftOffset = rect && wsRect && (rect.x > wsRect.x + 20);
    return { rect, wsRect, canvasNotFullWidth, canvasHasLeftOffset };
  });
  console.log("Canvas rect:", JSON.stringify(offsets.rect));
  if (!offsets.canvasHasLeftOffset) {
    console.log("FAIL: canvas has no left offset (rulers may be missing)"); failed++;
  } else { console.log("PASS: canvas has correct left offset from workspace"); }

  console.log("\nTEST 4 — Screenshot capture");
  await page.screenshot({ path: "rf_visual_test.png" });
  console.log("Screenshot saved: rf_visual_test.png");

  await browser.close();
  if (failed > 0) { console.log("\nFAIL: " + failed + " visual checks failed"); process.exit(1); }
  console.log("\nPASS: all visual checks passed");
})();
EOF
kill $PID 2>/dev/null
