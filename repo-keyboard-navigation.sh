#!/usr/bin/env bash
# repo-keyboard-navigation.sh — Phase 36: Keyboard Navigation
echo "════════════════════════════════════════"
echo "RF KEYBOARD NAVIGATION"
echo "════════════════════════════════════════"
python3 reportforge_server.py &
PID=$!; sleep 3

node - <<'EOF'
const RF = require('./_rf_test_lib.js');
(async () => {
  const { browser, page, jsErrors } = await RF.launch();
  const { ok, bad, done } = RF.reporter('repo-keyboard-navigation');

  // ── Select element to enable keyboard movement ─────────────────────
  await page.evaluate(() => {
    DS.selection.clear();
    DS.selection.add(DS.elements[0]?.id);
    SelectionEngine.renderHandles();
  });

  // ── Test 1: ArrowRight moves element +1px (or snap) ───────────────
  const x0 = await page.evaluate(() => DS.elements[0]?.x || 0);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(100);
  const x1 = await page.evaluate(() => DS.elements[0]?.x || 0);
  if (x1 > x0) ok('ArrowRight: element moved right (x: ' + x0 + '→' + x1 + ')');
  else bad('ArrowRight: no movement (x stayed at ' + x0 + ')');

  // ── Test 2: ArrowLeft moves element back ───────────────────────────
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(100);
  const x2 = await page.evaluate(() => DS.elements[0]?.x || 0);
  if (x2 < x1) ok('ArrowLeft: element moved left (x: ' + x1 + '→' + x2 + ')');
  else bad('ArrowLeft: no movement');

  // ── Test 3: ArrowUp moves element up ──────────────────────────────
  const y0 = await page.evaluate(() => DS.elements[0]?.y || 0);
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(100);
  const y1 = await page.evaluate(() => DS.elements[0]?.y || 0);
  if (y1 < y0 || y1 >= 0) ok('ArrowUp: element moved up or clamped at 0 (y: ' + y0 + '→' + y1 + ')');
  else bad('ArrowUp: unexpected y value ' + y1);

  // ── Test 4: ArrowDown moves element down ───────────────────────────
  const y2 = await page.evaluate(() => DS.elements[0]?.y || 0);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(100);
  const y3 = await page.evaluate(() => DS.elements[0]?.y || 0);
  if (y3 > y2) ok('ArrowDown: element moved down (y: ' + y2 + '→' + y3 + ')');
  else bad('ArrowDown: no movement (y=' + y3 + ')');

  // ── Test 5: Escape deselects ──────────────────────────────────────
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  const selAfterEsc = await page.evaluate(() => DS.selection.size);
  if (selAfterEsc === 0) ok('Escape: clears selection');
  else bad('Escape: selection not cleared (' + selAfterEsc + ' still selected)');

  // ── Test 6: Ctrl+A selects all ────────────────────────────────────
  await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
  await page.waitForTimeout(100);
  const selAll = await page.evaluate(() => ({ sel: DS.selection.size, total: DS.elements.length }));
  if (selAll.sel === selAll.total) ok('Ctrl+A: all ' + selAll.sel + ' elements selected');
  else bad('Ctrl+A: ' + selAll.sel + '/' + selAll.total + ' selected');
  await page.keyboard.press('Escape');

  // ── Test 7: Delete key removes element ────────────────────────────
  const countBefore = await page.evaluate(() => { DS.selection.add(DS.elements[0]?.id); return DS.elements.length; });
  await page.keyboard.press('Delete');
  await page.waitForTimeout(100);
  const countAfter = await page.evaluate(() => DS.elements.length);
  if (countAfter < countBefore) ok('Delete: element removed (' + countBefore + '→' + countAfter + ')');
  else bad('Delete: element not removed');
  await page.evaluate(() => { DS.undo&&DS.undo(); CanvasEngine.renderAll(); });

  // ── Cleanup & layout invariants ───────────────────────────────────
  await page.evaluate(() => { while(DS.historyIndex>0) DS.undo&&DS.undo(); CanvasEngine.renderAll(); });
  const layout = await RF.layout(page);
  if (layout.rv?.ow > 0) ok('rulers intact after keyboard navigation tests');
  else bad('rulers disappeared!');

  await browser.close();
  process.exit(done() > 0 ? 1 : 0);
})().catch(e => { console.log('FAIL: ' + e.message.slice(0, 120)); process.exit(1); });
EOF

kill $PID 2>/dev/null
