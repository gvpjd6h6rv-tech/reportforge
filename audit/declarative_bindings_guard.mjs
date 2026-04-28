#!/usr/bin/env node
'use strict';
/**
 * declarative_bindings_guard.mjs — Principle #13 Bindings Declarativos
 *
 * Enforces two invariants:
 *
 *   RULE-A: Every data-action value declared in the designer HTML must have a
 *   matching `case 'X':` in CommandRuntimeHandlers.js. An unhandled data-action
 *   is a silent no-op — the user clicks a button and nothing happens.
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
const HANDLER_JS     = path.join(ROOT, 'engines/CommandRuntimeHandlers.js');
const ENGINES_DIR    = path.join(ROOT, 'engines');

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

// ── Check for imperative command bindings in non-owner files ─────────────────

// Matches: getElementById('btn-X').addEventListener OR querySelector('#btn-X').addEventListener
// for toolbar/tab commands. Does NOT flag workspace/canvas/overlay bindings.
const IMPERATIVE_BINDING = /(?:getElementById|querySelector)\s*\(\s*['"`](?:#?(?:btn-|tab-|tb-)[^'"`]+)['"`]\s*\)\s*[?.]?\s*addEventListener\s*\(\s*['"`](?:click|change|input)['"`]/;

// ── Run ───────────────────────────────────────────────────────────────────────

const violations = [];

// Load sources
const html        = fs.readFileSync(SHELL_HTML, 'utf8');
const handlerSrc  = fs.readFileSync(HANDLER_JS, 'utf8');

const htmlActions  = extractDataActions(html);
const htmlFormats  = extractDataFormats(html);
const handlerCases = extractHandlerCases(handlerSrc);

// RULE-A: data-action values with no handler case
for (const action of htmlActions) {
  if (!handlerCases.has(action)) {
    violations.push({
      rule: 'BIND-ACTION-001',
      desc: `data-action="${action}" in HTML has no case '${action}': in CommandRuntimeHandlers.js — silent no-op`,
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
console.log(`   handler cases found:        ${handlerCases.size}`);
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
