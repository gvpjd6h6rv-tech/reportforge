#!/usr/bin/env bash
echo "════════════════════════════════════════"
echo "RF LAYOUT REFLOW"
echo "════════════════════════════════════════"
python3 reportforge_server.py & PID=$!; sleep 1
for i in $(seq 1 10); do curl -sf http://localhost:8080 >/dev/null && break || sleep 1; done
node - <<'EOF'
const {chromium} = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport:{width:1400,height:900} });
  await page.goto('http://localhost:8080/classic');
  await page.waitForTimeout(3000);
  await page.waitForFunction("() => typeof DS !== 'undefined' && DS.elements.length > 0");
  let pass=0, fail=0;
  const ok=m=>{console.log('  PASS: '+m);pass++;};
  const bad=m=>{console.log('  FAIL: '+m);fail++;};

  const snap = () => page.evaluate(() => {
    const rv=document.getElementById('ruler-v'), rh=document.getElementById('ruler-h-canvas');
    const ws=document.getElementById('workspace'), cl=document.getElementById('canvas-layer');
    const rvR=rv?.getBoundingClientRect(), wsR=ws?.getBoundingClientRect(), clR=cl?.getBoundingClientRect();
    return {
      rvW: rv?.offsetWidth||0, rvH: Math.round(rvR?.height||0),
      rhW: Math.round(rh?.getBoundingClientRect().width||0),
      wsX: Math.round(wsR?.x||0), wsW: Math.round(wsR?.width||0),
      clX: Math.round(clR?.x||0), clOffW: cl?.offsetWidth||0,
      rvRight: Math.round((rvR?.x||0)+(rv?.offsetWidth||0)),
      clT: getComputedStyle(cl||document.body).transform,
    };
  });

  // Baseline
  const s0 = await snap();
  ok('baseline: ruler-v='+s0.rvW+'px, canvas='+s0.clOffW+'px, ws.x='+s0.wsX);

  // 1. Resize viewport narrower
  await page.setViewportSize({ width:1200, height:900 });
  await page.waitForTimeout(200);
  const s1 = await snap();
  if (s1.rvW > 0) ok('ruler-v visible after viewport resize to 1200px (w='+s1.rvW+')');
  else bad('ruler-v disappeared after viewport resize!');
  if (s1.clOffW === 754) ok('canvas width invariant at 1200px viewport (754px)');
  else bad('canvas width changed to '+s1.clOffW+'px');
  if (s1.clT === 'none') ok('canvas.transform=none after resize');
  else bad('canvas.transform: '+s1.clT);

  // 2. Workspace-ruler alignment invariant after resize
  if (Math.abs(s1.wsX - s1.rvRight) <= 1)
    ok('workspace starts at ruler right after resize (wsX='+s1.wsX+' rvRight='+s1.rvRight+')');
  else bad('workspace/ruler misaligned after resize: wsX='+s1.wsX+' rvRight='+s1.rvRight);

  // 3. Resize wider
  await page.setViewportSize({ width:1600, height:900 });
  await page.waitForTimeout(200);
  const s2 = await snap();
  if (s2.rvW > 0) ok('ruler-v visible at 1600px viewport');
  else bad('ruler-v disappeared at 1600px!');
  if (s2.clOffW === 754) ok('canvas width still 754px at 1600px viewport');
  else bad('canvas width changed: '+s2.clOffW+'px');

  // 4. Restore and verify recovery
  await page.setViewportSize({ width:1400, height:900 });
  await page.waitForTimeout(200);
  const s3 = await snap();
  if (Math.abs(s3.rvW - s0.rvW) <= 2)
    ok('layout recovered to original dimensions (ruler-v='+s3.rvW+'px)');
  else bad('layout did not recover: rvW='+s3.rvW+' expected '+s0.rvW);

  console.log('  --- Layout reflow: '+pass+' PASS, '+fail+' FAIL');
  await browser.close(); process.exit(fail>0?1:0);
})().catch(e=>{console.log('  FAIL: '+e.message.slice(0,120));process.exit(1);});
EOF
kill $PID 2>/dev/null
