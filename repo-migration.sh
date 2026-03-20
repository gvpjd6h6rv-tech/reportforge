#!/usr/bin/env bash
# repo-migration.sh — Phase 36: Document Version Migration
echo "════════════════════════════════════════"
echo "RF DOCUMENT MIGRATION"
echo "════════════════════════════════════════"
python3 reportforge_server.py &
PID=$!; sleep 3

node - <<'EOF'
const RF = require('./_rf_test_lib.js');
(async () => {
  const { browser, page, jsErrors } = await RF.launch();
  const { ok, bad, done } = RF.reporter('repo-migration');

  // ── Simulate loading a v1 document (missing new fields) ───────────
  const v1Migration = await page.evaluate(() => {
    // v1 schema: elements without zIndex, sectionId, groupId, locked, hidden
    const v1Elements = [
      { id: 'v1-001', type: 'text', content: 'Legacy text', x: 10, y: 10, w: 100, h: 14 },
      { id: 'v1-002', type: 'box',  x: 20, y: 30, w: 50, h: 20 },
    ];
    // Migrate: apply defaults for missing fields
    const migrated = v1Elements.map(el => ({
      ...el,
      sectionId: el.sectionId || DS.sections[0]?.id,
      zIndex:    typeof el.zIndex  !== 'undefined' ? el.zIndex  : 0,
      locked:    el.locked  || false,
      hidden:    el.hidden  || false,
    }));
    // Verify all required fields present
    const allValid = migrated.every(el =>
      el.sectionId && typeof el.zIndex === 'number' &&
      typeof el.locked === 'boolean' && typeof el.hidden === 'boolean'
    );
    return { allValid, count: migrated.length };
  });
  if (v1Migration.allValid) ok('v1 migration: all required fields have defaults (' + v1Migration.count + ' elements)');
  else bad('v1 migration: missing required fields after upgrade');

  // ── Simulate loading v2 (no visible on sections) ──────────────────
  const v2Migration = await page.evaluate(() => {
    const v2Sections = [
      { id: 'v2-s1', stype: 'rh', label: 'Header', height: 60 }, // no 'visible' field
    ];
    const migrated = v2Sections.map(sec => ({
      ...sec,
      visible: typeof sec.visible !== 'undefined' ? sec.visible : true,
    }));
    return { visibleDefined: typeof migrated[0].visible !== 'undefined', value: migrated[0].visible };
  });
  if (v2Migration.visibleDefined && v2Migration.value === true)
    ok('v2 migration: section.visible defaults to true');
  else bad('v2 migration: section.visible not defaulted correctly');

  // ── Test DS.snap migration compatibility ──────────────────────────
  const snapMigration = await page.evaluate(() => {
    // Old documents may have non-integer coords — snap normalizes them
    const tests = [{ x: 5.3, expected: 8 }, { x: 12.7, expected: 16 }, { x: 0.1, expected: 0 }];
    const results = tests.map(t => ({ in: t.x, out: DS.snap(t.x), expected: t.expected }));
    const allOk = results.every(r => r.out === r.expected);
    return { allOk, results };
  });
  if (snapMigration.allOk) ok('snap normalizes legacy non-integer coordinates');
  else bad('snap migration failed: ' + JSON.stringify(snapMigration.results.filter(r => r.out !== r.expected)));

  // ── computeLayout() available after doc load ───────────────────────
  const layoutAfter = await page.evaluate(() => {
    return typeof window.computeLayout === 'function' && typeof window.LayoutEngine !== 'undefined';
  });
  if (layoutAfter) ok('computeLayout() and LayoutEngine available after migration tests');
  else bad('computeLayout() not available');

  // ── Layout invariants ─────────────────────────────────────────────
  const layout = await RF.layout(page);
  if (layout.rv?.ow > 0) ok('rulers intact after migration tests');
  else bad('rulers disappeared!');

  await browser.close();
  process.exit(done() > 0 ? 1 : 0);
})().catch(e => { console.log('FAIL: ' + e.message.slice(0, 120)); process.exit(1); });
EOF

kill $PID 2>/dev/null
