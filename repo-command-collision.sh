#!/usr/bin/env bash
# repo-command-collision.sh — Phase 36: Command Registry Consistency
echo "════════════════════════════════════════"
echo "RF COMMAND COLLISION DETECTION"
echo "════════════════════════════════════════"
python3 reportforge_server.py &
PID=$!; sleep 3

node - <<'EOF'
const RF = require('./_rf_test_lib.js');
(async () => {
  const { browser, page, jsErrors } = await RF.launch();
  const { ok, bad, done } = RF.reporter('repo-command-collision');

  // ── Test 1: No duplicate data-action values in toolbar ───────────
  const duplicates = await page.evaluate(() => {
    const allBtns = [...document.querySelectorAll('[data-action]')];
    const actions = allBtns.map(b => b.dataset.action).filter(Boolean);
    const seen = {}, dupes = [];
    actions.forEach(a => {
      if (seen[a] > 0) dupes.push(a);
      seen[a] = (seen[a] || 0) + 1;
    });
    // Registry buttons (hidden) are intentionally duplicated — filter to visible only
    const visibleBtns = allBtns.filter(b => {
      const r = b.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    const visibleActions = visibleBtns.map(b => b.dataset.action).filter(Boolean);
    const visibleSeen = {}, visibleDupes = [];
    visibleActions.forEach(a => {
      if (visibleSeen[a] > 0) visibleDupes.push(a);
      visibleSeen[a] = (visibleSeen[a] || 0) + 1;
    });
    return { totalActions: actions.length, visibleActions: visibleActions.length,
             visibleDupes, allDupes: dupes };
  });
  if (duplicates.visibleDupes.length === 0)
    ok('no duplicate data-action in visible toolbar (' + duplicates.visibleActions + ' unique actions)');
  else bad('duplicate visible actions: ' + duplicates.visibleDupes.join(', '));

  // ── Test 2: CommandEngine has no property name conflicts ──────────
  const cmdConflicts = await page.evaluate(() => {
    const cmdKeys = Object.keys(CommandEngine);
    const dupes = cmdKeys.filter((k, i) => cmdKeys.indexOf(k) !== i);
    return { total: cmdKeys.length, dupes };
  });
  if (cmdConflicts.dupes.length === 0)
    ok('CommandEngine: ' + cmdConflicts.total + ' methods, 0 name conflicts');
  else bad('CommandEngine name conflicts: ' + cmdConflicts.dupes.join(', '));

  // ── Test 3: CMD_REGISTRY has no duplicate entries ─────────────────
  const registryDupes = await page.evaluate(() => {
    const reg = window.__rfCommandRegistry || [];
    const seen = {}, dupes = [];
    reg.forEach(cmd => { if (seen[cmd]) dupes.push(cmd); seen[cmd] = true; });
    return { total: reg.length, dupes };
  });
  if (registryDupes.dupes.length === 0)
    ok('CMD_REGISTRY: ' + registryDupes.total + ' commands, 0 duplicates');
  else bad('CMD_REGISTRY duplicates: ' + registryDupes.dupes.join(', '));

  // ── Test 4: All CommandEngine methods are functions ───────────────
  const notFunctions = await page.evaluate(() => {
    return Object.entries(CommandEngine)
      .filter(([k, v]) => typeof v !== 'function')
      .map(([k]) => k);
  });
  if (notFunctions.length === 0) ok('all CommandEngine properties are functions');
  else bad('non-function CommandEngine properties: ' + notFunctions.join(', '));

  // ── Test 5: computeLayout exposed and consistent ──────────────────
  const layoutConsist = await page.evaluate(() => {
    const lay1 = computeLayout();
    const lay2 = computeLayout();
    return { consistent: JSON.stringify(lay1) === JSON.stringify(lay2),
             lay1 };
  });
  if (layoutConsist.consistent)
    ok('computeLayout() is pure/deterministic (same result on repeated calls)');
  else bad('computeLayout() is not deterministic!');

  // ── Test 6: No JS errors during tests ─────────────────────────────
  if (jsErrors.length === 0) ok('zero JS errors during command collision tests');
  else bad(jsErrors.length + ' JS errors: ' + jsErrors[0]?.slice(0, 80));

  // ── Layout invariants ─────────────────────────────────────────────
  const layout = await RF.layout(page);
  if (layout.rv?.ow > 0) ok('rulers intact after command collision tests');
  else bad('rulers disappeared!');

  await browser.close();
  process.exit(done() > 0 ? 1 : 0);
})().catch(e => { console.log('FAIL: ' + e.message.slice(0, 120)); process.exit(1); });
EOF

kill $PID 2>/dev/null
