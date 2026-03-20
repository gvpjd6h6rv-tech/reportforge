#!/usr/bin/env bash
# repo-ui-state.sh — Phase 30: UI State Snapshot Debugger
echo "════════════════════════════════════════"
echo "RF UI STATE SNAPSHOT DEBUGGER"
echo "════════════════════════════════════════"
python3 reportforge_server.py &
PID=$!
sleep 3

node - <<'EOF'
const {chromium} = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport:{width:1400,height:900} });
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  await page.goto('http://localhost:8080/classic');
  await page.waitForTimeout(3000);
  await page.waitForFunction("() => typeof DS !== 'undefined' && DS.elements.length > 0");

  let pass=0, fail=0;
  const ok  = m => { console.log('  PASS: '+m); pass++; };
  const bad = m => { console.log('  FAIL: '+m); fail++; };

  // ── State capture function ────────────────────────────────────────
  const captureState = async (label) => {
    const state = await page.evaluate(() => {
      const rv = document.getElementById('ruler-v');
      const rh = document.getElementById('ruler-h-canvas');
      const ws = document.getElementById('workspace');
      const cl = document.getElementById('canvas-layer');
      const vp = document.getElementById('viewport');
      const rvR = rv?.getBoundingClientRect();
      const rhR = rh?.getBoundingClientRect();
      const wsR = ws?.getBoundingClientRect();
      const clR = cl?.getBoundingClientRect();
      const guides = document.querySelectorAll('.rf-guide,.snap-guide');
      return {
        rulers: {
          horizontalVisible: !!rh && (rhR?.width||0)>0 && (rhR?.height||0)>0,
          verticalVisible:   !!rv && (rv?.offsetWidth||0)>0 && (rvR?.height||0)>0,
          hWidth:  Math.round(rhR?.width||0),
          vWidth:  Math.round(rv?.offsetWidth||0),
          vHeight: Math.round(rvR?.height||0),
        },
        canvas: {
          x:      Math.round(clR?.x||0),
          y:      Math.round(clR?.y||0),
          width:  Math.round(cl?.offsetWidth||0),
          height: Math.round(cl?.offsetHeight||0),
          transform: getComputedStyle(cl||document.body).transform,
        },
        viewport: {
          x:         Math.round(vp?.getBoundingClientRect().x||0),
          transform: getComputedStyle(vp||document.body).transform,
        },
        workspace: {
          left:    Math.round(wsR?.x||0),
          width:   Math.round(wsR?.width||0),
          scrollX: ws?.scrollLeft||0,
          scrollY: ws?.scrollTop||0,
        },
        zoom: {
          design:  DS.zoom,
          preview: DS.zoomPreview||1.0,
          design2: DS.zoomDesign||DS.zoom,
        },
        selection: {
          count: DS.selection.size,
          ids:   [...DS.selection].slice(0,3),
        },
        elements: {
          count: DS.elements.length,
        },
        snap: {
          guideCount: guides.length,
          snapEnabled: DS.snapToGrid||false,
          gridVisible: DS.gridVisible||false,
        },
        preview: {
          active: DS.previewMode||false,
        },
        jsErrors: window.__rfErrors?.length||0,
      };
    });
    return { label, timestamp: Date.now(), state };
  };

  // ── SNAPSHOT 1: Baseline (design mode, zoom=1, no selection) ─────
  console.log('\n── Capturing baseline snapshot ──');
  await page.evaluate(() => { DesignZoomEngine.reset(); DS.selection.clear(); CanvasEngine.renderAll(); });
  await page.waitForTimeout(200);
  const snap1 = await captureState('baseline');
  fs.writeFileSync('snapshot_before.json', JSON.stringify(snap1, null, 2));
  console.log('  snapshot_before.json written');

  // ── INTERACTION SEQUENCE ──────────────────────────────────────────
  // Perform a realistic sequence of actions
  await page.evaluate(() => {
    // 1. Select first element
    DS.selection.add(DS.elements[0]?.id);
    SelectionEngine.renderHandles();
    // 2. Move element
    const el = DS.elements[0];
    if(el){ el.x = DS.snap(el.x+16); DS.saveHistory(); CanvasEngine.renderAll(); }
  });
  await page.waitForTimeout(100);

  // 3. Zoom in
  await page.evaluate(() => DesignZoomEngine.set(1.5));
  await page.waitForTimeout(100);

  // 4. Toggle preview
  await page.evaluate(() => PreviewEngine.show());
  await page.waitForTimeout(150);
  await page.evaluate(() => PreviewEngine.hide());
  await page.waitForTimeout(100);

  // 5. Undo & restore
  await page.evaluate(() => { DS.undo&&DS.undo(); DesignZoomEngine.reset(); DS.selection.clear(); CanvasEngine.renderAll(); });
  await page.waitForTimeout(200);

  // ── SNAPSHOT 2: After interactions ───────────────────────────────
  console.log('\n── Capturing post-interaction snapshot ──');
  const snap2 = await captureState('after_interactions');
  fs.writeFileSync('snapshot_after.json', JSON.stringify(snap2, null, 2));
  console.log('  snapshot_after.json written');

  // ── STATE COMPARISON ─────────────────────────────────────────────
  console.log('\n── State Comparison ──');
  const s1 = snap1.state, s2 = snap2.state;

  // Rulers must survive all interactions
  if(s2.rulers.verticalVisible)
    ok('vertical ruler stable after interactions (w='+s2.rulers.vWidth+')');
  else bad('vertical ruler disappeared after interactions! was='+s1.rulers.verticalVisible+' now='+s2.rulers.verticalVisible);

  if(s2.rulers.horizontalVisible)
    ok('horizontal ruler stable after interactions (w='+s2.rulers.hWidth+')');
  else bad('horizontal ruler disappeared after interactions!');

  // Canvas dimensions must be invariant
  if(s1.canvas.width === s2.canvas.width)
    ok('canvas.offsetWidth invariant ('+s1.canvas.width+'='+s2.canvas.width+')');
  else bad('canvas width changed: '+s1.canvas.width+'→'+s2.canvas.width);

  // Canvas transform must remain none
  if(s2.canvas.transform === 'none')
    ok('canvas.transform=none after interactions');
  else bad('canvas.transform corrupted: '+s2.canvas.transform);

  // Workspace position must not drift
  const wsDelta = Math.abs(s1.workspace.left - s2.workspace.left);
  if(wsDelta <= 1)
    ok('workspace.left stable ('+s1.workspace.left+'→'+s2.workspace.left+')');
  else bad('workspace.left drifted by '+wsDelta+'px ('+s1.workspace.left+'→'+s2.workspace.left+')');

  // Canvas X must not drift unexpectedly
  const cxDelta = Math.abs(s1.canvas.x - s2.canvas.x);
  if(cxDelta <= 1)
    ok('canvas.x stable ('+s1.canvas.x+'→'+s2.canvas.x+')');
  else bad('canvas.x drifted by '+cxDelta+'px ('+s1.canvas.x+'→'+s2.canvas.x+')');

  // Zoom must be restored to baseline
  if(Math.abs(s2.zoom.design - s1.zoom.design) < 0.01)
    ok('zoom.design restored ('+s1.zoom.design+'→'+s2.zoom.design+')');
  else bad('zoom.design not restored: was='+s1.zoom.design+' now='+s2.zoom.design);

  // Preview must be off
  if(!s2.preview.active)
    ok('preview mode off after interactions');
  else bad('preview mode stuck ON after interactions!');

  // Element count must be identical (undo restored state)
  if(s1.elements.count === s2.elements.count)
    ok('element count stable after undo ('+s1.elements.count+'→'+s2.elements.count+')');
  else bad('element count changed: '+s1.elements.count+'→'+s2.elements.count+' (undo may have failed)');

  // No new JS errors
  if(s2.jsErrors === s1.jsErrors)
    ok('no new JS errors during interaction sequence');
  else bad('new JS errors: '+(s2.jsErrors-s1.jsErrors)+' error(s)');

  // No stale snap guides after interactions
  if(s2.snap.guideCount === 0)
    ok('snap guides cleared (guideCount=0)');
  else bad('stale snap guides remain: '+s2.snap.guideCount+' guide(s) not cleared');

  // ── STATE DIFF REPORT ─────────────────────────────────────────────
  console.log('\n── State Diff Report ──');
  const diff = {};
  const flatten = (obj, prefix='') => {
    Object.entries(obj).forEach(([k,v]) => {
      const key = prefix ? prefix+'.'+k : k;
      if(typeof v === 'object' && v !== null && !Array.isArray(v)) flatten(v, key);
      else diff[key] = v;
    });
  };
  const f1={}, f2={};
  flatten(s1, ''); Object.assign(f1, diff);
  Object.keys(diff).forEach(k=>delete diff[k]);
  flatten(s2, ''); Object.assign(f2, diff);
  
  const changed = Object.keys(f1).filter(k => f1[k] !== f2[k] && JSON.stringify(f1[k]) !== JSON.stringify(f2[k]));
  if(changed.length === 0) {
    ok('state fully restored to baseline (no unexpected mutations)');
  } else {
    // Some changes are expected (scrollY, selection.ids etc)
    const unexpected = changed.filter(k => !k.includes('scroll') && !k.includes('ids') && !k.includes('timestamp') && k !== 'zoom.design2');
    if(unexpected.length === 0) ok('only expected state differences (scroll/selection transient state)');
    else {
      unexpected.forEach(k => console.log('    CHANGED: '+k+': '+f1[k]+' → '+f2[k]));
      bad(unexpected.length+' unexpected state mutations detected');
    }
  }

  // ── FINAL ─────────────────────────────────────────────────────────
  console.log('\n════════════════════════');
  console.log('UI State results: '+pass+' PASS, '+fail+' FAIL');

  await browser.close();
  if(fail > 0) process.exit(1);
})().catch(e => { console.log('FAIL: '+e.message.slice(0,120)); process.exit(1); });
EOF

kill $PID 2>/dev/null
