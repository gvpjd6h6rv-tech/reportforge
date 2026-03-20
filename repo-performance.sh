#!/usr/bin/env bash
echo "════════════════════════════════════════"
echo "RF PERFORMANCE TEST PIPELINE"
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
  console.log("\nTEST 1 — Drag performance");
  const box = await page.$('.rf-el');
  if (!box) {
    console.log("FAIL: no draggable element found");
    process.exit(1);
  }
  const bb = await box.boundingBox();
  const start = Date.now();
  await page.mouse.move(bb.x + 5, bb.y + 5);
  await page.mouse.down();
  for (let i = 0; i < 20; i++) {
    await page.mouse.move(bb.x + 5 + i*10, bb.y + 5);
  }
  await page.mouse.up();
  const end = Date.now();
  const dragTime = end - start;
  console.log("Drag duration:", dragTime, "ms");
  if (dragTime > 1000) {
    console.log("FAIL: drag too slow");
  } else {
    console.log("PASS: drag performance acceptable");
  }
  console.log("\nTEST 2 — Layout recalculation");
  const layoutCount = await page.evaluate(() => {
    let count = 0;
    const observer = new PerformanceObserver((list) => {
      list.getEntries().forEach(e => {
        if (e.name === 'layout') count++;
      });
    });
    observer.observe({entryTypes: ['measure']});
    return count;
  });
  console.log("Layout recalculations:", layoutCount);
  console.log("\nTEST 3 — FPS estimate");
  const fps = await page.evaluate(async () => {
    let frames = 0;
    const start = performance.now();
    return new Promise(resolve => {
      function frame() {
        frames++;
        if (performance.now() - start < 1000) {
          requestAnimationFrame(frame);
        } else {
          resolve(frames);
        }
      }
      requestAnimationFrame(frame);
    });
  });
  console.log("FPS:", fps);
  if (fps < 30) {
    console.log("FAIL: low frame rate");
  } else {
    console.log("PASS: acceptable frame rate");
  }
  await browser.close();
})();
EOF
kill $PID 2>/dev/null
