import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const detachedWindowSource = fs.readFileSync(
  'tools/rf-debug-center/rf-debug-center-detached-window.js',
  'utf8'
);

assert.ok(
  detachedWindowSource.includes("import { DETACHED_DEBUG_CENTER_CLIENT_SCRIPT }"),
  'detached window must import extracted client script'
);

assert.ok(
  detachedWindowSource.includes("import { DETACHED_DEBUG_CENTER_STYLES }"),
  'detached window must import extracted styles'
);

assert.ok(
  detachedWindowSource.includes(
    "['Last Event', `<section class=\"panel raw-panel\"><h2>LAST EVENT</h2><pre>${esc(safeJson(data.last))}</pre></section>`],"
  ),
  'Last Event tab must remain complete and not be mixed with styles'
);

assert.ok(
  /<style>\s*\n\$\{DETACHED_DEBUG_CENTER_STYLES\}/.test(detachedWindowSource),
  'detached generated HTML must inject extracted styles inside <style>'
);

assert.ok(
  /<script>\s*\n\$\{DETACHED_DEBUG_CENTER_CLIENT_SCRIPT\}/.test(detachedWindowSource),
  'detached generated HTML must inject extracted client script inside <script>'
);

assert.ok(
  !detachedWindowSource.includes('raw-pa${DETACHED_DEBUG_CENTER_STYLES'),
  'regression guard: styles must never be spliced into Last Event tab markup'
);

const detachedWindowModule = await import('../../tools/rf-debug-center/rf-debug-center-detached-window.js');
assert.equal(
  typeof detachedWindowModule.createDetachedDebugCenterWindow,
  'function',
  'detached window module must parse and export createDetachedDebugCenterWindow'
);

const clientScriptModule = await import('../../tools/rf-debug-center/rf-debug-center-detached-client-script.js');
assert.equal(typeof clientScriptModule.DETACHED_DEBUG_CENTER_CLIENT_SCRIPT, 'string');
new vm.Script(clientScriptModule.DETACHED_DEBUG_CENTER_CLIENT_SCRIPT, {
  filename: 'detached-debug-center-inline-client.js',
});

const stylesModule = await import('../../tools/rf-debug-center/rf-debug-center-detached-styles.js');
assert.equal(typeof stylesModule.DETACHED_DEBUG_CENTER_STYLES, 'string');
assert.ok(stylesModule.DETACHED_DEBUG_CENTER_STYLES.includes(':root'));

console.log('rf debug center detached html contract: PASS');
