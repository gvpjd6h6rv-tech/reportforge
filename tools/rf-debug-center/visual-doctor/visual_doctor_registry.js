import { collectVisualSnapshots } from './visual_snapshot_collector.js';
import { diffVisualBaseline } from './visual_baseline_diff.js';
import { VISUAL_COMPONENT_CATALOG } from './visual_component_catalog.js';
import { resolveVisualComponent } from './visual_component_resolver.js';
import { classifyVisualEvidence } from './visual_evidence_classifier.js';

export const RF_VISUAL_BASELINE_SELECTORS = [
  '#app',
  '#canvas-area',
  '#panel-left',
  '#panel-right',
  '.cr-section',
  '.cr-element',
  '[data-field-path]',
  '[data-element-id]',
  '#rf-debug-center-root',
];

function safeViewport(win) {
  return {
    width: Number.isFinite(Number(win?.innerWidth)) ? Number(win.innerWidth) : 0,
    height: Number.isFinite(Number(win?.innerHeight)) ? Number(win.innerHeight) : 0,
  };
}

function buildSnapshotFindings(snapshots = []) {
  return snapshots
    .filter((snapshot) => {
      const rect = snapshot?.rect || {};
      return !rect.width || !rect.height || snapshot?.visibility?.visible === false;
    })
    .map((snapshot) => ({
      type: 'RF_VISUAL_VISIBILITY_RISK',
      severity: 'CANDIDATE',
      affectedElement: snapshot.selector || snapshot.id || 'unknown',
      affectedLabel: snapshot.label || snapshot.selector || 'unknown',
      evidence: {
        rect: snapshot.rect || null,
        visibility: snapshot.visibility || null,
        styles: snapshot.styles || {},
      },
      classification: classifyVisualEvidence({
        findingType: 'RF_VISUAL_VISIBILITY_RISK',
        evidence: snapshot,
      }),
    }));
}

export function runRfVisualDoctor(env = {}) {
  const win = env.window || globalThis.window;
  const selectors = Array.isArray(env.selectors) && env.selectors.length
    ? env.selectors
    : RF_VISUAL_BASELINE_SELECTORS;

  const snapshots = collectVisualSnapshots({ ...env, window: win }, selectors);
  const components = snapshots.map((snapshot) => ({
    selector: snapshot.selector,
    component: resolveVisualComponent(snapshot, VISUAL_COMPONENT_CATALOG),
  }));

  const baselineResults = env.visualBaseline
    ? [diffVisualBaseline(env.visualBaseline, snapshots, {
        key: 'rf-visual-baseline-diff',
        title: 'RF Visual baseline diff',
      })]
    : [];

  const baselineFindings = baselineResults.flatMap((section) => (
    Array.isArray(section.findings) ? section.findings : []
  ));

  const findings = [
    ...buildSnapshotFindings(snapshots),
    ...baselineFindings,
  ];

  return {
    schema: 'rf-debug-visual-doctor/v1',
    generatedAt: new Date().toISOString(),
    viewport: safeViewport(win),
    selectors,
    snapshots,
    components,
    findings,
    baselineResults,
    counts: {
      selectors: selectors.length,
      snapshots: snapshots.length,
      components: components.length,
      findings: findings.length,
      baselineSections: baselineResults.length,
    },
    safety: {
      readOnly: true,
      embedsScreenshots: false,
      writesFiles: false,
      autopatch: false,
    },
  };
}

export default { runRfVisualDoctor, RF_VISUAL_BASELINE_SELECTORS };
