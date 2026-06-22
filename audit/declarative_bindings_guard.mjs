#!/usr/bin/env node
'use strict';
/**
 * declarative_bindings_guard.mjs — Principle #13 Bindings Declarativos
 *
 * Enforces two invariants:
 *
 *   RULE-A: Every data-action value declared in the designer HTML must have a
 *   matching handler across the CommandRuntimeHandlers*.js family — either a
 *   `case 'X':` or a `'X': fn` / `X() {...}` entry inside an object literal
 *   passed to `dispatchActionMap(action, {...})`. An unhandled data-action is
 *   a silent no-op — the user clicks a button and nothing happens.
 *
 *   (P19B fix: the action dispatch architecture evolved from a single
 *   switch/case in CommandRuntimeHandlers.js into a per-domain family of
 *   files — CommandRuntimeHandlersFormat.js, ...SelectionDispatch.js, etc. —
 *   each calling dispatchActionMap() with an object-literal handler map. The
 *   guard only ever scanned CommandRuntimeHandlers.js for `case` syntax, so
 *   every action wired through the newer files was a false positive. Fixed
 *   by scanning the whole CommandRuntimeHandlers*.js family for both styles.)
 *
 *   RULE-B: No engine file outside the declared binding owners may wire a
 *   toolbar/tab/toolbar-input command using imperative getElementById + click/change.
 *   Binding owners are: UIAdapters.js, KeyboardBindings.js, GlobalEventHandlers.js,
 *   RuntimeBootstrap.js, DeferredBootstrap.js.
 *
 *   RULE-C: data-format values must NOT appear as data-action. Format actions
 *   (align-left, bold, etc.) are dispatched through handleFormatAction, not
 *   handleAction. Mixing the two attributes silences the command.
 *
 * Usage:
 *   node audit/declarative_bindings_guard.mjs          # full check
 *   node audit/declarative_bindings_guard.mjs --report # report only, no exit 1
 *
 * Exit codes:
 *   0 — no violations
 *   1 — violations found (unless --report)
 */

import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT    = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARGS    = process.argv.slice(2);
const REPORT  = ARGS.includes('--report');

const SHELL_HTML     = path.join(ROOT, 'designer/crystal-reports-designer-v4.html');
const ENGINES_DIR    = path.join(ROOT, 'engines');

// The action-dispatch family — CommandRuntimeHandlers.js plus every
// per-domain CommandRuntimeHandlers*.js file. Discovered dynamically (not
// hardcoded) so a future new domain file is picked up automatically instead
// of silently becoming a new blind spot, repeating the P19B root cause.
const HANDLER_FILES = fs.readdirSync(ENGINES_DIR)
  .filter(f => /^CommandRuntimeHandlers.*\.js$/.test(f))
  .map(f => path.join(ENGINES_DIR, f));

// Binding owner files — allowed to wire imperative event listeners for commands
const BINDING_OWNERS = new Set([
  'UIAdapters.js',
  'KeyboardBindings.js',
  'GlobalEventHandlers.js',
  'RuntimeBootstrap.js',
  'DeferredBootstrap.js',
  'DebugTraceToggle.js',    // debug UI — own internal bindings
  'DebugChannelsPanel.js',  // debug UI — own internal bindings
]);

// ── Extract data-action values from HTML ──────────────────────────────────────

function extractDataActions(html) {
  const actions = new Set();
  const re = /data-action="([^"]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) actions.add(m[1]);
  return actions;
}

function extractDataFormats(html) {
  const formats = new Set();
  const re = /data-format="([^"]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) formats.add(m[1]);
  return formats;
}

// ── Extract case labels from CommandRuntimeHandlers ──────────────────────────

function extractHandlerCases(src) {
  const cases = new Set();
  const re = /case\s+'([^']+)'\s*:/g;
  let m;
  while ((m = re.exec(src)) !== null) cases.add(m[1]);
  return cases;
}

// ── Extract action keys from dispatchActionMap(action, { ... }) calls ───────
//
// Handlers are declared as object-literal entries in one of three styles:
//   'quoted-key': fn            (string key, e.g. 'color-font': runColorFont)
//   bareKey: fn                 (identifier key, e.g. print: () => ...)
//   bareKey() { ... }           (ES6 method shorthand, e.g. undo() { ... })
// All entries observed in the codebase are one-per-line, so a balanced-brace
// extraction of the object literal followed by line-by-line key matching is
// sufficient — no need for a full JS parser.

