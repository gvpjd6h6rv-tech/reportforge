import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const CATEGORIES = [
  {
    key: 'architectural',
    files: [
      'docs/governance.md',
      'docs/architecture/invariants.md',
      'docs/architecture/reportforge-api-contract.md',
      'docs/architecture/datasource-package-contract.md',
      'docs/architecture/document-store-contract.md',
      'docs/architecture/engine-core-routing-contract.md',
      'reportforge/tests/governance_guardrails.test.mjs',
      'reportforge/tests/principles_enforcement.test.mjs',
      'audit/principles_matrix.json',
      'audit/principles_audit.mjs',
      'validate_repo.sh',
    ],
  },
  {
    key: 'behavioral',
    files: [
      'reportforge/tests/runtime_regression.test.mjs',
      'reportforge/tests/user_parity/fast_interaction_smoke_user_parity.test.mjs',
    ],
  },
  {
    key: 'causal',
    files: [
      'reportforge/tests/engine_contracts.test.mjs',
      'reportforge/tests/tanda5.test.mjs',
    ],
  },
  {
    key: 'conductual',
    files: [
      'reportforge/tests/user_parity/content_edit_smoke_user_parity.test.mjs',
      'reportforge/tests/user_parity/template_smoke_user_parity.test.mjs',
    ],
  },
  {
    key: 'functional',
    files: [
      'reportforge/tests/test_render_engine.py',
      'reportforge/tests/test_advanced_engine.py',
      'reportforge/tests/test_enterprise.py',
      'reportforge/tests/test_server.py',
    ],
  },
  {
    key: 'formula',
    files: [
      'reportforge/tests/test_formula_engine.py',
      'reportforge/tests/type_coercion_js.test.mjs',
    ],
  },
  {
    key: 'cr_functions',
    files: [
      'reportforge/tests/test_cr_functions.py',
      'docs/architecture/cr-functions-contract.md',
    ],
  },
  {
    key: 'datasource',
    files: [
      'reportforge/tests/test_phases_3_5.py',
      'docs/architecture/db-source-contract.md',
    ],
  },
  {
    key: 'all_gaps',
    files: [
      'docs/architecture/transformation-backlog.md',
      'docs/architecture/ownership-matrix.md',
      'docs/architecture/designer-host-split.md',
      'docs/architecture/writer-conflict-log.md',
      'docs/architecture/command-runtime-contract.md',
      'docs/architecture/render-scheduler-contract.md',
      'docs/architecture/canvas-layout-contract.md',
      'docs/architecture/preview-engine-contract.md',
      'docs/architecture/enterprise-engine-contract.md',
      'docs/architecture/selection-engine-contract.md',
      'docs/architecture/geometry-core-contract.md',
    ],
  },
  {
    key: 'geometric',
    files: [
      'reportforge/tests/geometry_core.test.mjs',
      'reportforge/tests/user_parity/multiselect_drag_user_parity.test.mjs',
      'reportforge/tests/user_parity/preview_clipping_user_parity.test.mjs',
      'reportforge/tests/user_parity/resize_smoke_user_parity.test.mjs',
    ],
  },
  {
    key: 'reparability',
    files: [
      'reportforge/tests/runtime_regression.test.mjs',
      'engines/EngineCore.js',
    ],
  },
  {
    key: 'race_conditions',
    files: [
      'reportforge/tests/race_conditions.test.mjs',
      'reportforge/tests/user_parity/fast_interaction_smoke_user_parity.test.mjs',
      'reportforge/tests/user_parity/flaky_detection_user_parity.test.mjs',
    ],
  },
  {
    key: 'network_latency',
    files: [
      'reportforge/tests/network_latency.test.py',
      'reportforge/tests/test_server.py',
      'reportforge/tests/runtime_harness.mjs',
    ],
  },
  {
    key: 'browser_specific',
    files: [
      'reportforge/tests/browser_compatibility.test.mjs',
      'reportforge/tests/user_parity/visual_golden_user_parity.test.mjs',
      'reportforge/tests/user_parity/selection_handle_stacking_user_parity.test.mjs',
    ],
  },
  {
    key: 'global_state_corruption',
    files: [
      'reportforge/tests/global_state_corruption.test.mjs',
      'engines/RuntimeGlobals.js',
      'engines/RuntimeServices.js',
      'engines/EngineCore.js',
    ],
  },
  {
    key: 'memory_leaks',
    files: [
      'reportforge/tests/memory_leak_detection.test.mjs',
      'reportforge/tests/user_parity/session_replay_user_parity.test.mjs',
      'reportforge/tests/user_parity/flaky_detection_user_parity.test.mjs',
    ],
  },
  {
    key: 'human_interactions',
    files: [
      'reportforge/tests/user_parity/undo_redo_mixed_history_user_parity.test.mjs',
      'reportforge/tests/user_parity/session_replay_user_parity.test.mjs',
    ],
  },
];

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

test('architecture matrix covers all required categories', () => {
  const keys = CATEGORIES.map((item) => item.key);
  assert.deepEqual(keys, [
    'architectural',
    'behavioral',
    'causal',
    'conductual',
    'functional',
    'formula',
    'cr_functions',
    'datasource',
    'all_gaps',
    'geometric',
    'reparability',
    'race_conditions',
    'network_latency',
    'browser_specific',
    'global_state_corruption',
    'memory_leaks',
    'human_interactions',
  ]);
});

test('architecture matrix references existing coverage files', () => {
  for (const category of CATEGORIES) {
    for (const file of category.files) {
      assert.ok(fs.existsSync(path.join(ROOT, file)), `${category.key}: missing ${file}`);
    }
  }
});

test('testing canon documents the category canon', () => {
  const canon = read('docs/architecture/testing-canon.md');
  for (const label of [
    'Architectural',
    'Behavioral',
    'Causal',
    'Conductual',
    'Functional',
    'CR Functions',
    'Datasource',
    'All Gaps',
    'Geometric',
    'Reparability',
    'Race conditions',
    'Network / latency',
    'Browser-specific',
    'Global state corruption',
    'Memory leaks',
    'Human unpredictability',
  ]) {
    assert.match(canon, new RegExp(label, 'i'), `canon missing ${label}`);
  }
});

test('runtime invariants are persisted as architecture docs', () => {
  const invariants = read('docs/architecture/invariants.md');
  for (const needle of [
    'One source of truth',
    'No inline runtime scripts or styles',
    'Scheduler-driven DOM writes only',
    'Safe mode and recovery must remain explicit and observable',
    'CR function families are separate owners',
    'Db datasource access is split by concern',
  ]) {
    assert.match(invariants, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  }
});

test('governance remains aligned with the zero-inline and zero-legacy policy', () => {
  const governance = read('docs/governance.md');
  for (const phrase of [
    'contiene `<script>` inline',
    'contiene `<style>` inline',
    'reintroduce `function`, `const *Engine`',
    'aparece un nuevo `window.* =` fuera de whitelist',
    'UIAdapters` toca `DS` directamente',
    'no JS inline en HTML',
    'no CSS inline en HTML',
  ]) {
    assert.match(governance, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  }
});
