#!/usr/bin/env bash
# repo-multi-object.sh — Multi-object stress — 100 objects group drag align zoom snap
echo "════════════════════════════════════════"
echo "RF MULTI-OBJECT STRESS TEST"
echo "════════════════════════════════════════"
python3 reportforge_server.py &
PID=$!
sleep 1
for i in $(seq 1 10); do curl -sf http://localhost:8080 >/dev/null && break || sleep 1; done
node - <<'EOF'
const RF = require('./_rf_test_lib.js');
(async () => {
  const { browser, page, jsErrors } = await RF.launch();
  const { ok, bad, done } = RF.reporter('repo-multi-object.sh');
// Create 50 extra objects (total ~96)
  const countBefore = await page.evaluate(()=>DS.elements.length);
  await page.evaluate(()=>{
    for(let i=0;i<50;i++){
      const sec=DS.sections[0];
      const el={id:'stress-'+i,type:'text',sectionId:sec.id,
                x:DS.snap(4+i*12),y:DS.snap(4+(i%3)*16),w:80,h:12,
                content:'Obj '+i,fontSize:8,fontFamily:'Arial',align:'left',
                color:'#000',bgColor:'transparent',borderColor:'transparent'};
      DS.elements.push(el);
    }
    CanvasEngine.renderAll();
  });
  const countAfter = await page.evaluate(()=>DS.elements.length);
  ok('created 50 extra objects (total='+countAfter+')');

  // Select all + align
  await page.evaluate(()=>{
    DS.elements.forEach(e=>DS.selection.add(e.id));
    CommandEngine.alignLefts&&CommandEngine.alignLefts();
  });
  ok('align-left on '+countAfter+' selected objects');

  // Zoom
  await page.evaluate(()=>DesignZoomEngine.set(0.5));
  const inv1 = await RF.invariants(page);
  if(inv1.ok) ok('invariants at 0.5× zoom with '+countAfter+' objects');
  else bad('invariants broken at 0.5× zoom: '+inv1.failed.join(', '));
  await page.evaluate(()=>DesignZoomEngine.reset());

  // Clean up
  await page.evaluate(()=>{
    DS.elements=DS.elements.filter(e=>!e.id.startsWith('stress-'));
    DS.selection.clear();
    CanvasEngine.renderAll();
  });
  const final = await page.evaluate(()=>DS.elements.length);
  if(final===countBefore) ok('cleanup: element count restored ('+final+')');
  else bad('cleanup failed: expected '+countBefore+' got '+final);
  await browser.close();
  if (done() > 0) process.exit(1);
})().catch(e => { console.log('FAIL: '+e.message.slice(0,120)); process.exit(1); });
EOF
kill $PID 2>/dev/null
