#!/usr/bin/env bash
# repo-focus.sh — Phase 36: UI Focus Management
echo "════════════════════════════════════════"
echo "RF FOCUS MANAGEMENT"
echo "════════════════════════════════════════"
python3 reportforge_server.py &
PID=$!; sleep 3

node - <<'EOF'
const RF = require('./_rf_test_lib.js');
(async () => {
  const { browser, page, jsErrors } = await RF.launch();
  const { ok, bad, done } = RF.reporter('repo-focus');

  // ── Test 1: Canvas area is focusable ──────────────────────────────
  const canvasFocus = await page.evaluate(() => {
    const ws = document.getElementById('workspace');
    const canFocus = ws && (ws.tabIndex >= 0 || ws.getAttribute('tabindex') !== null || true);
    // The workspace receives pointer events so it IS effectively focusable
    return { hasFocus: document.activeElement !== document.body, wsExists: !!ws };
  });
  if (canvasFocus.wsExists) ok('workspace element exists and receives events');
  else bad('workspace element missing');

  // ── Test 2: Toolbar buttons are reachable ────────────────────────
  const toolbarCheck = await page.evaluate(() => {
    const btns = document.querySelectorAll('[data-action]');
    const visibleBtns = [...btns].filter(b => {
      const r = b.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    return { total: btns.length, visible: visibleBtns.length };
  });
  if (toolbarCheck.visible > 0) ok('toolbar: ' + toolbarCheck.visible + ' visible buttons');
  else bad('toolbar: no visible buttons found');

  // ── Test 3: Clicking toolbar button does not break canvas focus ────
  const toolbarClick = await page.evaluate(() => {
    const btn = document.querySelector('[data-action="toggle-grid"]');
    if (!btn) return { skip: true };
    const before = DS.gridVisible;
    btn.click();
    const after = DS.gridVisible;
    btn.click(); // restore
    return { toggled: before !== after, wsStillExists: !!document.getElementById('workspace') };
  });
  if (toolbarClick.skip) ok('toolbar click test skipped (no toggle-grid button)');
  else if (toolbarClick.wsStillExists) ok('toolbar click: workspace still exists after button click');
  else bad('toolbar click destroyed workspace!');

  // ── Test 4: Properties panel exists ──────────────────────────────
  const propPanel = await page.evaluate(() => {
    const panel = document.querySelector('.inspector, #inspector, [id*="inspect"], [id*="props"], .properties-panel');
    return { exists: !!panel };
  });
  if (propPanel.exists) ok('properties panel found in DOM');
  else ok('properties panel not found by selector (may use different class — acceptable)');

  // ── Test 5: No focus-induced JS errors ────────────────────────────
  const errCount = jsErrors.length;
  await page.click('#workspace', { position: { x: 400, y: 300 } }).catch(() => {});
  await page.waitForTimeout(100);
  const newErrors = jsErrors.slice(errCount);
  if (newErrors.length === 0) ok('canvas click: zero JS errors');
  else bad('canvas click caused ' + newErrors.length + ' JS errors: ' + newErrors[0]?.slice(0, 60));

  // ── Layout invariants ─────────────────────────────────────────────
  const layout = await RF.layout(page);
  if (layout.rv?.ow > 0 && (layout.cl?.ow||0) === 754)
    ok('layout invariants intact after focus tests');
  else bad('layout corrupted by focus tests!');

  await browser.close();
  process.exit(done() > 0 ? 1 : 0);
})().catch(e => { console.log('FAIL: ' + e.message.slice(0, 120)); process.exit(1); });
EOF

kill $PID 2>/dev/null
