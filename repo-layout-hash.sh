#!/usr/bin/env bash
# repo-layout-hash.sh — Layout hash — generates and compares state fingerprint
echo "════════════════════════════════════════"
echo "RF LAYOUT HASH TEST"
echo "════════════════════════════════════════"
python3 reportforge_server.py &
PID=$!
sleep 1
for i in $(seq 1 10); do curl -sf http://localhost:8080 >/dev/null && break || sleep 1; done
node - <<'EOF'
const RF = require('./_rf_test_lib.js');
(async () => {
  const { browser, page, jsErrors } = await RF.launch();
  const { ok, bad, done } = RF.reporter('repo-layout-hash.sh');
const hashState = async () => page.evaluate(() => {
    const cl = document.getElementById('canvas-layer');
    const rv = document.getElementById('ruler-v');
    const ws = document.getElementById('workspace');
    const clR = cl?.getBoundingClientRect();
    const sig = [
      Math.round(clR?.x||0), Math.round(clR?.y||0),
      cl?.offsetWidth||0,
      Math.round(ws?.getBoundingClientRect().x||0),
      rv?.offsetWidth||0,
      Math.round(DS.zoom*100),
      DS.elements.length,
      getComputedStyle(cl||document.body).transform==='none'?1:0,
    ].join('|');
    // Simple hash
    let h=0;for(const c of sig){h=(h<<5)-h+c.charCodeAt(0);h=h&h;}
    return {sig, hash:h.toString(16)};
  });

  const h1 = await hashState();
  ok('baseline hash: '+h1.hash+' (sig='+h1.sig+')');

  // After zoom and restore, hash must match
  await page.evaluate(()=>{ DesignZoomEngine.set(2.0); DesignZoomEngine.reset(); });
  await page.waitForTimeout(100);
  const h2 = await hashState();
  if(h1.hash===h2.hash) ok('hash identical after zoom+reset ('+h2.hash+')');
  else bad('hash changed after zoom+reset: '+h1.hash+' → '+h2.hash+' (sig='+h2.sig+')');

  // After preview toggle, hash must match
  await page.evaluate(()=>{ PreviewEngine.show(); PreviewEngine.hide(); });
  await page.waitForTimeout(150);
  const h3 = await hashState();
  if(h1.hash===h3.hash) ok('hash identical after preview toggle ('+h3.hash+')');
  else bad('hash changed after preview toggle: '+h1.hash+' → '+h3.hash);
  await browser.close();
  if (done() > 0) process.exit(1);
})().catch(e => { console.log('FAIL: '+e.message.slice(0,120)); process.exit(1); });
EOF
kill $PID 2>/dev/null
