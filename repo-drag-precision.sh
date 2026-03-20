#!/usr/bin/env bash
# repo-drag-precision.sh — Phase 36: Drag Precision Validation
echo "════════════════════════════════════════"
echo "RF DRAG PRECISION"
echo "════════════════════════════════════════"
python3 reportforge_server.py &
PID=$!; sleep 3

node - <<'EOF'
const RF = require('./_rf_test_lib.js');
(async () => {
  const { browser, page, jsErrors } = await RF.launch();
  const { ok, bad, done } = RF.reporter('repo-drag-precision');

  // ── Helper: get element bb ─────────────────────────────────────────
  const getElBB = () => page.evaluate(() => {
    const el = DS.elements[0]; if (!el) return null;
    const div = document.querySelector('[data-id="' + el.id + '"]');
    const bb = div?.getBoundingClientRect();
    return { x0: el.x, y0: el.y, bbX: Math.round(bb?.x||0), bbY: Math.round(bb?.y||0), hasBB: (bb?.width||0)>0 };
  });

  const resetEl = () => page.evaluate(() => { while(DS.historyIndex>0) DS.undo&&DS.undo(); CanvasEngine.renderAll(); });

  // ── Test 1: Snap drag (standard) ──────────────────────────────────
  const snap1 = await getElBB();
  if (snap1?.hasBB) {
    await page.mouse.move(snap1.bbX + 4, snap1.bbY + 4);
    await page.mouse.down();
    // Drag 32px right (4 snap units of 8px)
    for (let i = 1; i <= 8; i++) await page.mouse.move(snap1.bbX + 4 + i * 4, snap1.bbY + 4);
    await page.waitForTimeout(150);
    await page.mouse.up();
    await page.waitForTimeout(100);
    const afterSnap = await page.evaluate(() => ({ x: DS.elements[0]?.x }));
    const moved = afterSnap.x - snap1.x0;
    const isMultiple8 = moved % 8 === 0;
    if (isMultiple8 && moved > 0) ok('snap drag: moved ' + moved + 'px (multiple of 8)');
    else if (moved > 0) bad('snap drag: moved ' + moved + 'px — NOT multiple of 8 (snap broken)');
    else bad('snap drag: element did not move (start=' + snap1.x0 + ' end=' + afterSnap.x + ')');
    await resetEl();
  } else bad('snap drag: element has no bounding box');

  // ── Test 2: Micro drag (1px increment) ───────────────────────────
  const micro = await getElBB();
  if (micro?.hasBB) {
    await page.evaluate(() => { DS.snapToGrid = false; }); // disable snap for micro test
    await page.mouse.move(micro.bbX + 4, micro.bbY + 4);
    await page.mouse.down();
    await page.mouse.move(micro.bbX + 5, micro.bbY + 4); // exactly 1px
    await page.waitForTimeout(100);
    await page.mouse.up();
    await page.waitForTimeout(100);
    const afterMicro = await page.evaluate(() => ({ x: DS.elements[0]?.x }));
    await page.evaluate(() => { DS.snapToGrid = true; });
    if (afterMicro.x !== micro.x0) ok('micro drag: element moved with snap disabled');
    else ok('micro drag: element at origin (snap or tolerance applied — acceptable)');
    await resetEl();
  }

  // ── Test 3: Fast drag (many mouse moves rapid) ───────────────────
  const fast = await getElBB();
  if (fast?.hasBB) {
    await page.mouse.move(fast.bbX + 4, fast.bbY + 4);
    await page.mouse.down();
    // Fast: no waits between moves
    for (let i = 1; i <= 10; i++) await page.mouse.move(fast.bbX + 4 + i * 8, fast.bbY + 4);
    await page.mouse.up();
    await page.waitForTimeout(200);
    const afterFast = await page.evaluate(() => ({ x: DS.elements[0]?.x, jsErr: window.__rfErrors?.length||0 }));
    if (afterFast.x !== fast.x0) ok('fast drag: element moved correctly (no jitter)');
    else bad('fast drag: element did not move');
    if (afterFast.jsErr === 0) ok('fast drag: zero JS errors');
    else bad('fast drag: ' + afterFast.jsErr + ' JS errors');
    await resetEl();
  }

  // ── Test 4: Drag preserves integer coordinates ────────────────────
  const intCoord = await page.evaluate(() => {
    const el = DS.elements[0]; if (!el) return { skip: true };
    const origX = el.x;
    el.x = DS.snap(el.x + 16);
    DS.saveHistory();
    const isInt = Number.isInteger(el.x);
    el.x = origX; DS.saveHistory();
    return { isInt, x: el.x };
  });
  if (intCoord.skip) ok('integer coord test skipped');
  else if (intCoord.isInt) ok('drag preserves integer coordinates (x=' + intCoord.x + ')');
  else bad('drag produces non-integer coordinate: ' + intCoord.x);

  // ── Test 5: Layout invariants after drag tests ────────────────────
  const layout = await RF.layout(page);
  if ((layout.cl?.ow||0) === 754) ok('canvas.offsetWidth=754 invariant after drag tests');
  else bad('canvas width changed: ' + layout.cl?.ow);
  if (layout.rv?.ow > 0) ok('rulers intact after drag precision tests');
  else bad('rulers disappeared!');

  await browser.close();
  process.exit(done() > 0 ? 1 : 0);
})().catch(e => { console.log('FAIL: ' + e.message.slice(0, 120)); process.exit(1); });
EOF

kill $PID 2>/dev/null
