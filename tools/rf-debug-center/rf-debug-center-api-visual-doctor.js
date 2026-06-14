import { runRfVisualDoctor } from './visual-doctor/visual_doctor_registry.js';
import {
  buildSafeCssSimulationPlan,
  simulateCssFixInDom,
  summarizeSimulationResult,
} from './visual-doctor/visual_fix_simulator.js';

const VISUAL_DOCTOR_CACHE_MS = 1200;
const PREVIEW_SCHEMA = 'rf-debug-visual-doctor-preview/v1';

const PREVIEW_SAFETY = Object.freeze({
  runtimeOnly: true,
  writesFiles: false,
  rollbackRequired: true,
  autopatch: false,
});

function clonePreviewSafety() {
  return { ...PREVIEW_SAFETY };
}

function idlePreviewState() {
  return {
    schema: PREVIEW_SCHEMA,
    status: 'idle',
    plan: null,
    result: null,
    summary: 'idle',
    safety: clonePreviewSafety(),
    updatedAt: null,
  };
}

function getRuntimeWindow() {
  return typeof window !== 'undefined' ? window : null;
}

function getRuntimeDocument() {
  const runtimeWindow = getRuntimeWindow();
  return runtimeWindow?.document || (typeof document !== 'undefined' ? document : null);
}

function ensureVisualDoctorState(state) {
  if (!state.visualDoctor) state.visualDoctor = { model: null, error: null, updatedAt: null };
  if (!state.visualDoctorPreview) state.visualDoctorPreview = idlePreviewState();
  return state;
}

function refreshVisualDoctorModel(state, force = false) {
  ensureVisualDoctorState(state);
  const now = Date.now();
  const previous = state.visualDoctor.model;
  const previousAt = Number(state.visualDoctor.updatedAt || 0);
  if (!force && previous && now - previousAt < VISUAL_DOCTOR_CACHE_MS) return previous;

  try {
    const runtimeWindow = getRuntimeWindow();
    const runtimeDocument = getRuntimeDocument();
    const model = runRfVisualDoctor({ window: runtimeWindow, document: runtimeDocument });
    state.visualDoctor = { model, error: null, updatedAt: now };
    return model;
  } catch (error) {
    state.visualDoctor = {
      model: previous,
      error: String(error?.message || error || 'visual doctor failed'),
      updatedAt: now,
    };
    return previous;
  }
}

export function decorateVisualDoctorModel(model, state) {
  ensureVisualDoctorState(state);
  model.visualDoctor = refreshVisualDoctorModel(state, false);
  model.rfVisualDoctor = model.visualDoctor;
  model.visualDoctorStatus = {
    available: !!model.visualDoctor,
    error: state.visualDoctor.error || null,
    updatedAt: state.visualDoctor.updatedAt || null,
  };
  model.visualDoctorPreview = state.visualDoctorPreview;
  return model;
}

function rejectedPreview(selector, reason) {
  return {
    schema: PREVIEW_SCHEMA,
    status: 'rejected',
    selector,
    plan: null,
    result: {
      applied: false,
      rolledBack: true,
      before: null,
      after: null,
      improved: false,
      confidence: 'low',
      recommendation: reason,
    },
    summary: reason,
    safety: clonePreviewSafety(),
    updatedAt: new Date().toISOString(),
  };
}

function buildPreviewInput(options = {}) {
  const runtimeDocument = getRuntimeDocument();
  const selector = String(options.selector || '#canvas-area');
  const element = runtimeDocument?.querySelector?.(selector) || null;
  const beforeRect = element?.getBoundingClientRect?.();
  const currentHeight = Math.round(Number(beforeRect?.height || 0));
  const expectedHeight = Math.round(Number(options.expectedHeight || Math.max(1, currentHeight + 1)));

  return {
    selector,
    currentHeight,
    expectedHeight,
    diagnosis: options.diagnosis || {
      selector,
      currentHeight,
      reference: { height: expectedHeight },
      diagnosticTarget: { selector },
    },
    repairRecipe: options.repairRecipe || {
      title: options.title || 'Runtime-only visual doctor preview',
      severity: options.severity || 'LOW',
      targetSelectors: [selector],
    },
  };
}

export function runVisualDoctorRuntimePreview(state, applyModel, options = {}) {
  ensureVisualDoctorState(state);
  const runtimeWindow = getRuntimeWindow();
  const runtimeDocument = getRuntimeDocument();
  const input = buildPreviewInput(options);

  if (!runtimeWindow || !runtimeDocument) {
    state.visualDoctorPreview = rejectedPreview(input.selector, 'Runtime preview requires browser window/document.');
    return state.visualDoctorPreview;
  }

  const plan = buildSafeCssSimulationPlan(input.diagnosis, input.repairRecipe, {
    selector: input.selector,
    expectedHeight: input.expectedHeight,
    cssText: options.cssText,
    source: 'rf-debug-center-runtime-preview',
  });

  const result = simulateCssFixInDom(plan, runtimeWindow);
  state.visualDoctorPreview = {
    schema: PREVIEW_SCHEMA,
    status: result?.applied ? 'simulated' : 'rejected',
    selector: input.selector,
    plan,
    result,
    summary: summarizeSimulationResult(result),
    safety: plan?.safety || clonePreviewSafety(),
    updatedAt: new Date().toISOString(),
  };

  applyModel?.();
  state.detachedWindow?.sync();
  return state.visualDoctorPreview;
}

export function applyVisualDoctorApi(api, state, applyModel) {
  ensureVisualDoctorState(state);
  const runPreview = (options = {}) => runVisualDoctorRuntimePreview(state, applyModel, options);
  api.runVisualDoctorRuntimePreview = runPreview;
  if (state.actions) state.actions.runVisualDoctorRuntimePreview = runPreview;
  return api;
}
