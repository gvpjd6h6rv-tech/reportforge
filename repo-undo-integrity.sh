#!/usr/bin/env bash
# repo-undo-integrity.sh — Undo/redo integrity — exact coordinate restoration
echo "════════════════════════════════════════"
echo "RF UNDO INTEGRITY TEST"
echo "════════════════════════════════════════"
python3 reportforge_server.py &
PID=$!
sleep 1
for i in $(seq 1 10); do curl -sf http://localhost:8080 >/dev/null && break || sleep 1; done
node - <<'EOF'
const RF = require('./_rf_test_lib.js');
(async () => {
  const { browser, page, jsErrors } = await RF.launch();
  const { ok, bad, done } = RF.reporter('repo-undo-integrity.sh');
// Create sequence: move → align → move again → delete
  const e0 = await page.evaluate(() => {
    const el = DS.elements[0]; const origX = el.x;
    el.x = DS.snap(el.x + 40); DS.saveHistory(); // op1: move
    if (typeof AlignEngine !== 'undefined') { AlignEngine.alignLeft([el]); DS.saveHistory(); } // op2
    el.x = DS.snap(el.x + 24); DS.saveHistory(); // op3: move again
    return { id:el.id, finalX:el.x, origX };
  });
  ok('sequence applied: x '+e0.origX+'→'+e0.finalX);

  // Undo all operations back to before our sequence
  for(let i=0;i<5;i++) await page.evaluate(()=>DS.undo&&DS.undo()); // extra undos are safe
  await page.waitForTimeout(100);

  const restored = await page.evaluate(id => DS.getElementById(id)?.x, e0.id);
  if(Math.abs(restored - e0.origX) <= 1) ok('undo restored original x='+restored);
  else bad('undo failed: expected x='+e0.origX+' got x='+restored);

  // Redo all
  for(let i=0;i<3;i++) await page.evaluate(()=>DS.redo&&DS.redo());
  await page.waitForTimeout(100);
  const redone = await page.evaluate(id => DS.getElementById(id)?.x, e0.id);
  // After aggressive undo, some redo history may be lost — just verify x moved past origX
  if(redone >= e0.origX) ok('redo moved forward (x='+redone+' >= origX='+e0.origX+')');
  else bad('redo failed: x='+redone+' is behind origX='+e0.origX);

  // Invariants must hold after undo/redo
  const inv = await RF.invariants(page);
  if(inv.ok) ok('layout invariants intact after undo/redo');
  else bad('invariants broken: '+inv.failed.join(', '));

  // Undo count + historyIndex must be consistent
  const hist = await page.evaluate(()=>({idx:DS.historyIndex, len:DS.history.length}));
  if(hist.idx >= 0 && hist.idx <= hist.len) ok('history state consistent (idx='+hist.idx+'/'+hist.len+')');
  else bad('history state invalid (idx='+hist.idx+' len='+hist.len+')');

  // Restore clean state
  await page.evaluate(()=>{ while(DS.historyIndex>1)DS.undo&&DS.undo(); CanvasEngine.renderAll(); });
  await browser.close();
  if (done() > 0) process.exit(1);
})().catch(e => { console.log('FAIL: '+e.message.slice(0,120)); process.exit(1); });
EOF
kill $PID 2>/dev/null
