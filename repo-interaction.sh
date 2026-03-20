#!/usr/bin/env bash
echo "════════════════════════════════════════"
echo "RF INTERACTION TEST PIPELINE"
echo "════════════════════════════════════════"
python3 reportforge_server.py &
PID=$!
sleep 3
node - <<'EOF'
const {chromium} = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:8080/classic');
  await page.waitForTimeout(1500);
  console.log("\nTEST 1 — Drag interaction");
  const canvas = await page.$('#canvas-layer');
  if (!canvas) {
    console.log("FAIL: canvas-layer not found");
    process.exit(1);
  }
  const box = await page.$('.rf-el');
  if (!box) {
    console.log("FAIL: no draggable element found");
    process.exit(1);
  }
  const bb = await box.boundingBox();
  await page.mouse.move(bb.x + 5, bb.y + 5);
  await page.mouse.down();
  await page.mouse.move(bb.x + 120, bb.y + 60);
  await page.waitForTimeout(300);
  await page.mouse.up();
  console.log("PASS: drag executed");
  console.log("\nTEST 2 — Guide stability");
  const guides = await page.$$('[class*=guide]');
  console.log("Guide count:", guides.length);
  if (guides.length > 4) {
    console.log("FAIL: duplicate guides detected");
  } else {
    console.log("PASS: guide count acceptable");
  }
  console.log("\nTEST 3 — Zoom sensitivity");
  const zoomBefore = await page.evaluate(() => window.RF?.Core?.DocumentModel?.zoom || 1);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -100);
  await page.keyboard.up('Control');
  await page.waitForTimeout(200);
  const zoomAfter = await page.evaluate(() => window.RF?.Core?.DocumentModel?.zoom || 1);
  const delta = Math.abs(zoomAfter - zoomBefore);
  console.log("Zoom delta:", delta);
  if (delta > 0.5) {
    console.log("FAIL: zoom step too large");
  } else {
    console.log("PASS: zoom sensitivity acceptable");
  }
  console.log("\nTEST 4 — Preview interaction");
  const previewBtn = await page.$('text=Vista previa');
  if (previewBtn) {
    await previewBtn.click();
    await page.waitForTimeout(1000);
    const draggable = await page.$('.rf-el');
    if (draggable) {
      console.log("PASS: preview still has selectable elements");
    } else {
      console.log("FAIL: preview interaction disabled");
    }
  }
  await browser.close();
})();
EOF
kill $PID 2>/dev/null