function extractBalancedBraceBody(src, openBraceIdx) {
  let depth = 0;
  for (let i = openBraceIdx; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(openBraceIdx + 1, i);
    }
  }
  return src.slice(openBraceIdx + 1);
}

function extractDispatchMapKeys(src) {
  const keys = new Set();
  const callRe = /dispatchActionMap\s*\(\s*action\s*,\s*\{/g;
  let m;
  while ((m = callRe.exec(src)) !== null) {
    const openBraceIdx = src.indexOf('{', m.index);
    const body = extractBalancedBraceBody(src, openBraceIdx);
    for (const rawLine of body.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('//')) continue;
      const quoted = line.match(/^['"]([^'"]+)['"]\s*:/);
      if (quoted) { keys.add(quoted[1]); continue; }
      const bareKeyOrMethod = line.match(/^([A-Za-z_$][\w$]*)\s*[:(]/);
      if (bareKeyOrMethod) keys.add(bareKeyOrMethod[1]);
    }
  }
  return keys;
}

// ── Check for imperative command bindings in non-owner files ─────────────────

// Matches: getElementById('btn-X').addEventListener OR querySelector('#btn-X').addEventListener
// for toolbar/tab commands. Does NOT flag workspace/canvas/overlay bindings.
const IMPERATIVE_BINDING = /(?:getElementById|querySelector)\s*\(\s*['"`](?:#?(?:btn-|tab-|tb-)[^'"`]+)['"`]\s*\)\s*[?.]?\s*addEventListener\s*\(\s*['"`](?:click|change|input)['"`]/;

// ── Run ───────────────────────────────────────────────────────────────────────

const violations = [];

// Load sources
const html = fs.readFileSync(SHELL_HTML, 'utf8');

const htmlActions  = extractDataActions(html);
const htmlFormats  = extractDataFormats(html);

// RULE-A source of truth: union of case-style and dispatchActionMap-style
// handlers across the whole CommandRuntimeHandlers*.js family.
const handlerActions = new Set();
for (const file of HANDLER_FILES) {
  const src = fs.readFileSync(file, 'utf8');
  for (const k of extractHandlerCases(src)) handlerActions.add(k);
  for (const k of extractDispatchMapKeys(src)) handlerActions.add(k);
}

// RULE-A: data-action values with no handler case
for (const action of htmlActions) {
  if (!handlerActions.has(action)) {
    violations.push({
      rule: 'BIND-ACTION-001',
      desc: `data-action="${action}" in HTML has no handler in CommandRuntimeHandlers*.js — silent no-op`,
    });
  }
}

// RULE-C: data-format values mistakenly declared as data-action
for (const action of htmlActions) {
  if (htmlFormats.has(action)) {
    violations.push({
      rule: 'BIND-FORMAT-001',
      desc: `"${action}" appears as BOTH data-action and data-format — format actions must use data-format only`,
    });
  }
}

// RULE-B: imperative command bindings outside owner files
const engineFiles = fs.readdirSync(ENGINES_DIR).filter(f => f.endsWith('.js'));
for (const name of engineFiles) {
  if (BINDING_OWNERS.has(name)) continue;
  const src = fs.readFileSync(path.join(ENGINES_DIR, name), 'utf8');
  if (IMPERATIVE_BINDING.test(src)) {
    violations.push({
      rule: 'BIND-IMPERATIVE-001',
      desc: `${name}: imperative toolbar/tab event binding outside declared binding owners`,
    });
  }
}

// ── Report ────────────────────────────────────────────────────────────────────

console.log('── Declarative Bindings Guard (#13) ─────────────────────────');
console.log(`   data-action values in HTML: ${htmlActions.size}`);
console.log(`   handler actions found:      ${handlerActions.size} (across ${HANDLER_FILES.length} CommandRuntimeHandlers*.js files)`);
console.log(`   violations:                 ${violations.length}`);

if (violations.length > 0) {
  console.error('\n  Violations:');
  for (const v of violations) {
    console.error(`  [${v.rule}] ${v.desc}`);
  }
}

if (violations.length === 0) {
  console.log('\n✅ all data-action values handled; no imperative binding leaks\n');
  process.exit(0);
}

console.error('\n❌ declarative binding violations — commands may be silently dropped');
console.error('   Principle #13: Bindings Declarativos.\n');
if (!REPORT) process.exit(1);
