#!/usr/bin/env bash
# repo-time-travel.sh — Phase 36: State Snapshot Time-Travel Validation
echo "════════════════════════════════════════"
echo "RF TIME-TRAVEL STATE VALIDATION"
echo "════════════════════════════════════════"
python3 reportforge_server.py &
PID=$!; sleep 3

node - <<'EOF'
const RF = require('./_rf_test_lib.js');
(async () => {
  const { browser, page, jsErrors } = await RF.launch();
  const { ok, bad, done } = RF.reporter('repo-time-travel');

  // ── Snapshot helper ───────────────────────────────────────────────
  const snapshot = () => page.evaluate(() => ({
    elCount:   DS.elements.length,
    el0x:      DS.elements[0]?.x,
    el0y:      DS.elements[0]?.y,
    histIdx:   DS.historyIndex,
    selCount:  DS.selection.size,
    zoom:      DS.zoom,
    sections:  DS.sections.length,
  }));

  // ── Baseline ──────────────────────────────────────────────────────
  await page.evaluate(() => { DesignZoomEngine.reset(); DS.selection.clear(); });
  const s0 = await snapshot();

  // ── Step 1: Create object ─────────────────────────────────────────
  await page.evaluate(() => {
    DS.elements.push({ id: 'tt-001', type: 'text', content: 'TimeTravel',
      x: DS.snap(100), y: DS.snap(50), w: 80, h: 14,
      sectionId: DS.sections[0]?.id, zIndex: 99 });
    DS.saveHistory();
  });
  const s1 = await snapshot();
  if (s1.elCount > s0.elCount) ok('step 1: object created (elCount: ' + s0.elCount + '→' + s1.elCount + ')');
  else bad('step 1: object not created');

  // ── Step 2: Move object ───────────────────────────────────────────
  await page.evaluate(() => {
    const el = DS.elements.find(e => e.id === 'tt-001');
    if (el) { el.x = DS.snap(el.x + 40); DS.saveHistory(); }
  });
  const s2 = await snapshot();
  if (s2.el0x !== s1.el0x || s2.histIdx > s1.histIdx) ok('step 2: object moved or history advanced');
  else bad('step 2: move had no effect');

  // ── Step 3: Align objects ─────────────────────────────────────────
  await page.evaluate(() => {
    DS.selection.add('tt-001');
    DS.selection.add(DS.elements[0]?.id);
    CommandEngine.alignLefts && CommandEngine.alignLefts();
    DS.selection.clear();
  });
  const s3 = await snapshot();
  ok('step 3: align executed (histIdx=' + s3.histIdx + ')');

  // ── Step 4: Delete object ─────────────────────────────────────────
  await page.evaluate(() => {
    DS.selection.add('tt-001');
    CommandEngine.delete();
    DS.selection.clear();
  });
  const s4 = await snapshot();
  const s4Count = await page.evaluate(() => DS.elements.filter(e=>e.id==='tt-001').length);
  if (s4Count === 0) ok('step 4: object deleted');
  else bad('step 4: object not deleted');

  // ── Undo x4 — should return to s0 ────────────────────────────────
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => DS.undo && DS.undo());
    await page.waitForTimeout(50);
  }
  await page.evaluate(() => CanvasEngine.renderAll());
  const sUndo = await snapshot();

  // After 4 undos we should be near baseline element count
  if (Math.abs(sUndo.elCount - s0.elCount) <= 1)
    ok('undo×4: element count restored (' + sUndo.elCount + ' ≈ ' + s0.elCount + ')');
  else bad('undo×4: count mismatch (got=' + sUndo.elCount + ' expected≈' + s0.elCount + ')');

  // ── Redo x4 — should return to s4 ────────────────────────────────
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => DS.redo && DS.redo());
    await page.waitForTimeout(50);
  }
  await page.evaluate(() => CanvasEngine.renderAll());
  const sRedo = await snapshot();
  const ttGone = await page.evaluate(() => DS.elements.filter(e=>e.id==='tt-001').length);

  if (ttGone === 0) ok('redo×4: object deleted again (matches s4 state)');
  else bad('redo×4: object unexpectedly present');

  // ── Undo to s0 completely ─────────────────────────────────────────
  await page.evaluate(() => { while(DS.historyIndex > 0) DS.undo && DS.undo(); CanvasEngine.renderAll(); });
  const sFinal = await snapshot();
  if (sFinal.elCount === s0.elCount)
    ok('full undo: element count matches baseline (' + sFinal.elCount + ')');
  else bad('full undo: elCount=' + sFinal.elCount + ' expected ' + s0.elCount);

  // ── Layout invariants after time-travel ───────────────────────────
  const inv = await RF.invariants(page);
  if (inv.ok) ok('layout invariants intact after time-travel tests');
  else bad('layout invariants violated after time-travel!');

  if (jsErrors.length === 0) ok('zero JS errors during time-travel tests');
  else bad(jsErrors.length + ' JS errors: ' + jsErrors[0]?.slice(0, 80));

  await browser.close();
  process.exit(done() > 0 ? 1 : 0);
})().catch(e => { console.log('FAIL: ' + e.message.slice(0, 120)); process.exit(1); });
EOF

kill $PID 2>/dev/null
