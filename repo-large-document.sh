#!/usr/bin/env bash
# repo-large-document.sh — Phase 36: Large Document Stress Test
echo "════════════════════════════════════════"
echo "RF LARGE DOCUMENT STRESS"
echo "════════════════════════════════════════"
python3 reportforge_server.py &
PID=$!; sleep 3

node - <<'EOF'
const RF = require('./_rf_test_lib.js');
(async () => {
  const { browser, page, jsErrors } = await RF.launch();
  const { ok, bad, done } = RF.reporter('repo-large-document');

  // ── Create 100 objects (reasonable stress without timeout) ─────────
  const created = await page.evaluate(() => {
    const origCount = DS.elements.length;
    const sectionId = DS.sections[2]?.id || DS.sections[0]?.id;
    for (let i = 0; i < 100; i++) {
      DS.elements.push({
        id: 'stress-' + i,
        type: 'text',
        content: 'Stress ' + i,
        x: DS.snap((i % 10) * 70 + 4),
        y: DS.snap(Math.floor(i / 10) * 18 + 4),
        w: 64, h: 14,
        sectionId,
        zIndex: i,
      });
    }
    DS.saveHistory();
    CanvasEngine.renderAll();
    return { added: DS.elements.length - origCount, total: DS.elements.length };
  });
  if (created.added === 100) ok('large document: 100 objects created (total=' + created.total + ')');
  else bad('large document: only ' + created.added + ' objects created');

  // ── Test zoom at large object count ───────────────────────────────
  const zoomLarge = await page.evaluate(() => {
    DesignZoomEngine.set(0.5);
    const z = DS.zoom;
    const clW = document.getElementById('canvas-layer')?.offsetWidth;
    DesignZoomEngine.reset();
    return { z, clW };
  });
  if (zoomLarge.clW === 754) ok('canvas width invariant at 0.5x with 100+ objects');
  else bad('canvas width changed to ' + zoomLarge.clW + ' at 0.5x');

  // ── Test select all on large document ─────────────────────────────
  const selAll = await page.evaluate(() => {
    DS.selection.clear();
    CommandEngine.selectAll();
    return { sel: DS.selection.size, total: DS.elements.length };
  });
  if (selAll.sel === selAll.total) ok('select all: ' + selAll.sel + '/' + selAll.total + ' selected');
  else bad('select all: ' + selAll.sel + ' selected of ' + selAll.total);

  // ── Test align on large selection ─────────────────────────────────
  const alignLarge = await page.evaluate(() => {
    CommandEngine.alignLefts && CommandEngine.alignLefts();
    const clT = getComputedStyle(document.getElementById('canvas-layer')||document.body).transform;
    DS.selection.clear();
    return { clT };
  });
  if (alignLarge.clT === 'none') ok('align on 100+ objects: canvas transform=none');
  else bad('align broke canvas transform: ' + alignLarge.clT);

  // ── Test scroll with large document ───────────────────────────────
  const scroll = await page.evaluate(() => {
    const ws = document.getElementById('workspace');
    DesignZoomEngine.set(2.0);
    const scrollH = ws?.scrollHeight || 0;
    const clientH = ws?.clientHeight || 0;
    DesignZoomEngine.reset();
    return { scrollable: scrollH > clientH, scrollH, clientH };
  });
  if (scroll.scrollable) ok('large document scrollable at 2x (scrollH=' + scroll.scrollH + ')');
  else bad('large document: workspace not scrollable at 2x');

  // ── Cleanup ───────────────────────────────────────────────────────
  await page.evaluate(() => {
    DS.elements = DS.elements.filter(e => !e.id.startsWith('stress-'));
    DS.saveHistory(); CanvasEngine.renderAll();
  });
  const afterClean = await page.evaluate(() => DS.elements.length);
  if (afterClean < 150) ok('cleanup: stress elements removed (remaining=' + afterClean + ')');
  else bad('cleanup failed: ' + afterClean + ' elements remain');

  // ── Layout invariants ─────────────────────────────────────────────
  const layout = await RF.layout(page);
  if (layout.rv?.ow > 0 && (layout.cl?.ow||0) === 754)
    ok('layout invariants intact after large document test');
  else bad('layout corrupted: rv.ow=' + layout.rv?.ow + ' cl.ow=' + layout.cl?.ow);

  await browser.close();
  process.exit(done() > 0 ? 1 : 0);
})().catch(e => { console.log('FAIL: ' + e.message.slice(0, 120)); process.exit(1); });
EOF

kill $PID 2>/dev/null
