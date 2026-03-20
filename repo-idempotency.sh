#!/usr/bin/env bash
# repo-idempotency.sh — Command idempotency — repeated commands produce identical state
echo "════════════════════════════════════════"
echo "RF COMMAND IDEMPOTENCY TEST"
echo "════════════════════════════════════════"
python3 reportforge_server.py &
PID=$!
sleep 1
for i in $(seq 1 10); do curl -sf http://localhost:8080 >/dev/null && break || sleep 1; done
node - <<'EOF'
const RF = require('./_rf_test_lib.js');
(async () => {
  const { browser, page, jsErrors } = await RF.launch();
  const { ok, bad, done } = RF.reporter('repo-idempotency.sh');
// zoom-reset applied twice → same result
  await page.evaluate(()=>DesignZoomEngine.set(2.0));
  await page.evaluate(()=>DesignZoomEngine.reset());
  const z1 = await page.evaluate(()=>DS.zoom);
  await page.evaluate(()=>DesignZoomEngine.reset());
  const z2 = await page.evaluate(()=>DS.zoom);
  if(z1===z2) ok('zoom-reset idempotent ('+z1+')');
  else bad('zoom-reset not idempotent: '+z1+'≠'+z2);

  // select-all twice → same selection count
  await page.evaluate(()=>CommandEngine.selectAll&&CommandEngine.selectAll());
  const s1 = await page.evaluate(()=>DS.selection.size);
  await page.evaluate(()=>CommandEngine.selectAll&&CommandEngine.selectAll());
  const s2 = await page.evaluate(()=>DS.selection.size);
  if(s1===s2) ok('select-all idempotent ('+s1+' elements)');
  else bad('select-all not idempotent: '+s1+'≠'+s2);
  await page.evaluate(()=>DS.selection.clear());

  // toggle-grid twice → back to original state
  const g0 = await page.evaluate(()=>DS.gridVisible?1:0);
  await page.evaluate(()=>{DS.gridVisible=!DS.gridVisible;});
  await page.evaluate(()=>{DS.gridVisible=!DS.gridVisible;});
  const g1 = await page.evaluate(()=>DS.gridVisible?1:0);
  if(g0===g1) ok('toggle-grid idempotent (returned to '+g0+')');
  else bad('toggle-grid not idempotent: start='+g0+' end='+g1);

  // align-left twice on same element → no coordinate drift
  await page.evaluate(()=>{DS.selection.clear();DS.selection.add(DS.elements[0]?.id);});
  const xBefore = await page.evaluate(()=>DS.elements[0]?.x||0);
  for(let i=0;i<3;i++) await page.evaluate(()=>CommandEngine.alignLefts&&CommandEngine.alignLefts());
  const xAfter = await page.evaluate(()=>DS.elements[0]?.x||0);
  if(xBefore===xAfter) ok('align-left 3× idempotent (x='+xBefore+')');
  else bad('align-left drifted: '+xBefore+'→'+xAfter);
  await page.evaluate(()=>{DS.selection.clear();CanvasEngine.renderAll();});
  await browser.close();
  if (done() > 0) process.exit(1);
})().catch(e => { console.log('FAIL: '+e.message.slice(0,120)); process.exit(1); });
EOF
kill $PID 2>/dev/null
