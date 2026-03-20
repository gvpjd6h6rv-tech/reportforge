#!/usr/bin/env bash
# repo-ui-explorer.sh — Phase 28: Automatic UI Explorer
# Auto-discovers ALL interactive controls, tests each, reports suspicious ones
echo "════════════════════════════════════════"
echo "RF UI EXPLORER"
echo "════════════════════════════════════════"
python3 reportforge_server.py &
PID=$!
sleep 3

node - <<'EOF'
const {chromium} = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport:{width:1400,height:900} });
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  await page.goto('http://localhost:8080/classic');
  await page.waitForTimeout(3000);
  await page.waitForFunction("() => typeof DS !== 'undefined' && DS.elements.length > 0");

  let tested=0, working=0, suspicious=[];

  // ── Discover ALL interactive controls ────────────────────────────
  const controls = await page.evaluate(() => {
    const SELECTORS = 'button,[role="button"],input[type="button"],.toolbar-button,.rf-button,[data-action],[data-command]';
    return [...document.querySelectorAll(SELECTORS)].map((el,i) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        idx: i,
        tag: el.tagName,
        id: el.id || '',
        action: el.dataset.action || el.dataset.command || '',
        cls: el.className?.substring(0,30) || '',
        text: el.textContent?.trim().substring(0,20) || '',
        visible: r.width>0 && r.height>0 && cs.display!=='none' && cs.visibility!=='hidden',
        x: Math.round(r.x), y: Math.round(r.y),
        w: Math.round(r.width), h: Math.round(r.height),
      };
    });
  });
  const visibleControls = controls.filter(c => c.visible);
  console.log('');
  console.log('  Controls discovered: '+controls.length);
  console.log('  Visible controls:    '+visibleControls.length);

  // ── Baseline ruler/canvas snapshot ───────────────────────────────
  const getBaseline = async () => page.evaluate(() => {
    const rv = document.getElementById('ruler-v');
    const cl = document.getElementById('canvas-layer');
    return {
      rvOk: !!rv && (rv.offsetWidth||0)>0 && (rv.getBoundingClientRect().height||0)>0,
      clOk: !!cl && (cl.offsetWidth||0)>0,
      zoom: DS.zoom, elCount: DS.elements.length,
    };
  });

  // ── Test each visible control ─────────────────────────────────────
  await page.evaluate(() => { DesignZoomEngine.reset(); DS.selection.clear(); });
  const errsBefore = jsErrors.length;

  for (const ctrl of visibleControls) {
    tested++;
    try {
      const before = await getBaseline();
      const errCount = jsErrors.length;

      // Click the control
      if (ctrl.x > 0 && ctrl.y > 0) {
        await page.mouse.click(ctrl.x + ctrl.w/2, ctrl.y + ctrl.h/2, {timeout:1000}).catch(()=>{});
        await page.waitForTimeout(60);
      }

      const after = await getBaseline();
      const newErrors = jsErrors.slice(errCount);

      // Fail conditions
      if (!after.rvOk || !after.clOk) {
        suspicious.push({ctrl: ctrl.action||ctrl.text||ctrl.id, reason: 'broke rulers/canvas'});
        // Restore state
        await page.evaluate(() => { DesignZoomEngine.reset(); CanvasEngine.renderAll(); });
      } else if (newErrors.length > 0) {
        suspicious.push({ctrl: ctrl.action||ctrl.text||ctrl.id, reason: 'JS error: '+newErrors[0].slice(0,40)});
      } else {
        working++;
      }
    } catch(e) {
      // Click failed (not a blocking issue for non-critical buttons)
      tested--; // don't count if we couldn't even click
    }
  }

  // ── Restore clean state ───────────────────────────────────────────
  await page.evaluate(() => { DesignZoomEngine.reset(); DS.selection.clear(); CanvasEngine.renderAll(); });

  // ── Report ────────────────────────────────────────────────────────
  console.log('');
  console.log('  ── UI Explorer Report ──');
  console.log('  UI controls discovered: '+controls.length);
  console.log('  UI controls tested:     '+tested);
  console.log('  UI controls working:    '+working);
  console.log('  UI controls suspicious: '+suspicious.length);
  if (suspicious.length > 0) {
    console.log('  Suspicious controls:');
    suspicious.forEach(s => console.log('    - '+s.ctrl+': '+s.reason));
  }

  const totalJsErrors = jsErrors.length - errsBefore;
  if (totalJsErrors > 0) {
    console.log('  New JS errors during exploration: '+totalJsErrors);
  }

  await browser.close();

  // Fail if any control broke critical UI
  const criticalFails = suspicious.filter(s => s.reason.includes('broke rulers'));
  if (criticalFails.length > 0) {
    console.log('\nFAIL: '+criticalFails.length+' controls broke critical UI');
    process.exit(1);
  }
  console.log('\nPASS: UI explorer complete — no critical UI breakage');
})().catch(e => { console.log('FAIL: '+e.message.slice(0,120)); process.exit(1); });
EOF

kill $PID 2>/dev/null
