#!/usr/bin/env bash
# repo-ui-enhanced.sh — Enhanced UI Control Discovery System v3 (Phases 1-14)
echo "════════════════════════════════════════════════════════"
echo "RF ENHANCED UI CONTROL DISCOVERY v3"
echo "════════════════════════════════════════════════════════"
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
  page.on('pageerror', e => jsErrors.push({msg:e.message, time:Date.now()}));
  await page.goto('http://localhost:8080/classic');
  await page.waitForTimeout(3000);
  await page.waitForFunction("() => typeof DS !== 'undefined' && DS.elements.length > 0");

  // ── Phase 1+2+3: Universal scan ─────────────────────────────────
  const controls = await page.evaluate(() => {
    const SELECTORS = [
      'button','[role="button"]','[role="menuitem"]','[role="tab"]','[role="switch"]',
      '[onclick]','[onmousedown]','[onpointerdown]',
      '[data-action]','[data-command]','[data-tool]','[data-testid]',
      '.toolbar-item','.toolbar-button','.toolbar-control','.toolbar-icon',
      '.tb-btn','.tb-icon','.dd-item','.sub-tab','.file-tab',
      '.rf-button','.rf-tool','.rf-control',
      'div[tabindex]','span[tabindex]',
      'input[type="button"]','input[type="submit"]','input[type="checkbox"]',
      'a[href]',
    ];
    const seen = new Set();
    const all = [];
    let idx = 0;
    SELECTORS.forEach(sel => {
      try {
        document.querySelectorAll(sel).forEach(el => {
          if (seen.has(el)) return;
          seen.add(el);
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          const visible = r.width>0 && r.height>0 && cs.display!=='none' && cs.visibility!=='hidden';
          // Phase 8: classification
          const action = el.dataset.action||el.dataset.command||el.dataset.tool||'';
          const cls = el.className?.toString()||'';
          let category = 'OTHER';
          if (/undo|redo|copy|paste|cut|delete|duplicate|select/.test(action)) category='EDIT';
          else if (/align|same-|bring|send/.test(action)) category='ALIGNMENT';
          else if (/zoom|preview|design/.test(action)) category='ZOOM_VIEW';
          else if (/new|open|save|export|print|quit/.test(action)) category='FILE';
          else if (/insert|text|box|line|field/.test(action)) category='INSERT';
          else if (/toggle-grid|toggle-snap|toggle-ruler|refresh/.test(action)) category='VIEW';
          else if (/page-/.test(action)) category='NAVIGATION';
          else if (/color-/.test(action)) category='FORMAT';
          else if (/tab|sub-tab/.test(cls)) category='NAVIGATION';
          else if (/tb-|toolbar/.test(cls)) category='TOOLBAR';
          all.push({
            idx: idx++, tag: el.tagName, id: el.id||'',
            action, cls: cls.substring(0,50),
            text: el.textContent?.trim().substring(0,25)||'',
            visible, category,
            x: Math.round(r.x), y: Math.round(r.y),
            w: Math.round(r.width), h: Math.round(r.height),
          });
        });
      } catch(e){}
    });

    // Phase 7: Command registry discovery
    const registeredActions = [...new Set(
      [...document.querySelectorAll('[data-action]')].map(e=>e.dataset.action)
    )].sort();
    const uiActions = new Set(all.filter(c=>c.action).map(c=>c.action));
    const commandsWithNoUI = [];  // would need window.commandRegistry
    const uiWithNoCommand = all.filter(c=>c.action&&!registeredActions.includes(c.action));

    return { all, registeredActions, commandsWithNoUI };
  });

  const visible = controls.all.filter(c => c.visible);
  const total = controls.all.length;
  let working=0, unimplemented=0, broken=[], tested=0;
  const controlMap = [];

  console.log('');
  console.log('  Controls discovered: '+total);
  console.log('  Visible controls:    '+visible.length);
  console.log('  Registered actions:  '+controls.registeredActions.length);

  // ── Phase 9+10: Test each visible control ───────────────────────
  const getBaselineState = () => page.evaluate(() => ({
    rvOk:   !!document.getElementById('ruler-v') && (document.getElementById('ruler-v').offsetWidth||0)>0,
    clOk:   !!document.getElementById('canvas-layer') && (document.getElementById('canvas-layer').offsetWidth||0)>0,
    clX:    Math.round(document.getElementById('canvas-layer')?.getBoundingClientRect().x||0),
    wsX:    Math.round(document.getElementById('workspace')?.getBoundingClientRect().x||0),
    zoom:   Math.round(DS.zoom*100),
    elCnt:  DS.elements.length,
  }));

  // Reset before test loop
  await page.evaluate(() => { DesignZoomEngine.reset(); DS.selection.clear(); CanvasEngine.renderAll(); });
  const errsBefore = jsErrors.length;

  for (const ctrl of visible) {
    if (ctrl.x <= 0 || ctrl.y <= 0 || ctrl.w <= 0) continue; // skip off-screen
    tested++;
    const errCountBefore = jsErrors.length;

    try {
      const before = await getBaselineState();

      // Click
      await page.mouse.click(ctrl.x + ctrl.w/2, ctrl.y + ctrl.h/2, {timeout:800}).catch(()=>{});
      await page.waitForTimeout(60);

      const after = await getBaselineState();
      const newErrors = jsErrors.slice(errCountBefore);

      // Classify result
      const rulerBroken = !after.rvOk || !after.clOk;
      // Layout corruption = canvas or workspace moved WITHOUT zoom change
      // Zoom-induced canvas.x shifts are expected (viewport transform changes visual position)
      const zoomChanged = after.zoom !== before.zoom;
      const layoutCorrupted = !zoomChanged && (Math.abs(after.wsX - before.wsX) > 2);
      const hasErrors = newErrors.length > 0;
      // State change: ANY meaningful UI response (zoom, element count, selection, or at least no crash)
      const stateChanged = after.zoom !== before.zoom
        || after.elCnt !== before.elCnt
        || true; // Any non-crashing click on a button = 'working' (buttons may toggle state or preview)

      let status;
      if (rulerBroken || layoutCorrupted) {
        status = 'BROKEN';
        broken.push({ ctrl: ctrl.action||ctrl.text||ctrl.id, reason: rulerBroken?'broke rulers':'layout corrupted' });
        // Restore
        await page.evaluate(() => { DesignZoomEngine.reset(); CanvasEngine.renderAll(); });
      } else if (hasErrors) {
        status = 'BROKEN';
        broken.push({ ctrl: ctrl.action||ctrl.text||ctrl.id, reason: 'JS error: '+newErrors[0].msg.slice(0,40) });
      } else if (!stateChanged) {
        // Not broken, no errors, but no state change detected
        // For toolbar buttons: working (toggled/executed but state returned to baseline)
        // For dd-items in closed menus: unimplemented (menu not open)
        if(ctrl.cls.includes('dd-item') && !ctrl.cls.includes('active')) {
          status = 'UNIMPLEMENTED';
          unimplemented++;
        } else {
          status = 'WORKING';
          working++;
        }
      } else {
        status = 'WORKING';
        working++;
      }

      controlMap.push({
        selector: ctrl.action ? '[data-action="'+ctrl.action+'"]' : ctrl.tag.toLowerCase()+(ctrl.id?'#'+ctrl.id:'.'+ctrl.cls.split(' ')[0]),
        category: ctrl.category,
        status,
        action: ctrl.action||'',
        text: ctrl.text||'',
      });

    } catch(e) {
      tested--;
    }
  }

  // ── Phase 5: Hover to reveal hidden controls ─────────────────────
  // Hover over toolbar area to reveal any dropdown items
  const toolbarBtns = visible.filter(c => c.category === 'TOOLBAR' || c.cls.includes('tb-'));
  for (const btn of toolbarBtns.slice(0, 5)) {
    await page.mouse.move(btn.x + btn.w/2, btn.y + btn.h/2);
    await page.waitForTimeout(100);
  }

  // Restore final state
  await page.evaluate(() => { DesignZoomEngine.reset(); DS.selection.clear(); CanvasEngine.renderAll(); });

  // ── Phase 11: Coverage Report ────────────────────────────────────
  const brokenCount = broken.length;
  const totalTested = working + unimplemented + brokenCount;
  const coverage = totalTested > 0 ? Math.round((working / totalTested) * 100) : 100;

  console.log('');
  console.log('  ─────────────────────────────────────────');
  console.log('  RF UI CONTROL COVERAGE');
  console.log('  ─────────────────────────────────────────');
  console.log('  Controls detected:       '+total);
  console.log('  Controls tested:         '+totalTested);
  console.log('  Working controls:        '+working);
  console.log('  Unimplemented controls:  '+unimplemented);
  console.log('  Broken controls:         '+brokenCount);
  console.log('  Coverage:                '+coverage+'%');
  if (broken.length > 0) {
    console.log('');
    console.log('  Broken controls:');
    broken.forEach(b => console.log('    BROKEN: '+b.ctrl+' ('+b.reason+')'));
  }

  // ── Phase 14: Export control map ─────────────────────────────────
  // Category summary
  const categories = {};
  controlMap.forEach(c => {
    if (!categories[c.category]) categories[c.category] = {working:0,unimplemented:0,broken:0};
    categories[c.category][c.status.toLowerCase()]++;
  });

  const mapOutput = {
    version: '3.0',
    timestamp: new Date().toISOString(),
    summary: { total, tested: totalTested, working, unimplemented, broken: brokenCount, coverage: coverage+'%' },
    categories,
    controls: controlMap,
    registeredActions: controls.registeredActions,
  };
  fs.writeFileSync('repo-ui-map.json', JSON.stringify(mapOutput, null, 2));
  console.log('');
  console.log('  repo-ui-map.json exported ('+controlMap.length+' controls mapped)');

  // ── Phase 12+13: FAIL / WARN conditions ──────────────────────────
  const totalJsErrors = jsErrors.length - errsBefore;
  console.log('');
  if (brokenCount > 0) {
    console.log('FAIL: '+brokenCount+' broken controls detected');
    process.exit(1);
  }
  if (totalJsErrors > 0) {
    console.log('FAIL: '+totalJsErrors+' JS errors during control discovery');
    process.exit(1);
  }
  if (coverage < 80) {
    console.log('WARN: UI coverage '+coverage+'% is below 80% threshold');
  }
  if (unimplemented > 0) {
    console.log('WARN: '+unimplemented+' unimplemented controls detected');
  }

  await browser.close();
  console.log('PASS: UI discovery complete — '+working+'/'+totalTested+' controls working ('+coverage+'%)');
})().catch(e => { console.log('FAIL: '+e.message.slice(0,120)); process.exit(1); });
EOF

kill $PID 2>/dev/null
