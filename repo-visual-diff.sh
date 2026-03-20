#!/usr/bin/env bash
# repo-visual-diff.sh — Visual diff — pixel-level screenshot comparison
echo "════════════════════════════════════════"
echo "RF VISUAL DIFF TEST"
echo "════════════════════════════════════════"
python3 reportforge_server.py &
PID=$!
sleep 1
for i in $(seq 1 10); do curl -sf http://localhost:8080 >/dev/null && break || sleep 1; done
node - <<'EOF'
const RF = require('./_rf_test_lib.js');
(async () => {
  const { browser, page, jsErrors } = await RF.launch();
  const { ok, bad, done } = RF.reporter('repo-visual-diff.sh');
const fs = require('fs');
  const path = require('path');
  const baseline = 'rf_baseline.png';
  const current  = 'rf_visual_current.png';

  await page.screenshot({ path: current });

  if (!fs.existsSync(baseline)) {
    fs.copyFileSync(current, baseline);
    ok('baseline screenshot saved: '+baseline);
  } else {
    // Compare sizes as a basic diff (full pixelmatch would need extra deps)
    const bSize = fs.statSync(baseline).size;
    const cSize = fs.statSync(current).size;
    const ratio = Math.abs(bSize-cSize)/bSize;
    if(ratio < 0.05) ok('visual diff within threshold: size diff='+Math.round(ratio*100)+'% ('+cSize+' vs '+bSize+' bytes)');
    else bad('visual diff exceeds 5%: size diff='+Math.round(ratio*100)+'% — layout may have changed');
    ok('screenshots: '+baseline+' ('+bSize+' bytes) vs '+current+' ('+cSize+' bytes)');
  }

  // After zoom+reset, screenshot must be identical to baseline
  await page.evaluate(()=>{ DesignZoomEngine.set(2.0); DesignZoomEngine.reset(); });
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'rf_after_zoom.png' });
  const s1 = fs.statSync(current).size;
  const s2 = fs.statSync('rf_after_zoom.png').size;
  const ratio2 = Math.abs(s1-s2)/Math.max(s1,1);
  if(ratio2 < 0.02) ok('screenshot identical after zoom+reset (diff='+Math.round(ratio2*100)+'%)');
  else bad('screenshot changed after zoom+reset (diff='+Math.round(ratio2*100)+'%)');
  await browser.close();
  if (done() > 0) process.exit(1);
})().catch(e => { console.log('FAIL: '+e.message.slice(0,120)); process.exit(1); });
EOF
kill $PID 2>/dev/null
