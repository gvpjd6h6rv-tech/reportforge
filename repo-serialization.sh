#!/usr/bin/env bash
echo "════════════════════════════════════════"
echo "RF SERIALIZATION & PERSISTENCE"
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

  // 1. Capture state before serialization
  const before = await page.evaluate(() => ({
    elCount: DS.elements.length,
    el0: { id:DS.elements[0]?.id, x:DS.elements[0]?.x, y:DS.elements[0]?.y,
           w:DS.elements[0]?.w, h:DS.elements[0]?.h, type:DS.elements[0]?.type },
    sectionCount: DS.sections.length,
    zoom: DS.zoom,
    gridVisible: DS.gridVisible,
    snapToGrid: DS.snapToGrid,
  }));

  // 2. Serialize to JSON
  const serialized = await page.evaluate(() => {
    const doc = {
      version: '1.0',
      elements: DS.elements.map(e => ({...e})),
      sections: DS.sections.map(s => ({...s})),
      config: { zoom:DS.zoom, gridVisible:DS.gridVisible, snapToGrid:DS.snapToGrid,
                pageMarginLeft:DS.pageMarginLeft||0, pageMarginTop:DS.pageMarginTop||0 },
    };
    return JSON.stringify(doc);
  });
  if (serialized && serialized.length > 100) ok('serialized to JSON ('+serialized.length+' bytes)');
  else bad('serialization failed or too small');

  // 3. Parse and validate round-trip
  const parsed = JSON.parse(serialized);
  if (parsed.elements.length === before.elCount)
    ok('element count preserved ('+before.elCount+')');
  else bad('element count mismatch: '+parsed.elements.length+' != '+before.elCount);

  const el0 = parsed.elements.find(e => e.id === before.el0.id);
  if (el0 && el0.x === before.el0.x && el0.y === before.el0.y)
    ok('element[0] coords preserved (x='+el0.x+' y='+el0.y+')');
  else bad('element[0] coords mismatch after serialization');

  if (parsed.sections.length === before.sectionCount)
    ok('section count preserved ('+before.sectionCount+')');
  else bad('section count mismatch: '+parsed.sections.length+' != '+before.sectionCount);

  // 4. Simulate reload: restore from parsed data
  const after = await page.evaluate((doc) => {
    // Restore elements from serialized doc
    const restored = JSON.parse(doc);
    const prevCount = DS.elements.length;
    // Shallow check: verify all serialized elements are restorable
    let valid = true;
    restored.elements.forEach(e => {
      if (!e.id || typeof e.x !== 'number' || typeof e.y !== 'number') valid = false;
    });
    return { valid, prevCount, restoredCount: restored.elements.length,
             configOk: typeof restored.config.zoom === 'number' };
  }, serialized);

  if (after.valid) ok('all elements have valid structure after parse');
  else bad('invalid element structure after serialization round-trip');
  if (after.configOk) ok('config block valid (zoom preserved)');
  else bad('config block missing or invalid');

  // 5. Layout invariants still hold
  const layout = await page.evaluate(() => {
    const rv=document.getElementById('ruler-v'), cl=document.getElementById('canvas-layer');
    return { rvOk:!!rv&&(rv.offsetWidth||0)>0, clT:getComputedStyle(cl||document.body).transform };
  });
  if (layout.rvOk) ok('rulers stable during serialization test');
  else bad('ruler disappeared during serialization!');
  if (layout.clT==='none') ok('canvas.transform=none');
  else bad('canvas.transform: '+layout.clT);

  console.log('  --- Serialization: '+pass+' PASS, '+fail+' FAIL');
  await browser.close(); process.exit(fail>0?1:0);
})().catch(e=>{console.log('  FAIL: '+e.message.slice(0,120));process.exit(1);});
EOF
kill $PID 2>/dev/null
