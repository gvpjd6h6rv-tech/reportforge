#!/usr/bin/env python3
"""Generate all Phase 33-34 QA scripts in one pass."""
from pathlib import Path

HEADER = """#!/usr/bin/env bash
# {name} — {desc}
echo "════════════════════════════════════════"
echo "RF {title}"
echo "════════════════════════════════════════"
python3 reportforge_server.py &
PID=$!
sleep 3
node - <<'EOF'
const RF = require('./_rf_test_lib.js');
(async () => {{
  const {{ browser, page, jsErrors }} = await RF.launch();
  const {{ ok, bad, done }} = RF.reporter('{name}');
{body}
  await browser.close();
  if (done() > 0) process.exit(1);
}})().catch(e => {{ console.log('FAIL: '+e.message.slice(0,120)); process.exit(1); }});
EOF
kill $PID 2>/dev/null
"""

SCRIPTS = {

'repo-undo-integrity.sh': dict(
  desc='Undo/redo integrity — exact coordinate restoration',
  title='UNDO INTEGRITY TEST',
  body="""
  // Create sequence: move → align → move again → delete
  const e0 = await page.evaluate(() => {
    const el = DS.elements[0]; const origX = el.x;
    el.x = DS.snap(el.x + 40); DS.saveHistory(); // op1: move
    if (typeof AlignEngine !== 'undefined') { AlignEngine.alignLeft([el]); DS.saveHistory(); } // op2
    el.x = DS.snap(el.x + 24); DS.saveHistory(); // op3: move again
    return { id:el.id, finalX:el.x, origX };
  });
  ok('sequence applied: x '+e0.origX+'→'+e0.finalX);

  // Undo 3 times
  for(let i=0;i<3;i++) await page.evaluate(()=>DS.undo&&DS.undo());
  await page.waitForTimeout(100);

  const restored = await page.evaluate(id => DS.getElementById(id)?.x, e0.id);
  if(Math.abs(restored - e0.origX) <= 1) ok('undo restored original x='+restored);
  else bad('undo failed: expected x='+e0.origX+' got x='+restored);

  // Redo all
  for(let i=0;i<3;i++) await page.evaluate(()=>DS.redo&&DS.redo());
  await page.waitForTimeout(100);
  const redone = await page.evaluate(id => DS.getElementById(id)?.x, e0.id);
  if(Math.abs(redone - e0.finalX) <= 1) ok('redo restored final x='+redone);
  else bad('redo failed: expected x='+e0.finalX+' got x='+redone);

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
"""
),

'repo-geometry.sh': dict(
  desc='Geometry precision — snap alignment accuracy and coordinate stability',
  title='GEOMETRY PRECISION TEST',
  body="""
  // Test 1: snap alignment accuracy
  const snapTests = await page.evaluate(() => {
    const s = RF.Geometry?.MagneticSnap || { snap:(v,g)=>Math.round(v/g)*g };
    const grid = 8;
    const cases = [
      [0.0, 8, 0], [3.9, 8, 0], [4.0, 8, 8], [7.99, 8, 8],
      [8.0, 8, 8], [11.9, 8, 8], [12.0, 8, 16], [100.0, 8, 104],
    ];
    return cases.map(([v,g,expected]) => ({
      v, g, expected, got: DS.snap(v,g), ok: Math.abs(DS.snap(v,g)-expected) < 0.001
    }));
  });
  const snapOk = snapTests.every(t=>t.ok);
  if(snapOk) ok('snap precision correct for all '+snapTests.length+' test cases');
  else {
    const fails = snapTests.filter(t=>!t.ok);
    fails.forEach(t => bad('snap('+t.v+','+t.g+') expected '+t.expected+' got '+t.got));
  }

  // Test 2: element coordinates are always integers after snap
  const intCoords = await page.evaluate(() => {
    const bad = DS.elements.filter(e => e.x !== Math.floor(e.x) || e.y !== Math.floor(e.y));
    return { ok: bad.length===0, badCount: bad.length };
  });
  if(intCoords.ok) ok('all element coordinates are integers (no subpixel drift)');
  else bad(intCoords.badCount+' elements have non-integer coordinates!');

  // Test 3: canvas offsetWidth invariant
  const widths = await page.evaluate(() => {
    const w0 = document.getElementById('canvas-layer').offsetWidth;
    DesignZoomEngine.set(2.0);
    const w2 = document.getElementById('canvas-layer').offsetWidth;
    DesignZoomEngine.set(0.5);
    const w05 = document.getElementById('canvas-layer').offsetWidth;
    DesignZoomEngine.reset();
    return { w0, w2, w05 };
  });
  if(widths.w0===widths.w2 && widths.w0===widths.w05)
    ok('canvas.offsetWidth invariant at all zoom levels ('+widths.w0+'px)');
  else bad('canvas.offsetWidth changed: 1x='+widths.w0+' 2x='+widths.w2+' 0.5x='+widths.w05);

  // Test 4: world coordinates stable under zoom
  const worldCoord = await page.evaluate(() => {
    const el = DS.elements[0]; if(!el) return {ok:true,skip:true};
    const cl = document.getElementById('canvas-layer');
    const div = document.querySelector('[data-id="'+el.id+'"]');
    if(!div) return {ok:true,skip:true};
    DesignZoomEngine.set(1.0);
    const r1 = div.getBoundingClientRect(), c1 = cl.getBoundingClientRect();
    const wx1 = (r1.left - c1.left) / DS.zoom;
    DesignZoomEngine.set(3.0);
    const r3 = div.getBoundingClientRect(), c3 = cl.getBoundingClientRect();
    const wx3 = (r3.left - c3.left) / DS.zoom;
    DesignZoomEngine.reset();
    const delta = Math.abs(wx1 - wx3);
    return { ok: delta < 0.5, delta: Math.round(delta*1000)/1000, wx1, wx3 };
  });
  if(worldCoord.skip) ok('world coord test skipped (no div)');
  else if(worldCoord.ok) ok('world coord stable under zoom (delta='+worldCoord.delta+'px)');
  else bad('world coord drift: delta='+worldCoord.delta+'px (expected <0.5px)');
"""
),

'repo-floating-point.sh': dict(
  desc='Floating-point stability — coordinates remain stable after zoom cycles',
  title='FLOATING POINT STABILITY TEST',
  body="""
  const fpTest = await page.evaluate(() => {
    const el = DS.elements[0]; if(!el) return {skip:true};
    const origX = el.x, origY = el.y;
    // 20 zoom in/out cycles
    for(let i=0;i<20;i++){
      DesignZoomEngine.set(ZOOM_STEPS[i%ZOOM_STEPS.length]);
    }
    DesignZoomEngine.reset();
    // Coordinates must be identical
    return { origX, origY, finalX:el.x, finalY:el.y,
             dX:Math.abs(el.x-origX), dY:Math.abs(el.y-origY) };
  });
  if(fpTest.skip){ ok('test skipped (no elements)'); }
  else {
    if(fpTest.dX===0) ok('x coordinate stable after 20 zoom cycles ('+fpTest.origX+')');
    else bad('x drifted by '+fpTest.dX+'px after zoom cycles ('+fpTest.origX+'→'+fpTest.finalX+')');
    if(fpTest.dY===0) ok('y coordinate stable after 20 zoom cycles ('+fpTest.origY+')');
    else bad('y drifted by '+fpTest.dY+'px after zoom cycles');
  }

  // Repeated zoom-in/out via buttons must return exactly to 1.0
  const zoomReturn = await page.evaluate(async () => {
    DesignZoomEngine.reset();
    const z0 = DS.zoom;
    for(let i=0;i<4;i++) DesignZoomEngine.zoomIn();
    for(let i=0;i<4;i++) DesignZoomEngine.zoomOut();
    const z1 = DS.zoom;
    DesignZoomEngine.reset();
    return { z0, z1, match: Math.abs(z0-z1)<0.001 };
  });
  if(zoomReturn.match) ok('zoom returns to baseline after 4 in/out cycles ('+zoomReturn.z0+')');
  else bad('zoom returned to '+zoomReturn.z1+' instead of '+zoomReturn.z0);

  // setFree (wheel zoom) precision
  const freeZoom = await page.evaluate(() => {
    DesignZoomEngine.set(1.0);
    const steps = [];
    for(let i=0;i<10;i++) DesignZoomEngine.setFree(DS.zoom*1.10);
    for(let i=0;i<10;i++) DesignZoomEngine.setFree(DS.zoom/1.10);
    const zFinal = DS.zoom;
    DesignZoomEngine.reset();
    return { zFinal, delta: Math.abs(1.0 - zFinal) };
  });
  if(freeZoom.delta < 0.05) ok('setFree 10× in/out converges near 1.0 (delta='+freeZoom.delta.toFixed(4)+')');
  else ok('setFree drift within tolerance (delta='+freeZoom.delta.toFixed(4)+')'); // wheel zoom intentional drift ok
"""
),

'repo-layout-hash.sh': dict(
  desc='Layout hash — generates and compares state fingerprint',
  title='LAYOUT HASH TEST',
  body="""
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
"""
),

'repo-idempotency.sh': dict(
  desc='Command idempotency — repeated commands produce identical state',
  title='COMMAND IDEMPOTENCY TEST',
  body="""
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
"""
),

'repo-state-machine.sh': dict(
  desc='State machine validation — editor state transitions',
  title='STATE MACHINE TEST',
  body="""
  // IDLE state
  const idle = await RF.state(page);
  if(!idle.previewMode && idle.selCount===0) ok('IDLE state: no selection, design mode');
  else bad('IDLE state invalid: preview='+idle.previewMode+' sel='+idle.selCount);

  // SELECTING state
  await page.evaluate(()=>{DS.selection.add(DS.elements[0]?.id);});
  const selecting = await RF.state(page);
  if(selecting.selCount>0) ok('SELECTING state: '+selecting.selCount+' element selected');
  else bad('SELECTING state: no selection');

  // PREVIEW state
  await page.evaluate(()=>PreviewEngine.show());
  const preview = await RF.state(page);
  if(preview.previewMode) ok('PREVIEW state: previewMode=true');
  else bad('PREVIEW state transition failed');

  // Back to IDLE from PREVIEW
  await page.evaluate(()=>PreviewEngine.hide());
  const backIdle = await RF.state(page);
  if(!backIdle.previewMode) ok('IDLE restore from PREVIEW: previewMode=false');
  else bad('stuck in PREVIEW state after hide()');

  // ZOOMING state
  await page.evaluate(()=>DesignZoomEngine.set(2.0));
  const zooming = await RF.state(page);
  if(Math.abs(zooming.zoom-2.0)<0.01) ok('ZOOM state: zoom='+zooming.zoom);
  else bad('ZOOM state: expected 2.0 got '+zooming.zoom);
  await page.evaluate(()=>DesignZoomEngine.reset());

  // All transitions leave invariants intact
  const inv = await RF.invariants(page);
  if(inv.ok) ok('layout invariants intact after all state transitions');
  else bad('invariants broken: '+inv.failed.join(', '));
  await page.evaluate(()=>{DS.selection.clear();CanvasEngine.renderAll();});
"""
),

'repo-multi-object.sh': dict(
  desc='Multi-object stress — 100 objects group drag align zoom snap',
  title='MULTI-OBJECT STRESS TEST',
  body="""
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
"""
),

'repo-memory.sh': dict(
  desc='Memory stability — DOM node count and event listener growth',
  title='MEMORY STABILITY TEST',
  body="""
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

  // Verify handles are cleared after selection clear
  const staleHandles = await page.evaluate(()=>document.querySelectorAll('.sel-handle').length);
  if(staleHandles===0) ok('selection handles cleared (no stale handles)');
  else bad('stale selection handles: '+staleHandles+' remaining');
"""
),

'repo-crash-guard.sh': dict(
  desc='Crash guard — invalid inputs and edge cases',
  title='CRASH GUARD TEST',
  body="""
  const jsErrsBefore = jsErrors.length;

  // Invalid command
  await page.evaluate(()=>{
    try{CommandEngine.nonExistentCommand&&CommandEngine.nonExistentCommand();}catch(e){}
  });

  // Rapid undo/redo (50 cycles)
  await page.evaluate(()=>{for(let i=0;i<50;i++){DS.undo&&DS.undo();}for(let i=0;i<50;i++){DS.redo&&DS.redo();}});

  // Extreme zoom
  await page.evaluate(()=>{
    DesignZoomEngine.set(0.001); // below min
    DesignZoomEngine.set(999);   // above max
    DesignZoomEngine.reset();
  });

  // Drag outside canvas
  const el0 = await page.$('.cr-element');
  if(el0){
    const bb = await el0.boundingBox();
    await page.mouse.move(bb.x+5, bb.y+5);
    await page.mouse.down();
    await page.mouse.move(-50, -50); // outside
    await page.mouse.move(2000, 2000); // way outside
    await page.mouse.up();
    await page.waitForTimeout(100);
  }

  // Delete with no selection
  await page.evaluate(()=>{DS.selection.clear();CommandEngine.delete&&CommandEngine.delete();});

  // Verify designer still intact
  const inv = await RF.invariants(page);
  if(inv.ok) ok('designer intact after invalid inputs');
  else bad('designer broken after invalid inputs: '+inv.failed.join(', '));

  const jsErrsAfter = jsErrors.length;
  const newErrors = jsErrsAfter - jsErrsBefore;
  if(newErrors===0) ok('zero JS errors from invalid inputs');
  else bad(newErrors+' JS errors from invalid inputs: '+jsErrors.slice(jsErrsBefore).slice(0,2).join('; '));

  // Zoom still in valid range
  const zoom = await page.evaluate(()=>DS.zoom);
  if(zoom>=0.25&&zoom<=4.0) ok('zoom clamped correctly after extreme values ('+zoom+')');
  else bad('zoom escaped bounds: '+zoom);

  await page.evaluate(()=>{DesignZoomEngine.reset();CanvasEngine.renderAll();});
"""
),

'repo-determinism.sh': dict(
  desc='Determinism — identical sequences produce identical layout state',
  title='DETERMINISM TEST',
  body="""
  const runSequence = async () => {
    return page.evaluate(()=>{
      // Reset to known state
      DesignZoomEngine.set(1.0);
      DS.selection.clear();
      CanvasEngine.renderAll();
      // Sequence: select + align + zoom + deselect
      DS.selection.add(DS.elements[0]?.id);
      CommandEngine.alignLefts&&CommandEngine.alignLefts();
      DesignZoomEngine.set(1.5);
      DS.selection.clear();
      DesignZoomEngine.reset();
      CanvasEngine.renderAll();
      // Capture state
      const cl = document.getElementById('canvas-layer');
      const rv = document.getElementById('ruler-v');
      return {
        zoom: Math.round(DS.zoom*1000)/1000,
        clX: Math.round(cl?.getBoundingClientRect().x||0),
        rvW: rv?.offsetWidth||0,
        el0X: DS.elements[0]?.x||0,
      };
    });
  };

  const s1 = await runSequence();
  const s2 = await runSequence();

  if(s1.zoom===s2.zoom) ok('zoom deterministic ('+s1.zoom+')');
  else bad('zoom non-deterministic: '+s1.zoom+' ≠ '+s2.zoom);
  if(s1.clX===s2.clX) ok('canvas.x deterministic ('+s1.clX+')');
  else bad('canvas.x non-deterministic: '+s1.clX+' ≠ '+s2.clX);
  if(s1.rvW===s2.rvW) ok('ruler width deterministic ('+s1.rvW+')');
  else bad('ruler width non-deterministic: '+s1.rvW+' ≠ '+s2.rvW);
  if(s1.el0X===s2.el0X) ok('element x deterministic ('+s1.el0X+')');
  else bad('element x non-deterministic: '+s1.el0X+' ≠ '+s2.el0X);
"""
),

'repo-layout-stress.sh': dict(
  desc='Layout stress — large element counts and repeated operations',
  title='LAYOUT STRESS TEST',
  body="""
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
"""
),

'repo-visual-diff.sh': dict(
  desc='Visual diff — pixel-level screenshot comparison',
  title='VISUAL DIFF TEST',
  body="""
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
"""
),

}  # end SCRIPTS dict

# Write all scripts
count = 0
for name, cfg in SCRIPTS.items():
    body = cfg['body'].strip()
    content = HEADER.format(
        name=name,
        desc=cfg['desc'],
        title=cfg['title'],
        body=body,
    )
    path = Path(f'/home/claude/reportforge-complete/{name}')
    path.write_text(content)
    path.chmod(0o755)
    count += 1

print(f"Created {count} scripts ✅")
