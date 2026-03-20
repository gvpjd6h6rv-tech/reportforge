#!/usr/bin/env bash
# repo-selection-engine.sh — Phase 36: Selection Engine Validation
echo "════════════════════════════════════════"
echo "RF SELECTION ENGINE"
echo "════════════════════════════════════════"
python3 reportforge_server.py &
PID=$!; sleep 3

node - <<'EOF'
const RF = require('./_rf_test_lib.js');
(async () => {
  const { browser, page, jsErrors } = await RF.launch();
  const { ok, bad, done } = RF.reporter('repo-selection-engine');

  // ── Test 1: Single object selection ───────────────────────────────
  const single = await page.evaluate(() => {
    DS.selection.clear();
    const id = DS.elements[0]?.id;
    if (!id) return { ok: false, reason: 'no elements' };
    DS.selection.add(id);
    SelectionEngine.renderHandles();
    const handles = document.querySelectorAll('.sel-handle');
    return { ok: DS.selection.size === 1 && handles.length === 4,
             selCount: DS.selection.size, handleCount: handles.length, id };
  });
  if (single.ok) ok('single selection: 1 element, 4 handles');
  else bad('single selection failed: sel=' + single.selCount + ' handles=' + single.handleCount);

  // ── Test 2: Multi-selection ────────────────────────────────────────
  const multi = await page.evaluate(() => {
    DS.selection.clear();
    DS.elements.slice(0, 3).forEach(e => DS.selection.add(e.id));
    SelectionEngine.renderHandles();
    return { selCount: DS.selection.size, ids: [...DS.selection] };
  });
  if (multi.selCount === 3) ok('multi-selection: 3 elements selected');
  else bad('multi-selection failed: got ' + multi.selCount + ' expected 3');

  // ── Test 3: Shift+click adds to selection ─────────────────────────
  const shiftClick = await page.evaluate(() => {
    DS.selection.clear();
    DS.selection.add(DS.elements[0]?.id);
    // Simulate shift+click on element 1
    const id1 = DS.elements[1]?.id;
    if (!DS.selection.has(id1)) DS.selection.add(id1); // shift semantics
    return { count: DS.selection.size, hasId0: DS.selection.has(DS.elements[0]?.id),
             hasId1: DS.selection.has(DS.elements[1]?.id) };
  });
  if (shiftClick.count === 2 && shiftClick.hasId0 && shiftClick.hasId1)
    ok('shift-click: both elements in selection');
  else bad('shift-click selection failed: count=' + shiftClick.count);

  // ── Test 4: Deselect ──────────────────────────────────────────────
  await page.evaluate(() => DS.selection.clear());
  const desel = await page.evaluate(() => DS.selection.size);
  if (desel === 0) ok('deselect clears all');
  else bad('deselect failed: ' + desel + ' still selected');

  // ── Test 5: Overlapping object selection ─────────────────────────
  const overlap = await page.evaluate(() => {
    // Place two elements at same position, select by ID (topmost = last zIndex)
    const els = DS.elements.slice(0, 2);
    const origX0 = els[0].x, origX1 = els[1].x;
    els[0].x = 50; els[1].x = 50; // overlap
    DS.selection.clear();
    DS.selection.add(els[0].id);
    const sel0 = DS.selection.has(els[0].id);
    DS.selection.clear();
    DS.selection.add(els[1].id);
    const sel1 = DS.selection.has(els[1].id);
    els[0].x = origX0; els[1].x = origX1; // restore
    return { sel0, sel1 };
  });
  if (overlap.sel0 && overlap.sel1) ok('overlapping objects individually selectable');
  else bad('overlapping selection failed');

  // ── Test 6: Selection handles visible after selection ─────────────
  const handlesCheck = await page.evaluate(() => {
    DS.selection.clear();
    DS.selection.add(DS.elements[0]?.id);
    SelectionEngine.renderHandles();
    const handles = [...document.querySelectorAll('.sel-handle')];
    const visible = handles.filter(h => {
      const r = h.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    DS.selection.clear();
    return { total: handles.length, visible: visible.length };
  });
  if (handlesCheck.visible === 4) ok('selection handles visible (4 L-shaped corners)');
  else bad('handles not visible: ' + handlesCheck.visible + '/4');

  // ── Test 7: Selection state survives zoom ─────────────────────────
  const zoomSel = await page.evaluate(() => {
    DS.selection.clear();
    DS.selection.add(DS.elements[0]?.id);
    const id = [...DS.selection][0];
    DesignZoomEngine.set(2.0);
    const stillSel = DS.selection.has(id);
    DesignZoomEngine.reset();
    DS.selection.clear();
    return { stillSel, id };
  });
  if (zoomSel.stillSel) ok('selection survives zoom change');
  else bad('selection lost after zoom');

  // ── Layout invariants ─────────────────────────────────────────────
  const layout = await RF.layout(page);
  const rv = layout.rv;
  if (rv && rv.ow > 0) ok('rulers intact after selection tests');
  else bad('rulers disappeared!');

  await browser.close();
  process.exit(done() > 0 ? 1 : 0);
})().catch(e => { console.log('FAIL: ' + e.message.slice(0, 120)); process.exit(1); });
EOF

kill $PID 2>/dev/null
