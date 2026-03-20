#!/usr/bin/env bash
# repo-layout-stress.sh — Layout stress — large element counts and repeated operations
echo "════════════════════════════════════════"
echo "RF LAYOUT STRESS TEST"
echo "════════════════════════════════════════"
python3 reportforge_server.py &
PID=$!
sleep 1
for i in $(seq 1 10); do curl -sf http://localhost:8080 >/dev/null && break || sleep 1; done
node - <<'EOF'
const RF = require('./_rf_test_lib.js');
(async () => {
  const { browser, page, jsErrors } = await RF.launch();
  const { ok, bad, done } = RF.reporter('repo-layout-stress.sh');
const N = 30; // number of stress elements
  await page.evaluate(n=>{
    for(let i=0;i<n;i++){
      const sec=DS.sections[i%DS.sections.length];
      DS.elements.push({id:'ls-'+i,type:'text',sectionId:sec.id,
        x:DS.snap(4+i*8),y:DS.snap(4+(i%5)*12),w:60,h:10,content:'S'+i,
        fontSize:7,fontFamily:'Arial',align:'left',color:'#000',
        bgColor:'transparent',borderColor:'transparent'});
    }
    CanvasEngine.renderAll();
  }, N);

  // Zoom to 0.25 and back
  await page.evaluate(()=>{DesignZoomEngine.set(0.25);DesignZoomEngine.reset();});

  // All-select + align all
  await page.evaluate(()=>{
    DS.elements.forEach(e=>DS.selection.add(e.id));
    CommandEngine.alignLefts&&CommandEngine.alignLefts();
    CommandEngine.alignTops&&CommandEngine.alignTops();
    DS.selection.clear();
    CanvasEngine.renderAll();
  });

  const inv = await RF.invariants(page);
  if(inv.ok) ok('invariants after stress ('+N+' extra elements + align)');
  else bad('invariants broken under stress: '+inv.failed.join(', '));

  // Clean up
  await page.evaluate(n=>{
    DS.elements=DS.elements.filter(e=>!e.id.startsWith('ls-'));
    CanvasEngine.renderAll();
  }, N);
  ok('stress elements cleaned up');
  await browser.close();
  if (done() > 0) process.exit(1);
})().catch(e => { console.log('FAIL: '+e.message.slice(0,120)); process.exit(1); });
EOF
kill $PID 2>/dev/null
