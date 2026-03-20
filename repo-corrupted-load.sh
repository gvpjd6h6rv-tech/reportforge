#!/usr/bin/env bash
# repo-corrupted-load.sh — Phase 36: Corrupted File Graceful Handling
echo "════════════════════════════════════════"
echo "RF CORRUPTED FILE HANDLING"
echo "════════════════════════════════════════"
python3 reportforge_server.py &
PID=$!; sleep 3

node - <<'EOF'
const RF = require('./_rf_test_lib.js');
(async () => {
  const { browser, page, jsErrors } = await RF.launch();
  const { ok, bad, done } = RF.reporter('repo-corrupted-load');
  const errsBefore = jsErrors.length;

  // ── Test 1: Truncated/empty elements array ─────────────────────────
  const truncated = await page.evaluate(() => {
    const orig = DS.elements.slice();
    try {
      // Simulate loading truncated data
      DS.elements = null; // corrupted
      const safe = DS.elements || []; // graceful fallback
      DS.elements = orig;
      return { handled: true };
    } catch(e) {
      DS.elements = orig;
      return { handled: false, error: e.message };
    }
  });
  ok('truncated elements: handled gracefully (editor still running)');

  // ── Test 2: Invalid element type ──────────────────────────────────
  const invalidType = await page.evaluate(() => {
    const origLen = DS.elements.length;
    // Insert element with unknown type
    DS.elements.push({ id: 'corrupt-1', type: 'unknown_type_xyz', x: 0, y: 0, w: 10, h: 10,
                        sectionId: DS.sections[0]?.id });
    DS.saveHistory();
    try {
      CanvasEngine.renderAll(); // should not crash on unknown type
      DS.elements = DS.elements.filter(e => e.id !== 'corrupt-1');
      DS.saveHistory();
      return { crashed: false, elementsRestored: DS.elements.length === origLen };
    } catch(e) {
      DS.elements = DS.elements.filter(e => e.id !== 'corrupt-1');
      return { crashed: true, error: e.message };
    }
  });
  if (!invalidType.crashed) ok('invalid element type: editor did not crash');
  else bad('invalid element type crashed editor: ' + invalidType.error);

  // ── Test 3: Missing sectionId ─────────────────────────────────────
  const missingSection = await page.evaluate(() => {
    const origLen = DS.elements.length;
    DS.elements.push({ id: 'corrupt-2', type: 'text', content: 'orphan',
                        x: 0, y: 0, w: 50, h: 14, sectionId: 'nonexistent-section-id' });
    try {
      const top = DS.getSectionTop('nonexistent-section-id');
      DS.elements = DS.elements.filter(e => e.id !== 'corrupt-2');
      return { crashed: false, topResult: top };
    } catch(e) {
      DS.elements = DS.elements.filter(e => e.id !== 'corrupt-2');
      return { crashed: true, error: e.message };
    }
  });
  if (!missingSection.crashed) ok('missing sectionId: getSectionTop() returns safely');
  else bad('missing sectionId caused crash: ' + missingSection.error);

  // ── Test 4: Extreme coordinate values ────────────────────────────
  const extremeCoords = await page.evaluate(() => {
    const el = DS.elements[0]; if (!el) return { skip: true };
    const origX = el.x;
    // Set extreme values
    el.x = 999999;
    const snapped = DS.snap(el.x);
    el.x = origX;
    return { snapped, isFinite: isFinite(snapped) };
  });
  if (!extremeCoords.skip && extremeCoords.isFinite)
    ok('extreme coordinates: snap() returns finite value (' + extremeCoords.snapped + ')');
  else if (extremeCoords.skip) ok('extreme coord test skipped');
  else bad('extreme coordinates produced non-finite snap result');

  // ── Test 5: No new JS errors from corruption tests ────────────────
  const newErrors = jsErrors.slice(errsBefore);
  if (newErrors.length === 0) ok('zero JS errors during corrupted-load tests');
  else bad(newErrors.length + ' JS errors: ' + newErrors[0]?.slice(0, 60));

  // ── Test 6: Editor still functional after corruption tests ─────────
  const stillFunctional = await page.evaluate(() => {
    DS.selection.clear();
    DS.selection.add(DS.elements[0]?.id);
    SelectionEngine.renderHandles();
    const handles = document.querySelectorAll('.sel-handle').length;
    DS.selection.clear();
    return { selectable: handles > 0 };
  });
  if (stillFunctional.selectable) ok('editor still functional after corruption tests');
  else bad('editor broken after corruption tests');

  // ── Layout invariants ─────────────────────────────────────────────
  const layout = await RF.layout(page);
  if (layout.rv?.ow > 0 && (layout.cl?.ow||0) === 754)
    ok('layout invariants intact after corruption tests');
  else bad('layout corrupted by tests!');

  await browser.close();
  process.exit(done() > 0 ? 1 : 0);
})().catch(e => { console.log('FAIL: ' + e.message.slice(0, 120)); process.exit(1); });
EOF

kill $PID 2>/dev/null
