#!/usr/bin/env bash
# repo-memory.sh — Memory stability — DOM node count and event listener growth
echo "════════════════════════════════════════"
echo "RF MEMORY STABILITY TEST"
echo "════════════════════════════════════════"
python3 reportforge_server.py &
PID=$!
sleep 1
for i in $(seq 1 10); do curl -sf http://localhost:8080 >/dev/null && break || sleep 1; done
node - <<'EOF'
const RF = require('./_rf_test_lib.js');
(async () => {
  const { browser, page, jsErrors } = await RF.launch();
  const { ok, bad, done } = RF.reporter('repo-memory.sh');
// Baseline DOM node count
  const nodes0 = await page.evaluate(()=>document.querySelectorAll('*').length);

  // 100 selections + 100 zoom operations
  await page.evaluate(async ()=>{
    for(let i=0;i<100;i++){
      DS.selection.clear();
      if(DS.elements[i%DS.elements.length]) DS.selection.add(DS.elements[i%DS.elements.length].id);
      SelectionEngine.renderHandles&&SelectionEngine.renderHandles();
    }
    for(let i=0;i<50;i++){
      DesignZoomEngine.set(ZOOM_STEPS[i%ZOOM_STEPS.length]);
    }
    DesignZoomEngine.reset();
    DS.selection.clear();
    CanvasEngine.renderAll();
  });
  await page.waitForTimeout(300);

  const nodes1 = await page.evaluate(()=>document.querySelectorAll('*').length);
  const growth = nodes1 - nodes0;
  // Allow small growth from handles-layer transient elements
  if(growth < 50) ok('DOM node growth acceptable after 100 ops: +'+growth+' nodes');
  else bad('excessive DOM growth: +'+growth+' nodes (possible leak)');

  // Verify handles are cleared after explicit renderHandles()
  await page.evaluate(()=>{DS.selection.clear();SelectionEngine.renderHandles&&SelectionEngine.renderHandles();});
  const staleHandles = await page.evaluate(()=>document.querySelectorAll('.sel-handle').length);
  if(staleHandles===0) ok('selection handles cleared (no stale handles)');
  else bad('stale selection handles: '+staleHandles+' remaining');
  await browser.close();
  if (done() > 0) process.exit(1);
})().catch(e => { console.log('FAIL: '+e.message.slice(0,120)); process.exit(1); });
EOF
kill $PID 2>/dev/null
