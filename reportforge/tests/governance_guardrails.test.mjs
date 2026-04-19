import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SHELL_HTML_PATH = path.join(ROOT, 'designer/crystal-reports-designer-v4.html');
const SHELL_MAX_BYTES = 30_000;
const ALLOWED_WINDOW_EXPORTS = [
  'RF',
  'CFG',
  'FIELD_TREE',
  'SAMPLE_DATA',
  'FORMATS',
  'resolveField',
  'formatValue',
  'getCanvasPos',
  'initKeyboard_DISABLED_v19',
  'initClock',
  '__rfTraceLegacy',
  'FormulaEngine',
  'FormulaEditorDialog',
  'DesignerUI',
  'RF_DEBUG',
  'RF_DEBUG_TRACE',
  'RF_DEBUG_TRACE_RUNTIME',
  'RF_DEBUG_TRACE_ELEMENTS',
  'DebugTrace',
  'rfTrace',
  'makePanelDraggable',
  'DebugChannelsPanel',
  '__rfConsoleGateInstalled',
  '__rfConsoleOriginal',
  'DebugTraceToggle',
  'DebugOverlay',
  'DOC_TYPES',
  'shadeColor',
  'canvas',
  '__rfVerify',
  'SnapEngine',
  'GridEngine',
  'RulerEngine',
  'WorkspaceScrollEngine',
].sort();

function countMatches(source, regex) {
  return (source.match(regex) || []).length;
}

