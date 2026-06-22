'use strict';
/**
 * ssot_runtime_binding_guard.test.mjs — P29B guard #1
 *
 * A file claimed as owned/SSOT in audit/subsystem_ownership_map.json
 * (domain: designer-runtime) must be bound to something real: either loaded
 * by a real production HTML (<script src="/engines/X.js">) or referenced by
 * a real test under reportforge/tests/*.test.mjs. A file claimed as owned
 * but neither loaded nor tested is a paper claim, not a verified one.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  collectClaimedEngineFiles,
  collectHtmlScriptSrcs,
  collectTestReferencedFiles,
  findUnboundFiles,
} from '../../audit/ssot_runtime_binding_guard.mjs';

// ── pure-function unit tests (synthetic fixtures, no disk I/O) ─────────────

test('collectClaimedEngineFiles — unions sharedFiles with designer-runtime allowedFiles, skips backend-render', () => {
  const map = {
    sharedFiles: ['Shared.js'],
    subsystems: [
      { domain: 'designer-runtime', allowedFiles: ['A.js', 'B.js'] },
      { domain: 'backend-render', allowedFiles: ['ignored.py'] },
    ],
  };
  const claimed = collectClaimedEngineFiles(map);
  assert.deepEqual([...claimed].sort(), ['A.js', 'B.js', 'Shared.js']);
});

test('collectHtmlScriptSrcs — extracts /engines/X.js script src filenames', () => {
  const html = `<script src="/engines/A.js"></script><script src="/engines/B.js"></script><script src="/tools/x.js"></script>`;
  const srcs = collectHtmlScriptSrcs([html]);
  assert.deepEqual([...srcs].sort(), ['A.js', 'B.js']);
});

test('collectTestReferencedFiles — extracts engines/X.js path literals from test source', () => {
  const src = `const X = fs.readFileSync(resolve(ROOT, 'engines/A.js'), 'utf8');`;
  const refs = collectTestReferencedFiles([src]);
  assert.deepEqual([...refs], ['A.js']);
});

test('findUnboundFiles — flags a claimed file that is neither loaded nor tested', () => {
  const claimed = new Set(['A.js', 'B.js', 'C.js']);
  const loaded = new Set(['A.js']);
  const tested = new Set(['B.js']);
  const violations = findUnboundFiles(claimed, loaded, tested);
  assert.deepEqual(violations, ['C.js']);
});

test('findUnboundFiles — a file bound by either loading OR testing is not a violation', () => {
  const claimed = new Set(['A.js', 'B.js']);
  const loaded = new Set(['A.js']);
  const tested = new Set(['B.js']);
  assert.deepEqual(findUnboundFiles(claimed, loaded, tested), []);
});

test('findUnboundFiles — empty claimed set produces no violations', () => {
  assert.deepEqual(findUnboundFiles(new Set(), new Set(), new Set()), []);
});

// ── integration: real repo data ──────────────────────────────────────────

test('REAL REPO — KeyboardCombo.js is claimed but neither loaded by HTML nor referenced by any test (known gap, P29B)', () => {
  // This documents the guard's first real catch: audit/subsystem_ownership_map.json
  // claims KeyboardCombo.js is covered by reportforge/tests/keyboard_registry.test.mjs
  // (its existingTests field), but that test file only exercises KeyboardRegistry.js —
  // it never references KeyboardCombo.js at all. The claim is stale, so the guard
  // is EXPECTED to exit 1 against the real repo right now (honest FAIL, not a bug
  // in the guard).
  let output;
  try {
    output = execFileSync('node', ['audit/ssot_runtime_binding_guard.mjs'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
  } catch (err) {
    assert.equal(err.status, 1, 'guard must exit 1 when a real violation exists');
    output = err.stdout;
  }
  assert.match(output, /KeyboardCombo\.js/);
});
