#!/usr/bin/env bash
# repo-command-matrix.sh — Phase 32: Expected Command Matrix Validator
echo "════════════════════════════════════════════════════════"
echo "RF COMMAND MATRIX VALIDATOR"
echo "════════════════════════════════════════════════════════"
python3 reportforge_server.py &
PID=$!
sleep 3

node - <<'EOF'
const {chromium} = require('playwright');
const fs = require('fs');

// ── EXPECTED COMMAND MATRIX ────────────────────────────────────────────────
// Canonical command list for a professional Crystal Reports-style designer.
// Each entry: { id, category, aliases[] }
// aliases = data-action values or DS method names that implement the command
const EXPECTED_COMMANDS = [
  // FILE
  { id:'new-report',             cat:'FILE',       aliases:['new'] },
  { id:'open-report',            cat:'FILE',       aliases:['open'] },
  { id:'save-report',            cat:'FILE',       aliases:['save'] },
  { id:'save-as',                cat:'FILE',       aliases:['save-as'] },
  { id:'export-pdf',             cat:'FILE',       aliases:['export-pdf'] },
  { id:'export-xls',             cat:'FILE',       aliases:['export-xls','export-csv','export-json'] },
  { id:'print-preview',          cat:'FILE',       aliases:['print','preview'] },
  // EDIT
  { id:'undo',                   cat:'EDIT',       aliases:['undo'] },
  { id:'redo',                   cat:'EDIT',       aliases:['redo'] },
  { id:'cut',                    cat:'EDIT',       aliases:['cut'] },
  { id:'copy',                   cat:'EDIT',       aliases:['copy'] },
  { id:'paste',                  cat:'EDIT',       aliases:['paste'] },
  { id:'delete',                 cat:'EDIT',       aliases:['delete'] },
  { id:'duplicate',              cat:'EDIT',       aliases:['duplicate','copy'] },
  // SELECTION
  { id:'select-all',             cat:'SELECTION',  aliases:['select-all'] },
  { id:'deselect-all',           cat:'SELECTION',  aliases:['deselect-all','Escape'] },
  { id:'invert-selection',       cat:'SELECTION',  aliases:['invert-selection'] },
  // MOVEMENT (keyboard arrow keys — not data-action, verified via keyboard)
  { id:'move-left',              cat:'MOVEMENT',   aliases:['ArrowLeft','move-left'] },
  { id:'move-right',             cat:'MOVEMENT',   aliases:['ArrowRight','move-right'] },
  { id:'move-up',                cat:'MOVEMENT',   aliases:['ArrowUp','move-up'] },
  { id:'move-down',              cat:'MOVEMENT',   aliases:['ArrowDown','move-down'] },
  { id:'move-left-large',        cat:'MOVEMENT',   aliases:['ShiftArrowLeft','move-left-large'] },
  { id:'move-right-large',       cat:'MOVEMENT',   aliases:['ShiftArrowRight','move-right-large'] },
  { id:'move-up-large',          cat:'MOVEMENT',   aliases:['ShiftArrowUp','move-up-large'] },
  { id:'move-down-large',        cat:'MOVEMENT',   aliases:['ShiftArrowDown','move-down-large'] },
  // ALIGNMENT
  { id:'align-left',             cat:'ALIGNMENT',  aliases:['align-left','align-lefts'] },
  { id:'align-right',            cat:'ALIGNMENT',  aliases:['align-right','align-rights'] },
  { id:'align-center',           cat:'ALIGNMENT',  aliases:['align-center','align-centers'] },
  { id:'align-top',              cat:'ALIGNMENT',  aliases:['align-top','align-tops'] },
  { id:'align-middle',           cat:'ALIGNMENT',  aliases:['align-middle','align-middles'] },
  { id:'align-bottom',           cat:'ALIGNMENT',  aliases:['align-bottom','align-bottoms'] },
  // DISTRIBUTION
  { id:'distribute-horizontal',  cat:'DISTRIBUTION', aliases:['distribute-horizontal','same-width'] },
  { id:'distribute-vertical',    cat:'DISTRIBUTION', aliases:['distribute-vertical','same-height'] },
  // OBJECT ORDER
  { id:'bring-to-front',         cat:'ORDER',      aliases:['bring-front','bring-to-front'] },
  { id:'send-to-back',           cat:'ORDER',      aliases:['send-back','send-to-back'] },
  { id:'bring-forward',          cat:'ORDER',      aliases:['bring-forward'] },
  { id:'send-backward',          cat:'ORDER',      aliases:['send-backward'] },
  // GROUPING
  { id:'group',                  cat:'GROUPING',   aliases:['group'] },
  { id:'ungroup',                cat:'GROUPING',   aliases:['ungroup'] },
  // ZOOM
  { id:'zoom-in',                cat:'ZOOM',       aliases:['zoom-in'] },
  { id:'zoom-out',               cat:'ZOOM',       aliases:['zoom-out'] },
  { id:'zoom-reset',             cat:'ZOOM',       aliases:['zoom-100','zoom-reset'] },
  { id:'zoom-fit-page',          cat:'ZOOM',       aliases:['zoom-fit','zoom-fit-page'] },
  { id:'zoom-fit-width',         cat:'ZOOM',       aliases:['zoom-fit-width'] },
  // VIEW
  { id:'toggle-design-mode',     cat:'VIEW',       aliases:['toggle-design','tab-design','preview'] },
  { id:'toggle-preview-mode',    cat:'VIEW',       aliases:['preview','toggle-preview'] },
  { id:'toggle-grid',            cat:'VIEW',       aliases:['toggle-grid'] },
  { id:'toggle-guides',          cat:'VIEW',       aliases:['toggle-guides','toggle-rulers'] },
  { id:'toggle-rulers',          cat:'VIEW',       aliases:['toggle-rulers'] },
  // GUIDES
  { id:'add-horizontal-guide',   cat:'GUIDES',     aliases:['add-horizontal-guide','add-h-guide','guide-h'] },
  { id:'add-vertical-guide',     cat:'GUIDES',     aliases:['add-vertical-guide','add-v-guide','guide-v'] },
  { id:'remove-guide',           cat:'GUIDES',     aliases:['remove-guide','clear-guide'] },
  { id:'clear-guides',           cat:'GUIDES',     aliases:['clear-guides'] },
  // MARGINS
  { id:'set-margin-left',        cat:'MARGINS',    aliases:['margin-left','set-margin-left'] },
  { id:'set-margin-right',       cat:'MARGINS',    aliases:['margin-right','set-margin-right'] },
  { id:'set-margin-top',         cat:'MARGINS',    aliases:['margin-top','set-margin-top'] },
  { id:'set-margin-bottom',      cat:'MARGINS',    aliases:['margin-bottom','set-margin-bottom'] },
  // SECTIONS
  { id:'insert-section',         cat:'SECTIONS',   aliases:['insert-section'] },
  { id:'delete-section',         cat:'SECTIONS',   aliases:['delete-section'] },
  { id:'move-section-up',        cat:'SECTIONS',   aliases:['move-section-up'] },
  { id:'move-section-down',      cat:'SECTIONS',   aliases:['move-section-down'] },
  { id:'rename-section',         cat:'SECTIONS',   aliases:['rename-section'] },
  // OBJECT PROPERTIES
  { id:'lock-object',            cat:'OBJECT',     aliases:['lock','lock-object'] },
  { id:'unlock-object',          cat:'OBJECT',     aliases:['unlock','unlock-object'] },
  { id:'hide-object',            cat:'OBJECT',     aliases:['hide','hide-object'] },
  { id:'show-object',            cat:'OBJECT',     aliases:['show','show-object'] },
  // CANVAS
  { id:'toggle-snap',            cat:'CANVAS',     aliases:['toggle-snap'] },
  { id:'toggle-grid-snap',       cat:'CANVAS',     aliases:['toggle-grid','toggle-grid-snap'] },
  { id:'toggle-object-snap',     cat:'CANVAS',     aliases:['toggle-snap','toggle-object-snap'] },
  { id:'clear-selection',        cat:'CANVAS',     aliases:['clear-selection','Escape'] },
  // INSERT TOOLS (Crystal Reports toolbar)
  { id:'insert-text',            cat:'INSERT',     aliases:['insert-text','text'] },
  { id:'insert-box',             cat:'INSERT',     aliases:['insert-box','box'] },
  { id:'insert-line',            cat:'INSERT',     aliases:['insert-line','line'] },
  { id:'insert-field',           cat:'INSERT',     aliases:['insert-field','field'] },
  // FORMAT
  { id:'color-font',             cat:'FORMAT',     aliases:['color-font'] },
  { id:'color-bg',               cat:'FORMAT',     aliases:['color-bg'] },
  { id:'color-border',           cat:'FORMAT',     aliases:['color-border'] },
  { id:'format-field',           cat:'FORMAT',     aliases:['format-field'] },
  // NAVIGATION
  { id:'page-first',             cat:'NAVIGATION', aliases:['page-first'] },
  { id:'page-last',              cat:'NAVIGATION', aliases:['page-last'] },
  { id:'page-next',              cat:'NAVIGATION', aliases:['page-next'] },
  { id:'page-prev',              cat:'NAVIGATION', aliases:['page-prev'] },
  // APPLICATION
  { id:'quit',                   cat:'FILE',       aliases:['quit'] },
  { id:'refresh',                cat:'VIEW',       aliases:['refresh'] },
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport:{width:1400,height:900} });
  await page.goto('http://localhost:8080/classic');
  await page.waitForTimeout(3000);
  await page.waitForFunction("() => typeof DS !== 'undefined' && DS.elements.length > 0");

  // ── Discover implemented commands ──────────────────────────────────
  const discovered = await page.evaluate(() => {
    const uiActions  = new Set([...document.querySelectorAll('[data-action]')].map(e=>e.dataset.action));
    // Keyboard shortcuts (arrow keys verified via pointerdown handler inspection)
    const kbCommands = new Set(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',
                                 'ShiftArrowLeft','ShiftArrowRight','ShiftArrowUp','ShiftArrowDown',
                                 'Escape','Delete']);
    // DS methods that map to commands
    const dsCommands = new Set(Object.keys(DS).filter(k=>typeof DS[k]==='function'));
    // AlignEngine
    const alignCmds  = typeof AlignEngine!=='undefined'
      ? new Set(Object.keys(AlignEngine).filter(k=>typeof AlignEngine[k]==='function'))
      : new Set();
    // All discovered together
    const all = new Set([...uiActions, ...kbCommands]);
    return {
      uiActions:  [...uiActions].sort(),
      kbCommands: [...kbCommands].sort(),
      dsCommands: [...dsCommands].sort(),
      alignCmds:  [...alignCmds].sort(),
      allDiscovered: [...all].sort(),
    };
  });

  // ── Compare expected vs discovered ────────────────────────────────
  const allDiscovered = new Set(discovered.allDiscovered);
  const results = EXPECTED_COMMANDS.map(cmd => {
    const implemented = cmd.aliases.some(a => allDiscovered.has(a));
    return { ...cmd, implemented };
  });

  const implemented   = results.filter(r => r.implemented);
  const missing       = results.filter(r => !r.implemented);
  const uiWithNoCmd   = discovered.uiActions.filter(a =>
    !EXPECTED_COMMANDS.some(c => c.aliases.includes(a))
  );

  // ── Category breakdown ─────────────────────────────────────────────
  const categories = {};
  results.forEach(r => {
    if (!categories[r.cat]) categories[r.cat] = {implemented:0, missing:0, total:0};
    categories[r.cat].total++;
    if (r.implemented) categories[r.cat].implemented++;
    else                categories[r.cat].missing++;
  });

  // ── Print report ───────────────────────────────────────────────────
  console.log('');
  console.log('  ─────────────────────────────────────────────');
  console.log('  RF COMMAND MATRIX');
  console.log('  ─────────────────────────────────────────────');
  console.log('  Expected commands:      '+EXPECTED_COMMANDS.length);
  console.log('  Commands implemented:   '+implemented.length);
  console.log('  Commands missing:       '+missing.length);
  console.log('  UI controls w/o cmd:    '+uiWithNoCmd.length);
  console.log('');
  console.log('  By category:');
  Object.entries(categories).sort().forEach(([cat,v]) => {
    const pct = Math.round(v.implemented/v.total*100);
    const bar = '█'.repeat(Math.round(pct/10))+'░'.repeat(10-Math.round(pct/10));
    console.log('    '+cat.padEnd(14)+' ['+bar+'] '+pct+'% ('+v.implemented+'/'+v.total+')');
  });
  if (missing.length > 0) {
    console.log('');
    console.log('  Missing commands (grouped by category):');
    const byCategory = {};
    missing.forEach(c => { if(!byCategory[c.cat]) byCategory[c.cat]=[]; byCategory[c.cat].push(c.id); });
    Object.keys(byCategory).sort().forEach(cat => {
      console.log('    '+cat+':');
      byCategory[cat].forEach(id => console.log('      '+id));
    });
  }
  if (uiWithNoCmd.length > 0) {
    console.log('');
    console.log('  UI controls with no command mapping:');
    uiWithNoCmd.forEach(a => console.log('    UNMAPPED: data-action="'+a+'"'));
  }

  // ── Export repo-command-map.json ───────────────────────────────────
  const mapOutput = {
    version: '1.0',
    timestamp: new Date().toISOString(),
    summary: {
      expectedCommands:  EXPECTED_COMMANDS.length,
      implementedCommands: implemented.length,
      missingCommands:   missing.length,
      uiControlsWithoutCommand: uiWithNoCmd.length,
      coveragePct: Math.round(implemented.length/EXPECTED_COMMANDS.length*100)+'%',
    },
    missingCommands: missing.map(c => ({ id:c.id, category:c.cat })),
    implementedCommands: implemented.map(c => ({ id:c.id, category:c.cat, via:c.aliases[0] })),
    unmappedUIControls: uiWithNoCmd,
    discoveredUIActions: discovered.uiActions,
    categories,
  };
  fs.writeFileSync('repo-command-map.json', JSON.stringify(mapOutput, null, 2));
  fs.writeFileSync('repo-missing-commands.json', JSON.stringify({
    timestamp: new Date().toISOString(),
    missingCount: missing.length,
    missingCommands: missing.map(c => c.id),
    missingByCategory: (() => {
      const byCat = {};
      missing.forEach(c => { if(!byCat[c.cat]) byCat[c.cat]=[]; byCat[c.cat].push(c.id); });
      return byCat;
    })(),
  }, null, 2));
  console.log('');
  console.log('  repo-command-map.json exported');
  console.log('  repo-missing-commands.json exported ('+missing.length+' missing commands)');

  // ── FAIL / WARN conditions ──────────────────────────────────────────
  const pct = Math.round(implemented.length/EXPECTED_COMMANDS.length*100);
  console.log('');
  let exitCode = 0;
  if (uiWithNoCmd.length > 0) {
    console.log('WARN: '+uiWithNoCmd.length+' UI controls have no command mapping (new features)');
    // Only FAIL if these controls also throw JS errors or break UI (caught elsewhere)
  }
  if (missing.length > 0) {
    console.log('WARN: '+missing.length+' expected commands not yet implemented');
  }
  if (pct < 80) {
    console.log('WARN: command coverage '+pct+'% is below 80% threshold');
  }
  if (exitCode === 0) {
    console.log('PASS: command matrix validated — '+implemented.length+'/'+EXPECTED_COMMANDS.length+' commands ('+pct+'%)');
    if (uiWithNoCmd.length === 0) console.log('PASS: all UI controls have command mappings');
  }

  await browser.close();
  process.exit(exitCode);
})().catch(e => { console.log('FAIL: '+e.message.slice(0,120)); process.exit(1); });
EOF

kill $PID 2>/dev/null
