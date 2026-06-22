'use strict';
/**
 * subsystem_ownership_map_inline_trace.test.mjs — P31D
 *
 * P31C reclaimed 24 previously-orphan engines/*.js files into 8 subsystems'
 * allowedFiles (evidence-based: each confirmed <script>-loaded in
 * designer-v4.html with a real consumer). That closed
 * subsystem_ownership_guard.mjs's RULE-ORPHAN, but left the *why* only in
 * the conversation/diff, not inline in the map itself.
 *
 * This locks in that every reclaimed file's real consumer is named in its
 * subsystem's own `notes` field — so a future reader of
 * subsystem_ownership_map.json alone (no git archaeology needed) can see
 * why each file belongs where it was placed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const MAP = JSON.parse(fs.readFileSync(resolve(ROOT, 'audit/subsystem_ownership_map.json'), 'utf8'));

const RECLAIMED_BY_SUBSYSTEM = {
  'SS-01': ['DocumentActionsSelection.js', 'DocumentStoreUtils.js'],
  'SS-06': ['SelectionEnginePreviewBridge.js', 'SelectionOverlayPreview.js', 'SelectionOverlayRender.js'],
  'SS-07': ['PreviewEngineRendererLayout.js'],
  'SS-18': ['EngineCoreContractAsserts.js', 'EngineCoreContractSnapshots.js', 'EngineCoreContractValidators.js'],
  'SS-19': ['BuildDebugPanel.js', 'DebugHudLayout.js', 'DebugPanelGeometry.js', 'RFAudit.js'],
  'SS-26': ['EngineCoreRoutingPointerHelpers.js'],
  'SS-30': ['CommandRuntimeFileIO.js'],
  'SS-31': [
    'CommandRuntimeHandlersDialog.js', 'CommandRuntimeHandlersFile.js', 'CommandRuntimeHandlersFormat.js',
    'CommandRuntimeHandlersInsert.js', 'CommandRuntimeHandlersLayout.js', 'CommandRuntimeHandlersPreview.js',
    'CommandRuntimeHandlersSelectionDispatch.js', 'CommandRuntimeHandlersSystem.js', 'CommandRuntimeHandlersZoom.js',
  ],
};

function subsystem(id) {
  const ss = MAP.subsystems.find((s) => s.id === id);
  assert.ok(ss, `subsystem ${id} must exist in the map`);
  return ss;
}

for (const [id, files] of Object.entries(RECLAIMED_BY_SUBSYSTEM)) {
  test(`${id} — allowedFiles includes every P31C-reclaimed file`, () => {
    const ss = subsystem(id);
    for (const f of files) {
      assert.ok(ss.allowedFiles.includes(f), `${id}.allowedFiles must include ${f}`);
    }
  });

  test(`${id} — notes names the real consumer for every P31C-reclaimed file (inline traceability)`, () => {
    const ss = subsystem(id);
    for (const f of files) {
      assert.ok(
        ss.notes.includes(f),
        `${id}.notes must mention ${f} — inline traceability, not just an allowedFiles entry`
      );
    }
  });
}

test('REAL REPO — every reclaimed file across all 8 subsystems totals exactly 24', () => {
  const total = Object.values(RECLAIMED_BY_SUBSYSTEM).reduce((n, arr) => n + arr.length, 0);
  assert.equal(total, 24);
});

test('REAL REPO — no reclaimed file is duplicated across two subsystems (RULE-OVERLAP precondition)', () => {
  const seen = new Set();
  for (const files of Object.values(RECLAIMED_BY_SUBSYSTEM)) {
    for (const f of files) {
      assert.equal(seen.has(f), false, `${f} must not be claimed by more than one subsystem`);
      seen.add(f);
    }
  }
});