function normalizeForScan(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/`(?:\\.|[^`])*`/g, '``')
    .replace(/'(?:\\.|[^'])*'/g, "''")
    .replace(/"(?:\\.|[^"])*"/g, '""');
}

function collectViolations(source) {
  const normalized = normalizeForScan(source);
  const rules = [
    {
      code: 'legacy-canvas-facade-call',
      regex: /\bCanvasEngine\.(?:renderAll|renderElement|buildElementDiv|updateElement|updateElementPosition|update|updateSync)\s*\(/g,
    },
    {
      code: 'legacy-preview-facade-call',
      regex: /\bPreviewEngine\.(?:show|hide|toggle|refresh)\s*\(/g,
    },
    {
      code: 'legacy-preview-render-mode-call',
      regex: /\bPreviewEngine\.renderMode\b/g,
    },
    {
      code: 'legacy-canvas-facade-definition',
      regex: /\bconst\s+CanvasEngine\s*=\s*\{/g,
    },
    {
      code: 'legacy-preview-facade-definition',
      regex: /\bconst\s+PreviewEngine\s*=\s*\{/g,
    },
    {
      code: 'legacy-dom-alias',
      regex: /\.rf-el\b/g,
    },
    {
      code: 'legacy-preview-selection-class',
      regex: /\bpv-origin-selected\b/g,
    },
  ];
  const violations = [];
  for (const rule of rules) {
    if (rule.regex.test(normalized)) violations.push(rule.code);
    rule.regex.lastIndex = 0;
  }
  return violations;
}

function retiredEngineRegex(parts) {
  return new RegExp(`\\b${parts.join('')}\\b`);
}

function collectWindowWrites(source) {
  const writes = new Set();
  const re = /window\.([A-Za-z0-9_]+)\s*=/g;
  let match;
  while ((match = re.exec(source))) writes.add(match[1]);
  return writes;
}

test('guardrail detector catches synthetic architectural violations', () => {
  const bad = `
    CanvasEngine.renderAll();
    PreviewEngine.toggle();
    window.foo = PreviewEngine.renderMode;
    const CanvasEngine = {};
    const PreviewEngine = {};
  `;
  const violations = collectViolations(bad);
  assert.deepEqual(violations, [
    'legacy-canvas-facade-call',
    'legacy-preview-facade-call',
    'legacy-preview-render-mode-call',
    'legacy-canvas-facade-definition',
    'legacy-preview-facade-definition',
  ]);
});

test('canonical runtime files do not call legacy canvas or preview facades', () => {
  const files = [
    path.join(ROOT, 'designer/crystal-reports-designer-v4.html'),
    path.join(ROOT, 'engines/EngineCore.js'),
    path.join(ROOT, 'engines/SelectionEngine.js'),
    path.join(ROOT, 'engines/HistoryEngine.js'),
    path.join(ROOT, 'engines/ClipboardEngine.js'),
  ];

  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    const violations = collectViolations(src);
    assert.deepEqual(violations, [], `${path.basename(file)} has violations: ${violations.join(', ')}`);
  }
});

test('monolith no longer defines the document store inline', () => {
  const html = fs.readFileSync(SHELL_HTML_PATH, 'utf8');
  assert.doesNotMatch(html, /\bconst\s+DS\s*=\s*\{/);
  assert.doesNotMatch(html, /\bfunction\s+newId\s*\(/);
  assert.doesNotMatch(html, /\bfunction\s+mkEl\s*\(/);
  assert.match(html, /<script src="\/engines\/DocumentStore\.js"><\/script>/);
});

test('monolith no longer keeps deferred boot handlers inline', () => {
  const html = fs.readFileSync(SHELL_HTML_PATH, 'utf8');
  const matches = html.match(/document\.addEventListener\('DOMContentLoaded'/g) || [];
  assert.equal(matches.length, 0, 'monolith should not keep DOMContentLoaded boot handlers inline');
  assert.match(html, /<script src="\/engines\/RuntimeBootstrap\.js"><\/script>/);
  assert.match(html, /<script src="\/engines\/DeferredBootstrap\.js"><\/script>/);
});

test('monolith no longer registers extracted global root handlers inline', () => {
  const html = fs.readFileSync(SHELL_HTML_PATH, 'utf8');
  assert.doesNotMatch(html, /\bfunction\s+initMouseEvents\s*\(/);
  assert.doesNotMatch(html, /document\.addEventListener\('pointermove'/);
  assert.doesNotMatch(html, /document\.addEventListener\('pointerup'/);
  assert.doesNotMatch(html, /window\.addEventListener\('resize',\(\)=>OverlayEngine\.render\(\)\)/);
  assert.doesNotMatch(html, /document\.getElementById\('workspace'\)\.addEventListener\('wheel'/);
  assert.doesNotMatch(html, /DesignZoomEngine\.setFree\(DS\.zoom \* WHEEL_FACTOR, e\.clientX, e\.clientY\)/);
  assert.match(html, /<script src="\/engines\/GlobalEventHandlers\.js"><\/script>/);
});

test('monolith no longer defines command orchestration inline', () => {
  const html = fs.readFileSync(SHELL_HTML_PATH, 'utf8');
  assert.doesNotMatch(html, /\bconst\s+CommandEngine\s*=\s*\{/);
  assert.doesNotMatch(html, /\bconst\s+FileEngine\s*=\s*\{/);
  assert.doesNotMatch(html, /\bfunction\s+handleAction\s*\(/);
  assert.doesNotMatch(html, /\bfunction\s+switchDocType\s*\(/);
  assert.doesNotMatch(html, /btn\.addEventListener\('click',\(\)=>handleAction\(btn\.dataset\.action\)\)/);
  assert.doesNotMatch(html, /btn\.addEventListener\('click',\(\)=>InsertEngine\.setTool\(btn\.dataset\.tool\)\)/);
  assert.doesNotMatch(html, /document\.getElementById\('tb-zoom'\)\?\.addEventListener\('change'/);
  assert.doesNotMatch(html, /document\.getElementById\('tab-design'\)\?\.addEventListener\('click'/);
  assert.doesNotMatch(html, /document\.getElementById\('tab-preview'\)\?\.addEventListener\('click'/);
  assert.match(html, /<script src="\/engines\/CommandRuntime\.js"><\/script>/);
});

test('monolith no longer defines UI adapter wiring inline', () => {
  const html = fs.readFileSync(SHELL_HTML_PATH, 'utf8');
  assert.doesNotMatch(html, /\bfunction\s+initToolbars\s*\(/);
  assert.doesNotMatch(html, /document\.querySelectorAll\('\[data-format\]'\)\.forEach/);
  assert.doesNotMatch(html, /document\.getElementById\('tb-font-name'\)\?\.addEventListener/);
  assert.doesNotMatch(html, /document\.getElementById\('tb-font-size'\)\?\.addEventListener/);
  assert.match(html, /<script src="\/engines\/UIAdapters\.js"><\/script>/);
});

test('monolith no longer defines menu engines inline', () => {
  const html = fs.readFileSync(SHELL_HTML_PATH, 'utf8');
  assert.doesNotMatch(html, /\bconst\s+MenuEngine\s*=\s*\{/);
  assert.doesNotMatch(html, /\bconst\s+ContextMenuEngine\s*=\s*\{/);
  assert.doesNotMatch(html, /document\.addEventListener\('click',\(\)=>this\.closeAll\(\)\)/);
  assert.match(html, /<script src="\/engines\/MenuAdapters\.js"><\/script>/);
});

test('monolith no longer defines critical interaction engines inline', () => {
  const html = fs.readFileSync(SHELL_HTML_PATH, 'utf8');
  assert.doesNotMatch(html, /\bconst\s+SelectionEngine\s*=\s*\{/);
  assert.doesNotMatch(html, /\bconst\s+SectionEngine\s*=\s*\{/);
  assert.doesNotMatch(html, /\bconst\s+SectionResizeEngine\s*=\s*\{/);
  assert.doesNotMatch(html, /\bconst\s+OverlayEngine\s*=\s*\{/);
  assert.doesNotMatch(html, /\bconst\s+InsertEngine\s*=\s*\{/);
  assert.match(html, /<script src="\/engines\/SectionEngine\.js"><\/script>/);
  assert.match(html, /<script src="\/engines\/SectionResizeEngine\.js"><\/script>/);
  assert.match(html, /<script src="\/engines\/InsertEngine\.js"><\/script>/);
  assert.match(html, /<script src="\/engines\/SelectionEngine\.js"><\/script>/);
  assert.match(html, /<script src="\/engines\/OverlayEngine\.js"><\/script>/);
});

test('monolith loads engine core contract helpers before EngineCore', () => {
  const html = fs.readFileSync(SHELL_HTML_PATH, 'utf8');
  assert.match(html, /<script src="\/engines\/EngineCoreContracts\.js"><\/script>/);
  assert.match(html, /<script src="\/engines\/EngineCore\.js"><\/script>/);
});

test('monolith no longer defines properties, explorer, or zoom engines inline', () => {
  const html = fs.readFileSync(SHELL_HTML_PATH, 'utf8');
  assert.doesNotMatch(html, /\bconst\s+PropertiesEngine\s*=\s*\{/);
  assert.doesNotMatch(html, /\bconst\s+FormatEngine\s*=\s*\{/);
  assert.doesNotMatch(html, /\bconst\s+FieldExplorerEngine\s*=\s*\{/);
  assert.doesNotMatch(html, /\bconst\s+DesignZoomEngine\s*=\s*\{/);
  assert.doesNotMatch(html, /\bconst\s+PreviewZoomEngine\s*=\s*\{/);
  assert.doesNotMatch(html, /\bconst\s+ZoomWidget\s*=\s*\{/);
  assert.doesNotMatch(html, /\bconst\s+ZoomEngine\s*=\s*\{/);
  assert.doesNotMatch(html, /\bfunction\s+computeLayout\s*\(/);
  assert.doesNotMatch(html, /\bfunction\s+applyLayout\s*\(/);
  assert.doesNotMatch(html, /\bfunction\s+_canonicalPreviewWriter\s*\(/);
  assert.match(html, /<script src="\/engines\/PropertiesEngine\.js"><\/script>/);
  assert.match(html, /<script src="\/engines\/FormatEngine\.js"><\/script>/);
  assert.match(html, /<script src="\/engines\/FieldExplorerEngine\.js"><\/script>/);
  assert.match(html, /<script src="\/engines\/ZoomEngine\.js"><\/script>/);
});

test('monolith no longer keeps runtime globals, formula/debug, or doc-type probes inline', () => {
  const html = fs.readFileSync(SHELL_HTML_PATH, 'utf8');
  assert.doesNotMatch(html, /\bconst\s+FormulaEngine\s*=\s*\(/);
  assert.doesNotMatch(html, /\bconst\s+FormulaEditorDialog\s*=\s*\{/);
  assert.doesNotMatch(html, /\bconst\s+DesignerUI\s*=\s*\{/);
  assert.doesNotMatch(html, /\bconst\s+DebugTrace\s*=\s*\{/);
  assert.doesNotMatch(html, /\bconst\s+DebugChannelsPanel\s*=\s*\{/);
  assert.doesNotMatch(html, /\bconst\s+DebugTraceToggle\s*=\s*\{/);
  assert.doesNotMatch(html, /\bconst\s+DebugOverlay\s*=\s*\{/);
  assert.doesNotMatch(html, /\bconst\s+DOC_TYPES\s*=\s*\{/);
  assert.doesNotMatch(html, /\bconst\s+canvas\s*=\s*\{/);
  assert.doesNotMatch(html, /\bfunction\s+resolveField\s*\(/);
  assert.doesNotMatch(html, /\bfunction\s+formatValue\s*\(/);
  assert.doesNotMatch(html, /\bfunction\s+getCanvasPos\s*\(/);
  assert.doesNotMatch(html, /\bfunction\s+initClock\s*\(/);
  assert.doesNotMatch(html, /onclick="DesignerUI\.toggleMode\(\)"/);
  assert.doesNotMatch(html, /<script>\s*<\/script>/);
  assert.match(html, /<script src="\/engines\/RuntimeGlobals\.js"><\/script>/);
  assert.match(html, /<script src="\/engines\/FormulaAndDebug\.js"><\/script>/);
  assert.match(html, /<script src="\/engines\/DocTypeAndProbes\.js"><\/script>/);
});

test('shell HTML stays pure: no inline script, style, or DOM event attributes', () => {
  const html = fs.readFileSync(SHELL_HTML_PATH, 'utf8');
  assert.doesNotMatch(html, /<script(?!\s+src=)[^>]*>/, 'shell must not contain inline <script> blocks');
  assert.doesNotMatch(html, /<style\b/i, 'shell must not contain inline <style> blocks');
  assert.doesNotMatch(html, /\sstyle=/i, 'shell must not contain inline style= attributes');
  assert.doesNotMatch(
    html,
    /\son(?:click|change|input|load|mousedown|mouseup|mousemove|pointerdown|pointerup|wheel)=/i,
    'shell must not contain inline DOM event attributes',
  );
});

test('shell HTML stays structurally pure and below strict size threshold', () => {
  const html = fs.readFileSync(SHELL_HTML_PATH, 'utf8');
  assert.equal(Buffer.byteLength(html, 'utf8') <= SHELL_MAX_BYTES, true,
    `shell exceeded ${SHELL_MAX_BYTES} byte threshold`);
  assert.doesNotMatch(html, /\bfunction\s+/);
  assert.doesNotMatch(html, /\bconst\s+\w+Engine\b/);
  assert.doesNotMatch(html, /document\.addEventListener/);
  assert.doesNotMatch(html, /window\.addEventListener/);
  assert.doesNotMatch(html, /\bhandleAction\b/);
  assert.doesNotMatch(html, /\binit[A-Z]\w*\b/);
});

test('designer shell keeps DOM ownership tags and host-vs-panel width contract', () => {
  const html = fs.readFileSync(SHELL_HTML_PATH, 'utf8');
  const layoutCss = fs.readFileSync(path.join(ROOT, 'designer/styles/layout.css'), 'utf8');
  const panelsCss = fs.readFileSync(path.join(ROOT, 'designer/styles/panels.css'), 'utf8');

  const ownerTags = [...html.matchAll(/data-dom-owner="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(ownerTags, [
    'designer-shell',
    'designer-layout',
    'designer-left-panel',
    'designer-canvas-area',
    'designer-workspace',
    'designer-right-panel',
  ]);

  assert.match(html, /<div id="app"[^>]*data-dom-owner="designer-shell"/);
  assert.match(html, /<div id="main-area"[^>]*data-dom-owner="designer-layout"/);
  assert.match(html, /<div id="panel-left"[^>]*data-dom-owner="designer-left-panel"/);
  assert.match(html, /<div id="canvas-area"[^>]*data-dom-owner="designer-canvas-area"/);
  assert.match(html, /<div id="workspace"[^>]*data-dom-owner="designer-workspace"/);
  assert.match(html, /<div id="panel-right"[^>]*data-dom-owner="designer-right-panel"/);

  assert.match(layoutCss, /#app\s*\{[\s\S]*inline-size:\s*100vi;/);
  assert.match(layoutCss, /#main-area\s*\{[\s\S]*grid-template-columns:\s*var\(--rf-panel-l\)\s+1fr\s+var\(--rf-panel-r\);/);
  assert.match(layoutCss, /#canvas-area\s*\{[\s\S]*min-inline-size:\s*0;/);
  assert.match(panelsCss, /#panel-left\s*\{[\s\S]*inline-size:\s*var\(--rf-panel-l\);[\s\S]*min-inline-size:\s*var\(--rf-panel-l\);/);
  assert.match(panelsCss, /#panel-right\s*\{[\s\S]*inline-size:\s*var\(--rf-panel-r\);[\s\S]*min-inline-size:\s*var\(--rf-panel-r\);/);
});

test('monolith shell keeps CSS externalized and below shell-size thresholds', () => {
  const html = fs.readFileSync(SHELL_HTML_PATH, 'utf8');
  const styleTagCount = countMatches(html, /<style\b/g);
  const inlineStyleAttrCount = countMatches(html, /\sstyle="/g);
  const stylesheetLinkCount = countMatches(html, /<link rel="stylesheet" href="\/designer\/styles\/index\.css">/g);

  assert.equal(styleTagCount, 0, 'monolith should not keep inline <style> blocks');
  assert.equal(inlineStyleAttrCount, 0, 'monolith should not keep inline style= attributes');
  assert.equal(stylesheetLinkCount, 1, 'monolith should load the canonical CSS entrypoint exactly once');
  assert.ok(Buffer.byteLength(html, 'utf8') <= SHELL_MAX_BYTES, `monolith shell exceeded ${SHELL_MAX_BYTES} byte threshold`);

  const cssFiles = [
    'designer/styles/index.css',
    'designer/styles/reset.css',
    'designer/styles/tokens.css',
    'designer/styles/base.css',
    'designer/styles/layout.css',
    'designer/styles/chrome.css',
    'designer/styles/canvas.css',
    'designer/styles/elements-selection.css',
    'designer/styles/panels.css',
    'designer/styles/menus.css',
    'designer/styles/components.css',
    'designer/styles/utilities.css',
    'designer/styles/themes.css',
    'designer/styles/overrides.css',
  ];

  for (const relPath of cssFiles) {
    assert.ok(fs.existsSync(path.join(ROOT, relPath)), `${relPath} missing`);
  }
});

test('designer shell layout order is stable and guarded against drift', () => {
  const html = fs.readFileSync(SHELL_HTML_PATH, 'utf8');
  const mainAreaStart = html.indexOf('<div id="main-area"');
  const mainAreaEnd = html.indexOf('</div><!-- /main-area -->');
  assert.ok(mainAreaStart >= 0 && mainAreaEnd > mainAreaStart, 'main area block missing');

  const mainArea = html.slice(mainAreaStart, mainAreaEnd);
  const leftIndex = mainArea.indexOf('<div id="panel-left"');
  const canvasIndex = mainArea.indexOf('<div id="canvas-area"');
  const rightIndex = mainArea.indexOf('<div id="panel-right"');

  assert.ok(leftIndex >= 0, 'panel-left missing from main area');
  assert.ok(canvasIndex > leftIndex, 'canvas-area should follow panel-left');
  assert.ok(rightIndex > canvasIndex, 'panel-right should follow canvas-area');
  assert.match(mainArea, /<div id="canvas-area"[^>]*>\s*<div id="ruler-h-row">[\s\S]*<div id="workspace"[^>]*data-dom-owner="designer-workspace"/);
});

test('writer conflict log persists active owner boundaries', () => {
  const logPath = path.join(ROOT, 'docs/architecture/writer-conflict-log.md');
  assert.ok(fs.existsSync(logPath), 'writer conflict log missing');
  const log = fs.readFileSync(logPath, 'utf8');
  assert.match(log, /# Writer Conflict Log/);
  assert.match(log, /CSS bleed/);
  assert.match(log, /Host width/);
  assert.match(log, /Left panel width/);
  assert.match(log, /Canvas host width/);
  assert.match(log, /Right panel width/);
  assert.match(log, /DOM ownership/);
  assert.match(log, /Command dispatch/);
});

test('runtime boundary modules use RuntimeServices instead of raw structural globals', () => {
  const files = [
    path.join(ROOT, 'engines/RuntimeBootstrap.js'),
    path.join(ROOT, 'engines/GlobalEventHandlers.js'),
    path.join(ROOT, 'engines/EngineCore.js'),
    path.join(ROOT, 'engines/DeferredBootstrap.js'),
    path.join(ROOT, 'engines/SectionEngine.js'),
    path.join(ROOT, 'engines/ZoomEngine.js'),
  ];

  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(src, /window\.__RF_CANONICAL_/,
      `${path.basename(file)} should not write canonical owner globals directly`);
    assert.doesNotMatch(src, /window\.RF_USE_ENGINECORE_INTERACTION/,
      `${path.basename(file)} should not read interaction flag directly from window`);
    assert.doesNotMatch(src, /window\.RFContractGuards/,
      `${path.basename(file)} should not read contract guards directly from window`);
    assert.doesNotMatch(src, /window\.RF_DEBUG_FLAGS/,
      `${path.basename(file)} should not read debug flags directly from window`);
    assert.doesNotMatch(src, /window\.__rfCommandRegistry/,
      `${path.basename(file)} should not write command registry directly to window`);
    assert.doesNotMatch(src, /window\._rfCanvas|window\._rfViewport|window\._rfWorkspace/,
      `${path.basename(file)} should not write DOM refs directly to window`);
  }

  assert.ok(fs.existsSync(path.join(ROOT, 'engines/RuntimeServices.js')), 'RuntimeServices.js missing');
  const html = fs.readFileSync(SHELL_HTML_PATH, 'utf8');
  assert.match(html, /<script src="\/engines\/RuntimeServices\.js"><\/script>/);
});

test('engine globals are reduced to the approved window export whitelist', () => {
  const files = [
    path.join(ROOT, 'engines/RuntimeGlobals.js'),
    path.join(ROOT, 'engines/DeferredBootstrap.js'),
    path.join(ROOT, 'engines/FormulaAndDebug.js'),
    path.join(ROOT, 'engines/DocTypeAndProbes.js'),
    path.join(ROOT, 'engines/SnapEngine.js'),
    path.join(ROOT, 'engines/GridEngine.js'),
    path.join(ROOT, 'engines/RulerEngine.js'),
    path.join(ROOT, 'engines/WorkspaceScrollEngine.js'),
  ];

  const actual = new Set();
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    for (const name of collectWindowWrites(src)) actual.add(name);
  }

  assert.deepEqual([...actual].sort(), ALLOWED_WINDOW_EXPORTS, 'window export whitelist drifted');

  const prohibited = [
    'window.SelectionEngine =',
    'window.AlignEngine =',
    'window.AlignmentGuides =',
    'window.SectionEngine =',
    'window.SectionResizeEngine =',
    'window.InsertEngine =',
    'window.OverlayEngine =',
    'window.PropertiesEngine =',
    'window.FormatEngine =',
    'window.FieldExplorerEngine =',
    'window.DesignZoomEngine =',
    'window.PreviewZoomEngine =',
    'window.ZoomWidget =',
    'window.ZoomEngine =',
    'window.ZoomEngineV19 =',
    'window.LayoutEngine =',
    'window._canonicalCanvasWriter =',
    'window._canonicalPreviewWriter =',
  ];

  const engineFiles = [
    path.join(ROOT, 'engines/SelectionEngine.js'),
    path.join(ROOT, 'engines/SectionEngine.js'),
    path.join(ROOT, 'engines/SectionResizeEngine.js'),
    path.join(ROOT, 'engines/InsertEngine.js'),
    path.join(ROOT, 'engines/OverlayEngine.js'),
    path.join(ROOT, 'engines/PropertiesEngine.js'),
    path.join(ROOT, 'engines/FormatEngine.js'),
    path.join(ROOT, 'engines/FieldExplorerEngine.js'),
    path.join(ROOT, 'engines/ZoomEngine.js'),
  ];

  for (const file of engineFiles) {
    const src = fs.readFileSync(file, 'utf8');
    for (const needle of prohibited) {
      assert.doesNotMatch(src, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
        `${path.basename(file)} reintroduced prohibited window export: ${needle}`);
    }
  }
});

test('layering rules: adapters stay thin and bootstrap stays orchestration-only', () => {
  const uiAdapters = fs.readFileSync(path.join(ROOT, 'engines/UIAdapters.js'), 'utf8');
  const globalHandlers = fs.readFileSync(path.join(ROOT, 'engines/GlobalEventHandlers.js'), 'utf8');
  const runtimeBootstrap = fs.readFileSync(path.join(ROOT, 'engines/RuntimeBootstrap.js'), 'utf8');
  const commandRuntime = fs.readFileSync(path.join(ROOT, 'engines/CommandRuntime.js'), 'utf8');

  assert.doesNotMatch(uiAdapters, /\bDS\./, 'UIAdapters must not access DS directly');
  assert.doesNotMatch(uiAdapters, /\bsaveHistory\b/, 'UIAdapters must not mutate history');
  assert.doesNotMatch(uiAdapters, /_canonicalCanvasWriter/, 'UIAdapters must not write canvas directly');

  assert.doesNotMatch(runtimeBootstrap, /\bhandleAction\s*\(/, 'RuntimeBootstrap must not dispatch commands directly');
  assert.doesNotMatch(runtimeBootstrap, /\bhandleFormatAction\s*\(/, 'RuntimeBootstrap must not absorb UI command logic');
  assert.doesNotMatch(runtimeBootstrap, /querySelectorAll\('\[data-action\]'\)/, 'RuntimeBootstrap must not wire toolbar commands');
  assert.doesNotMatch(runtimeBootstrap, /querySelectorAll\('\[data-format\]'\)/, 'RuntimeBootstrap must not wire format controls');

  assert.doesNotMatch(commandRuntime, /querySelectorAll\('\[data-action\]'\)/, 'CommandRuntime must not wire DOM directly');
  assert.doesNotMatch(commandRuntime, /addEventListener\('click'/, 'CommandRuntime must not own click bindings');

  assert.match(globalHandlers, /\bDS\./, 'GlobalEventHandlers remains the root input adapter');
});

test('command runtime split stays modular, thin, and contract-stable', () => {
  const files = {
    'engines/CommandRuntime.js': 80,
    'engines/CommandRuntimeShared.js': 80,
    'engines/CommandRuntimeSelection.js': 420,
    'engines/CommandRuntimeView.js': 140,
    'engines/CommandRuntimeSections.js': 220,
    'engines/CommandRuntimeFile.js': 220,
    'engines/CommandRuntimeDocType.js': 260,
    'engines/CommandRuntimeHandlers.js': 240,
    'engines/CommandRuntimeInit.js': 80,
  };

  for (const [relPath, maxLines] of Object.entries(files)) {
    const source = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
    assert.ok(source.split('\n').length <= maxLines, `${relPath} should stay <= ${maxLines} lines`);
  }

  const main = fs.readFileSync(path.join(ROOT, 'engines/CommandRuntime.js'), 'utf8');
  const shared = fs.readFileSync(path.join(ROOT, 'engines/CommandRuntimeShared.js'), 'utf8');
  const selection = fs.readFileSync(path.join(ROOT, 'engines/CommandRuntimeSelection.js'), 'utf8');
  const view = fs.readFileSync(path.join(ROOT, 'engines/CommandRuntimeView.js'), 'utf8');
  const sections = fs.readFileSync(path.join(ROOT, 'engines/CommandRuntimeSections.js'), 'utf8');
  const file = fs.readFileSync(path.join(ROOT, 'engines/CommandRuntimeFile.js'), 'utf8');
  const docType = fs.readFileSync(path.join(ROOT, 'engines/CommandRuntimeDocType.js'), 'utf8');
  const handlers = fs.readFileSync(path.join(ROOT, 'engines/CommandRuntimeHandlers.js'), 'utf8');
  const init = fs.readFileSync(path.join(ROOT, 'engines/CommandRuntimeInit.js'), 'utf8');

  assert.match(main, /Object\.assign\(/);
  assert.doesNotMatch(main, /\bfunction\s+handleAction\s*\(/);
  assert.doesNotMatch(main, /\bfunction\s+copy\s*\(/);
  assert.match(shared, /function setStatus\(/);
  assert.match(selection, /function copy\(/);
  assert.match(selection, /function selectAll\(/);
  assert.match(view, /function zoomFitPage\(/);
  assert.match(sections, /function insertSection\(/);
  assert.match(file, /function exportJSON\(/);
  assert.match(docType, /function switchDocType\(/);
  assert.match(handlers, /function handleAction\(/);
  assert.match(init, /function initCommandRuntimeState\(/);
});

test('render scheduler split stays modular, thin, and contract-stable', () => {
  const files = {
    'engines/RenderScheduler.js': 40,
    'engines/RenderSchedulerState.js': 140,
    'engines/RenderSchedulerFrame.js': 260,
    'engines/RenderSchedulerQueue.js': 120,
    'engines/RenderSchedulerScope.js': 80,
  };

  for (const [relPath, maxLines] of Object.entries(files)) {
    const source = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
    assert.ok(source.split('\n').length <= maxLines, `${relPath} should stay <= ${maxLines} lines`);
  }

  const main = fs.readFileSync(path.join(ROOT, 'engines/RenderScheduler.js'), 'utf8');
  const state = fs.readFileSync(path.join(ROOT, 'engines/RenderSchedulerState.js'), 'utf8');
  const frame = fs.readFileSync(path.join(ROOT, 'engines/RenderSchedulerFrame.js'), 'utf8');
  const queue = fs.readFileSync(path.join(ROOT, 'engines/RenderSchedulerQueue.js'), 'utf8');
  const scope = fs.readFileSync(path.join(ROOT, 'engines/RenderSchedulerScope.js'), 'utf8');

  assert.match(main, /const RenderScheduler = \(\(\) => \{/);
  assert.doesNotMatch(main, /\bfunction _flush\b/);
  assert.doesNotMatch(main, /\bfunction schedule\b/);
  assert.match(state, /const PRIORITY =/);
  assert.match(state, /function _trace\(/);
  assert.match(frame, /function _flush\(/);
  assert.match(frame, /function _runStableFrameInvariants\(/);
  assert.match(queue, /function schedule\(/);
  assert.match(queue, /function invalidateLayer\(/);
  assert.match(scope, /function flushSync\(/);
  assert.match(scope, /function assertDomWriteAllowed\(/);
});

test('canvas layout split stays modular, thin, and contract-stable', () => {
  const files = {
    'engines/CanvasLayoutEngine.js': 40,
    'engines/CanvasLayoutContracts.js': 60,
    'engines/CanvasLayoutSize.js': 220,
    'engines/CanvasLayoutElements.js': 260,
  };

  for (const [relPath, maxLines] of Object.entries(files)) {
    const source = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
    assert.ok(source.split('\n').length <= maxLines, `${relPath} should stay <= ${maxLines} lines`);
  }

  const main = fs.readFileSync(path.join(ROOT, 'engines/CanvasLayoutEngine.js'), 'utf8');
  const contracts = fs.readFileSync(path.join(ROOT, 'engines/CanvasLayoutContracts.js'), 'utf8');
  const size = fs.readFileSync(path.join(ROOT, 'engines/CanvasLayoutSize.js'), 'utf8');
  const elements = fs.readFileSync(path.join(ROOT, 'engines/CanvasLayoutElements.js'), 'utf8');

  assert.match(main, /const CanvasLayoutEngine = \(\(\) => \{/);
  assert.doesNotMatch(main, /\bfunction buildElementDiv\b/);
  assert.doesNotMatch(main, /\bfunction renderAll\b/);
  assert.match(contracts, /function _assertSelectionState\(/);
  assert.match(size, /function updateSync\(/);
  assert.match(size, /function getLayoutContract\(/);
  assert.match(elements, /function buildElementDiv\(/);
  assert.match(elements, /function renderAll\(/);
});

test('preview engine split stays modular, thin, and contract-stable', () => {
  const files = {
    'engines/PreviewEngine.js': 40,
    'engines/PreviewEngineContracts.js': 80,
    'engines/PreviewEngineData.js': 320,
    'engines/PreviewEngineMode.js': 140,
    'engines/PreviewEngineRenderer.js': 140,
  };

  for (const [relPath, maxLines] of Object.entries(files)) {
    const source = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
    assert.ok(source.split('\n').length <= maxLines, `${relPath} should stay <= ${maxLines} lines`);
  }

  const main = fs.readFileSync(path.join(ROOT, 'engines/PreviewEngine.js'), 'utf8');
  const contracts = fs.readFileSync(path.join(ROOT, 'engines/PreviewEngineContracts.js'), 'utf8');
  const data = fs.readFileSync(path.join(ROOT, 'engines/PreviewEngineData.js'), 'utf8');
  const mode = fs.readFileSync(path.join(ROOT, 'engines/PreviewEngineMode.js'), 'utf8');
  const renderer = fs.readFileSync(path.join(ROOT, 'engines/PreviewEngineRenderer.js'), 'utf8');

  assert.match(main, /const PreviewEngineV19 = \(\(\) => \(/);
  assert.match(main, /_renderWithData/);
  assert.doesNotMatch(main, /\bfunction show\(/);
  assert.match(contracts, /function assertPreviewDomContract\(/);
  assert.match(data, /function renderWithData\(/);
  assert.match(data, /function renderInstanceElement\(/);
  assert.match(mode, /function show\(/);
  assert.match(mode, /function hide\(/);
  assert.match(renderer, /function refresh\(/);
  assert.match(renderer, /preview-content/);
});

test('critical boundary files stay below growth thresholds', () => {
  const thresholds = new Map([
    [path.join(ROOT, 'designer/crystal-reports-designer-v4.html'), SHELL_MAX_BYTES],
    [path.join(ROOT, 'engines/RuntimeBootstrap.js'), 12_000],
    [path.join(ROOT, 'engines/UIAdapters.js'), 3_000],
    [path.join(ROOT, 'engines/CommandRuntime.js'), 4_000],
    [path.join(ROOT, 'engines/CommandRuntimeShared.js'), 3_000],
    [path.join(ROOT, 'engines/CommandRuntimeSelection.js'), 14_000],
    [path.join(ROOT, 'engines/CommandRuntimeView.js'), 3_000],
    [path.join(ROOT, 'engines/CommandRuntimeSections.js'), 6_000],
    [path.join(ROOT, 'engines/CommandRuntimeFile.js'), 4_000],
    [path.join(ROOT, 'engines/CommandRuntimeDocType.js'), 6_000],
    [path.join(ROOT, 'engines/CommandRuntimeHandlers.js'), 9_000],
    [path.join(ROOT, 'engines/CommandRuntimeInit.js'), 2_000],
    [path.join(ROOT, 'engines/RenderScheduler.js'), 2_000],
    [path.join(ROOT, 'engines/RenderSchedulerState.js'), 5_000],
    [path.join(ROOT, 'engines/RenderSchedulerFrame.js'), 10_000],
    [path.join(ROOT, 'engines/RenderSchedulerQueue.js'), 4_000],
    [path.join(ROOT, 'engines/RenderSchedulerScope.js'), 2_500],
    [path.join(ROOT, 'engines/CanvasLayoutEngine.js'), 2_000],
    [path.join(ROOT, 'engines/CanvasLayoutContracts.js'), 3_000],
    [path.join(ROOT, 'engines/CanvasLayoutSize.js'), 8_000],
    [path.join(ROOT, 'engines/CanvasLayoutElements.js'), 12_000],
    [path.join(ROOT, 'engines/PreviewEngine.js'), 2_000],
    [path.join(ROOT, 'engines/PreviewEngineContracts.js'), 3_500],
    [path.join(ROOT, 'engines/PreviewEngineData.js'), 18_000],
    [path.join(ROOT, 'engines/PreviewEngineMode.js'), 4_000],
    [path.join(ROOT, 'engines/PreviewEngineRenderer.js'), 4_000],
    [path.join(ROOT, 'engines/SelectionEngine.js'), 3_000],
    [path.join(ROOT, 'engines/SelectionEngineContracts.js'), 3_500],
    [path.join(ROOT, 'engines/SelectionState.js'), 4_000],
    [path.join(ROOT, 'engines/SelectionHitTest.js'), 4_000],
    [path.join(ROOT, 'engines/SelectionGeometry.js'), 5_000],
    [path.join(ROOT, 'engines/SelectionOverlay.js'), 9_000],
    [path.join(ROOT, 'engines/SelectionInteraction.js'), 12_000],
    [path.join(ROOT, 'engines/AlignEngine.js'), 3_500],
    [path.join(ROOT, 'engines/AlignmentGuides.js'), 6_000],
    [path.join(ROOT, 'engines/GeometryCore.js'), 6_500],
    [path.join(ROOT, 'engines/CanvasGeometry.js'), 4_500],
    [path.join(ROOT, 'engines/HitTestGeometry.js'), 4_500],
    [path.join(ROOT, 'reportforge/tests/governance_guardrails.test.mjs'), 45_000],
  ]);

  for (const [file, limit] of thresholds.entries()) {
    const size = Buffer.byteLength(fs.readFileSync(file, 'utf8'), 'utf8');
    assert.ok(size <= limit, `${path.basename(file)} exceeded ${limit} bytes (actual ${size})`);
  }
});

test('canonical runtime files do not reference retired bridge implementations', () => {
  const files = [
    path.join(ROOT, 'designer/crystal-reports-designer-v4.html'),
    path.join(ROOT, 'engines/EngineCore.js'),
    path.join(ROOT, 'engines/SelectionEngine.js'),
    path.join(ROOT, 'engines/HistoryEngine.js'),
    path.join(ROOT, 'engines/ClipboardEngine.js'),
    path.join(ROOT, 'engines/PreviewEngine.js'),
  ];
  for (const file of files) {
    const src = normalizeForScan(fs.readFileSync(file, 'utf8'));
    assert.doesNotMatch(src, retiredEngineRegex(['Canvas', 'EngineV19']), `${path.basename(file)} still references retired canvas engine`);
    assert.doesNotMatch(src, retiredEngineRegex(['Preview', 'EngineV19', 'Full']), `${path.basename(file)} still references retired preview engine`);
    assert.doesNotMatch(src, retiredEngineRegex(['Selection', 'EngineV19', 'Full']), `${path.basename(file)} still references retired selection engine`);
    assert.doesNotMatch(src, /\.rf-el\b/, `${path.basename(file)} still references rf-el alias`);
    assert.doesNotMatch(src, /\bpv-origin-selected\b/, `${path.basename(file)} still references preview legacy selection class`);
  }
});

test('critical engine style.cssText usage stays frozen at approved baseline', () => {
  const expectations = new Map([
    [path.join(ROOT, 'engines/SelectionEngine.js'), 1],
    [path.join(ROOT, 'engines/CanvasLayoutEngine.js'), 0],
    [path.join(ROOT, 'engines/CanvasLayoutElements.js'), 1],
    [path.join(ROOT, 'engines/PreviewEngine.js'), 0],
    [path.join(ROOT, 'engines/EngineCore.js'), 0],
  ]);

  for (const [file, expectedCount] of expectations.entries()) {
    const src = fs.readFileSync(file, 'utf8');
    const actualCount = countMatches(src, /style\.cssText/g);
    assert.equal(actualCount, expectedCount, `${path.basename(file)} style.cssText count changed`);
  }
});

test('selection split stays modular, thin, and contract-stable', () => {
  const files = [
    'engines/SelectionEngine.js',
    'engines/SelectionEngineContracts.js',
    'engines/SelectionState.js',
    'engines/SelectionHitTest.js',
    'engines/SelectionGeometry.js',
    'engines/SelectionOverlay.js',
    'engines/SelectionInteraction.js',
    'engines/AlignEngine.js',
    'engines/AlignmentGuides.js',
  ];
  for (const rel of files) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.ok(src.split('\n').length <= 300, `${rel} should stay <= 300 lines`);
  }
  const facade = fs.readFileSync(path.join(ROOT, 'engines/SelectionEngine.js'), 'utf8');
  assert.match(facade, /assertSelectionState/);
  assert.match(facade, /assertLayoutContract/);
  assert.match(facade, /assertRectShape/);
  assert.match(facade, /assertZoomContract/);
  assert.match(facade, /DS\.selection/);
  assert.match(facade, /DS\.zoom/);
  assert.match(facade, /DS\.getElementById/);
  assert.match(facade, /style\.cssText/);
  assert.match(facade, /SelectionOverlay/);
  assert.match(facade, /SelectionInteraction/);
  assert.match(facade, /SelectionGeometry/);
  assert.match(facade, /SelectionHitTest/);
  assert.match(facade, /SelectionState/);
});

test('geometry split stays modular, thin, and contract-stable', () => {
  const files = [
    'engines/GeometryCore.js',
    'engines/CanvasGeometry.js',
    'engines/SelectionGeometry.js',
    'engines/HitTestGeometry.js',
  ];
  for (const rel of files) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.ok(src.split('\n').length <= 300, `${rel} should stay <= 300 lines`);
    assert.doesNotMatch(src, /\bdocument\b/, `${rel} should not reference document`);
    assert.doesNotMatch(src, /\bwindow\b/, `${rel} should not reference window`);
  }
  const core = fs.readFileSync(path.join(ROOT, 'engines/GeometryCore.js'), 'utf8');
  assert.doesNotMatch(core, /\bDS\b/);
  assert.doesNotMatch(core, /\bRenderScheduler\b/);
  assert.doesNotMatch(core, /\bSelectionOverlay\b/);
  assert.match(core, /function makeRect\(/);
  assert.match(core, /function rectUnion\(/);
  assert.match(core, /function resizeRectFromHandle\(/);
});

test('governance assets exist and include strict architectural checklist', () => {
  const prTemplatePath = path.join(ROOT, '.github/PULL_REQUEST_TEMPLATE.md');
  const workflowPath = path.join(ROOT, '.github/workflows/architecture-governance.yml');
  const readmePath = path.join(ROOT, 'README.md');

  assert.ok(fs.existsSync(prTemplatePath), 'PR template missing');
  assert.ok(fs.existsSync(workflowPath), 'CI workflow missing');
  assert.ok(fs.existsSync(readmePath), 'README missing');

  const prTemplate = fs.readFileSync(prTemplatePath, 'utf8');
  const workflow = fs.readFileSync(workflowPath, 'utf8');
  const readme = fs.readFileSync(readmePath, 'utf8');

  for (const needle of [
    'no nuevos writers',
    'no nuevos owners',
    'no bypass del scheduler',
    'no estado fuera de DS',
    'no contratos ambiguos',
    'tests pasan (runtime + contracts + governance)',
    'no uso de APIs legacy',
  ]) {
    assert.match(prTemplate, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.match(workflow, /test:contracts/);
  assert.match(workflow, /test:runtime/);
  assert.match(workflow, /test:governance/);

  assert.match(readme, /Architectural Definition of Done/);
});

test('doc registry stays modular and facade-thin', () => {
  const files = [
    'reportforge/core/render/doc_registry.py',
    'reportforge/core/render/doc_registry_shared.py',
    'reportforge/core/render/doc_registry_remision.py',
    'reportforge/core/render/doc_registry_nota_credito.py',
    'reportforge/core/render/doc_registry_retencion.py',
    'reportforge/core/render/doc_registry_liquidacion.py',
  ];

  for (const relPath of files) {
    assert.ok(fs.existsSync(path.join(ROOT, relPath)), `${relPath} missing`);
  }

  const main = fs.readFileSync(path.join(ROOT, 'reportforge/core/render/doc_registry.py'), 'utf8');
  assert.ok(main.split('\n').length <= 120, 'doc_registry.py should remain a thin facade');
  assert.match(main, /from \.doc_registry_remision import/);
  assert.match(main, /from \.doc_registry_nota_credito import/);
  assert.match(main, /from \.doc_registry_retencion import/);
  assert.match(main, /from \.doc_registry_liquidacion import/);
  assert.doesNotMatch(main, /\bdef _remision_layout_raw\b/);
  assert.doesNotMatch(main, /\bdef _nota_credito_layout_raw\b/);
  assert.doesNotMatch(main, /\bdef _retencion_layout_raw\b/);
  assert.doesNotMatch(main, /\bdef _liquidacion_layout_raw\b/);
});

test('advanced engine split stays modular, thin, and contract-stable', () => {
  const files = {
    'reportforge/core/render/engines/advanced_engine.py': 400,
    'reportforge/core/render/engines/html_engine.py': 300,
    'reportforge/core/render/engines/advanced_engine_shared.py': 80,
    'reportforge/core/render/engines/barcode_renderer.py': 160,
    'reportforge/core/render/engines/crosstab_renderer.py': 180,
    'reportforge/core/render/engines/element_renderers.py': 320,
  };

  for (const [relPath, maxLines] of Object.entries(files)) {
    const source = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
    assert.ok(source.split('\n').length <= maxLines, `${relPath} should stay <= ${maxLines} lines`);
  }

  const advanced = fs.readFileSync(path.join(ROOT, 'reportforge/core/render/engines/advanced_engine.py'), 'utf8');
  const html = fs.readFileSync(path.join(ROOT, 'reportforge/core/render/engines/html_engine.py'), 'utf8');
  const shared = fs.readFileSync(path.join(ROOT, 'reportforge/core/render/engines/advanced_engine_shared.py'), 'utf8');

  assert.match(advanced, /class AdvancedHtmlEngine/);
  assert.match(advanced, /def render_advanced\(/);
  assert.match(advanced, /def render_from_layout_file\(/);
  assert.match(advanced, /from \.element_renderers import calc_row_height, render_element/);
  assert.match(advanced, /from \.barcode_renderer import _render_barcode_svg, _svg_linear_barcode, _svg_qr_placeholder/);
  assert.match(html, /class HtmlEngine/);
  assert.match(shared, /_SPECIAL/);
  assert.match(shared, /_ROW_ODD/);
  assert.match(shared, /_ROW_EVEN/);
});

test('reportforge_server stays facade-thin and delegates route logic', () => {
  const files = [
    'reportforge_server.py',
    'reportforge_server_shared.py',
    'reportforge_server_designer.py',
    'reportforge_server_services.py',
    'reportforge_server_http_utils.py',
    'reportforge_server_route_health.py',
    'reportforge_server_route_favicon.py',
    'reportforge_server_route_designer.py',
    'reportforge_server_route_static.py',
    'reportforge_server_route_barcode.py',
    'reportforge_server_routes_preview.py',
    'reportforge_server_routes_render.py',
    'reportforge_server_routes_validate.py',
    'reportforge_server_datasources.py',
  ];
  for (const relPath of files) {
    assert.ok(fs.existsSync(path.join(ROOT, relPath)), `${relPath} missing`);
  }

  const main = fs.readFileSync(path.join(ROOT, 'reportforge_server.py'), 'utf8');
  const services = fs.readFileSync(path.join(ROOT, 'reportforge_server_services.py'), 'utf8');
  const preview = fs.readFileSync(path.join(ROOT, 'reportforge_server_routes_preview.py'), 'utf8');
  const render = fs.readFileSync(path.join(ROOT, 'reportforge_server_routes_render.py'), 'utf8');
  const validate = fs.readFileSync(path.join(ROOT, 'reportforge_server_routes_validate.py'), 'utf8');
  const datasources = fs.readFileSync(path.join(ROOT, 'reportforge_server_datasources.py'), 'utf8');
  const httpUtils = fs.readFileSync(path.join(ROOT, 'reportforge_server_http_utils.py'), 'utf8');
  const health = fs.readFileSync(path.join(ROOT, 'reportforge_server_route_health.py'), 'utf8');
  const favicon = fs.readFileSync(path.join(ROOT, 'reportforge_server_route_favicon.py'), 'utf8');
  const designer = fs.readFileSync(path.join(ROOT, 'reportforge_server_route_designer.py'), 'utf8');
  const statics = fs.readFileSync(path.join(ROOT, 'reportforge_server_route_static.py'), 'utf8');
  const barcode = fs.readFileSync(path.join(ROOT, 'reportforge_server_route_barcode.py'), 'utf8');

  assert.ok(main.split('\n').length <= 120, 'reportforge_server.py should remain a thin facade');
  assert.match(main, /from reportforge_server_services import handle_get, handle_options, handle_post/);
  assert.match(main, /class RFHandler/);
  assert.doesNotMatch(main, /\bdef _post_preview\b/);
  assert.doesNotMatch(main, /\bdef _validate_layout\b/);

  assert.ok(services.split('\n').length <= 120, 'reportforge_server_services.py should remain thin');
  assert.match(services, /def handle_get\(/);
  assert.match(services, /def handle_post\(/);

  assert.ok(preview.split('\n').length <= 60, 'reportforge_server_routes_preview.py should remain bounded');
  assert.ok(render.split('\n').length <= 180, 'reportforge_server_routes_render.py should remain bounded');
  assert.ok(validate.split('\n').length <= 220, 'reportforge_server_routes_validate.py should remain bounded');
  assert.ok(datasources.split('\n').length <= 80, 'reportforge_server_datasources.py should remain bounded');
  assert.ok(httpUtils.split('\n').length <= 80, 'reportforge_server_http_utils.py should remain bounded');
  assert.ok(health.split('\n').length <= 40, 'reportforge_server_route_health.py should remain bounded');
  assert.ok(favicon.split('\n').length <= 60, 'reportforge_server_route_favicon.py should remain bounded');
  assert.ok(designer.split('\n').length <= 60, 'reportforge_server_route_designer.py should remain bounded');
  assert.ok(statics.split('\n').length <= 60, 'reportforge_server_route_static.py should remain bounded');
  assert.ok(barcode.split('\n').length <= 80, 'reportforge_server_route_barcode.py should remain bounded');

  assert.match(preview, /def _post_preview\(/);
  assert.match(render, /def _post_render\(/);
  assert.match(validate, /def _post_validate_layout\(/);
  assert.match(validate, /def _post_validate_formula\(/);
  assert.match(datasources, /def _post_register_ds\(/);
  assert.match(datasources, /def _post_ds_query\(/);
  assert.match(httpUtils, /def _respond\(/);
  assert.match(httpUtils, /def _json\(/);
  assert.match(health, /def _get_health\(/);
  assert.match(favicon, /def _serve_favicon\(/);
  assert.match(designer, /def _serve_designer\(/);
  assert.match(statics, /def _serve_static\(/);
  assert.match(barcode, /def _get_barcode\(/);
  assert.match(barcode, /def _post_barcode\(/);
});

test('active bridges must not regress into HTML host', () => {
  const html = fs.readFileSync(SHELL_HTML_PATH, 'utf8');
  assert.doesNotMatch(html, /DesignZoomEngine\._apply/, 'zoom bridge must stay in DeferredBootstrap');
  assert.doesNotMatch(html, /DS\.saveHistory\s*=\s*function/, 'history patch must stay in DeferredBootstrap');
  const deferred = fs.readFileSync(path.join(ROOT, 'engines/DeferredBootstrap.js'), 'utf8');
  assert.match(deferred, /DesignZoomEngine\._apply/, 'DeferredBootstrap must own zoom bridge until RF-ARCH-008 is closed');
});
