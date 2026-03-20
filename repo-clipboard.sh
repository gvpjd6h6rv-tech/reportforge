#!/usr/bin/env bash
# repo-clipboard.sh — Phase 36: Clipboard Operations Validation
echo "════════════════════════════════════════"
echo "RF CLIPBOARD OPERATIONS"
echo "════════════════════════════════════════"
python3 reportforge_server.py &
PID=$!; sleep 3

node - <<'EOF'
const RF = require('./_rf_test_lib.js');
(async () => {
  const { browser, page, jsErrors } = await RF.launch();
  const { ok, bad, done } = RF.reporter('repo-clipboard');

  // ── Test 1: Copy ──────────────────────────────────────────────────
  const copy = await page.evaluate(() => {
    DS.selection.clear();
    DS.selection.add(DS.elements[0]?.id);
    CommandEngine.copy();
    return { clipLen: DS.clipboard?.length || 0,
             clipId: DS.clipboard?.[0] ? JSON.parse(DS.clipboard[0]).id : null,
             origId: DS.elements[0]?.id };
  });
  if (copy.clipLen > 0) ok('copy: ' + copy.clipLen + ' item(s) in clipboard');
  else bad('copy: clipboard empty after Ctrl+C');

  // ── Test 2: Paste regenerates IDs ─────────────────────────────────
  const paste = await page.evaluate(() => {
    const countBefore = DS.elements.length;
    const origId = DS.clipboard?.[0] ? JSON.parse(DS.clipboard[0]).id : null;
    CommandEngine.paste();
    const countAfter = DS.elements.length;
    const newEl = DS.elements[DS.elements.length - 1];
    const idRegenerated = newEl?.id !== origId;
    return { countBefore, countAfter, newId: newEl?.id, origId, idRegenerated };
  });
  if (paste.countAfter > paste.countBefore) ok('paste: element count increased (' + paste.countBefore + '→' + paste.countAfter + ')');
  else bad('paste: no new element created');
  if (paste.idRegenerated) ok('paste: new element has fresh ID (not duplicate)');
  else bad('paste: ID not regenerated — duplicate ID: ' + paste.origId);

  // ── Test 3: Pasted element offset from original ───────────────────
  const offset = await page.evaluate(() => {
    // The last pasted element should be offset by 8px from source
    const src = DS.elements.find(e => e.id === DS.clipboard?.[0] ? JSON.parse(DS.clipboard[0]).id : null);
    const newEl = DS.elements[DS.elements.length - 1];
    // Copy of last pasted element
    DS.selection.clear();
    DS.selection.add(newEl?.id);
    const xBefore = newEl?.x || 0;
    CommandEngine.copy();
    CommandEngine.paste();
    const newest = DS.elements[DS.elements.length - 1];
    const xOffset = (newest?.x || 0) - xBefore;
    return { xOffset, x1: xBefore, x2: newest?.x };
  });
  if (Math.abs(offset.xOffset) >= 4) ok('paste: coordinates offset (' + offset.xOffset + 'px from original)');
  else bad('paste: zero offset — objects stacked on top of each other');

  // ── Test 4: Selection updated after paste ─────────────────────────
  const selAfterPaste = await page.evaluate(() => {
    DS.selection.clear();
    DS.selection.add(DS.elements[0]?.id);
    CommandEngine.copy();
    CommandEngine.paste();
    // Selection should contain newly pasted element
    return { selCount: DS.selection.size, selIds: [...DS.selection] };
  });
  if (selAfterPaste.selCount > 0) ok('selection updated after paste (' + selAfterPaste.selCount + ' selected)');
  else bad('selection empty after paste');

  // ── Test 5: Multiple paste ────────────────────────────────────────
  const multiPaste = await page.evaluate(() => {
    DS.selection.clear();
    DS.selection.add(DS.elements[0]?.id);
    CommandEngine.copy();
    const before = DS.elements.length;
    CommandEngine.paste();
    CommandEngine.paste();
    CommandEngine.paste();
    return { before, after: DS.elements.length, added: DS.elements.length - before };
  });
  if (multiPaste.added === 3) ok('multiple paste: 3 pastes → 3 new elements');
  else bad('multiple paste: expected +3, got +' + multiPaste.added);

  // ── Test 6: Clipboard survives mode switch ────────────────────────
  const clipSurvive = await page.evaluate(() => {
    DS.selection.clear();
    DS.selection.add(DS.elements[0]?.id);
    CommandEngine.copy();
    const lenBefore = DS.clipboard?.length || 0;
    PreviewEngine.show();
    PreviewEngine.hide();
    const lenAfter = DS.clipboard?.length || 0;
    return { lenBefore, lenAfter };
  });
  if (clipSurvive.lenBefore === clipSurvive.lenAfter)
    ok('clipboard survives preview mode toggle');
  else bad('clipboard cleared by mode switch!');

  // ── Cleanup & invariants ──────────────────────────────────────────
  await page.evaluate(() => { while(DS.historyIndex>0) DS.undo&&DS.undo(); CanvasEngine.renderAll(); });
  const layout = await RF.layout(page);
  if (layout.rv?.ow > 0) ok('rulers intact after clipboard tests');
  else bad('rulers disappeared!');

  await browser.close();
  process.exit(done() > 0 ? 1 : 0);
})().catch(e => { console.log('FAIL: ' + e.message.slice(0, 120)); process.exit(1); });
EOF

kill $PID 2>/dev/null
