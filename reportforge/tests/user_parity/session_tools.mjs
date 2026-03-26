import fs from 'node:fs/promises';
import path from 'node:path';
import { collectUserParityState, computeVisualConfidenceScore, ratioIdParity } from './helpers.mjs';

export const SESSION_SCHEMA_VERSION = 1;

export async function installSessionRecorder(page) {
  await page.evaluate(() => {
    const normalizeTarget = (target) => {
      if (!target || !(target instanceof Element)) return null;
      const design = target.closest('.cr-element:not(.pv-el)');
      if (design?.dataset?.id) return { kind: 'design-element', id: design.dataset.id, text: (design.textContent || '').trim().slice(0, 120) };
      const preview = target.closest('#preview-content .pv-el');
      if (preview?.dataset?.originId) return { kind: 'preview-element', id: preview.dataset.originId, text: (preview.textContent || '').trim().slice(0, 120) };
      if (target.closest('#tab-preview')) return { kind: 'mode-tab', mode: 'preview' };
      if (target.closest('#tab-design')) return { kind: 'mode-tab', mode: 'design' };
      return {
        kind: 'dom-node',
        id: target.id || null,
        className: typeof target.className === 'string' ? target.className : null,
        tag: target.tagName || null,
        text: (target.textContent || '').trim().slice(0, 80),
      };
    };
    const pushEvent = (event) => {
      if (!window.__rfSessionRecorder) return;
      window.__rfSessionRecorder.events.push(event);
    };
    window.__rfSessionRecorder = {
      events: [],
      installedAt: Date.now(),
      captureState(label) {
        return {
          label,
          ts: Date.now(),
          previewMode: !!window.DS?.previewMode,
          selection: window.DS ? [...window.DS.selection] : [],
          modelIds: window.DS ? window.DS.elements.map((el) => el.id) : [],
          designIds: [...document.querySelectorAll('.cr-element:not(.pv-el)')].map((el) => el.dataset.id),
          previewIds: [...document.querySelectorAll('#preview-content .pv-el')].map((el) => el.dataset.originId || null),
          overlayBoxCount: document.querySelectorAll('#handles-layer .sel-box').length,
        };
      },
    };
    document.addEventListener('click', (event) => {
      pushEvent({
        type: 'click',
        ts: Date.now(),
        target: normalizeTarget(event.target),
      });
    }, true);
    document.addEventListener('keydown', (event) => {
      pushEvent({
        type: 'keydown',
        ts: Date.now(),
        key: event.key,
        code: event.code,
        ctrlKey: !!event.ctrlKey,
        shiftKey: !!event.shiftKey,
        altKey: !!event.altKey,
        metaKey: !!event.metaKey,
      });
    }, true);
    document.addEventListener('pointerdown', (event) => {
      pushEvent({
        type: 'pointerdown',
        ts: Date.now(),
        x: event.clientX,
        y: event.clientY,
        target: normalizeTarget(event.target),
      });
    }, true);
    document.addEventListener('pointerup', (event) => {
      pushEvent({
        type: 'pointerup',
        ts: Date.now(),
        x: event.clientX,
        y: event.clientY,
        target: normalizeTarget(event.target),
      });
    }, true);
  });
}

export async function startSessionRecording(page, meta = {}) {
  await installSessionRecorder(page);
  await page.evaluate((metaValue) => {
    window.__rfSessionRecorder.events = [];
    window.__rfSessionRecorder.meta = { ...metaValue, startedAt: Date.now() };
    window.__rfSessionRecorder.checkpoints = [window.__rfSessionRecorder.captureState('start')];
  }, meta);
}

export async function captureSessionCheckpoint(page, label) {
  return page.evaluate((name) => {
    const snapshot = window.__rfSessionRecorder.captureState(name);
    window.__rfSessionRecorder.checkpoints.push(snapshot);
    return snapshot;
  }, label);
}

export async function stopSessionRecording(page) {
  const raw = await page.evaluate(() => ({
    meta: window.__rfSessionRecorder?.meta || {},
    events: window.__rfSessionRecorder?.events || [],
    checkpoints: window.__rfSessionRecorder?.checkpoints || [],
  }));
  return {
    schemaVersion: SESSION_SCHEMA_VERSION,
    meta: raw.meta,
    events: raw.events,
    checkpoints: raw.checkpoints,
    labels: autoLabelSession(raw),
    suggestedAssertions: suggestAssertionsFromSession(raw),
  };
}

export function autoLabelSession(session) {
  // Start from static labels declared in the session JSON, then add computed ones.
  const labels = new Set(session.staticLabels || []);
  const events = session.events || [];
  const actions = session.actions || [];

  const pasteCount = actions.filter((a) => a.type === 'key' && String(a.key).toLowerCase() === 'control+v').length
    + events.filter((e) => e.type === 'keydown' && e.ctrlKey && String(e.key).toLowerCase() === 'v').length;

  if (pasteCount > 0) labels.add('clipboard_flow');
  if (pasteCount >= 3) labels.add('separation-risk');

  if (
    events.some((event) => event.type === 'keydown' && event.ctrlKey && String(event.key).toLowerCase() === 'z')
    || actions.some((action) => action.type === 'key' && ['control+z', 'control+y'].includes(String(action.key).toLowerCase()))
  ) labels.add('undo_redo');

  if (
    events.some((event) => event.type === 'click' && event.target?.kind === 'mode-tab')
    || actions.some((action) => action.type === 'mode')
  ) labels.add('mode_switch');

  if (
    (events.some((event) => event.type === 'pointerdown') && events.some((event) => event.type === 'pointerup'))
    || actions.some((action) => action.type === 'drag')
  ) labels.add('drag_or_pointer_flow');

  if (actions.some((action) => action.type === 'zoom' && action.value !== 1)) labels.add('zoom_composition');

  if ((session.checkpoints || []).some((c) => c.overlayBoxCount === 0) && (session.checkpoints || []).some((c) => c.overlayBoxCount > 0)) {
    labels.add('possible_glitch_temporal');
    labels.add('temporal-glitch');
  }

  // Derived compound labels
  if (labels.has('zoom_composition') && (labels.has('clipboard_flow') || labels.has('drag_or_pointer_flow'))) {
    labels.add('fine-composition');
  }
  if (labels.has('drag_or_pointer_flow') && labels.has('zoom_composition')) labels.add('handle-occlusion');
  if (labels.has('separation-risk') && pasteCount >= 3) labels.add('subtle-occlusion');

  return [...labels];
}

export function suggestAssertionsFromSession(session) {
  const assertions = [];
  const checkpoints = session.checkpoints || [];
  const labels = autoLabelSession(session);
  if (labels.includes('clipboard_flow')) {
    const last = checkpoints.at(-1);
    if (last) {
      assertions.push({ type: 'visible_clone_count', designCount: last.designIds?.length, previewCount: last.previewIds?.length });
      assertions.push({ type: 'design_preview_model_parity' });
    }
  }
  if (labels.includes('undo_redo')) assertions.push({ type: 'undo_restores_visible_set' });
  if (labels.includes('possible_glitch_temporal') || labels.includes('temporal-glitch')) assertions.push({ type: 'overlay_stays_visible_during_flow' });
  if (labels.includes('separation-risk') || labels.includes('subtle-occlusion')) assertions.push({ type: 'no_clone_visual_collapse' });
  if (labels.includes('fine-composition')) assertions.push({ type: 'composition_parity_at_zoom' });
  if (labels.includes('handle-occlusion')) assertions.push({ type: 'handle_remains_interactable' });
  return assertions;
}

// ---------------------------------------------------------------------------
// Session quality gate: fingerprinting + duplicate detection
// ---------------------------------------------------------------------------

export function computeSessionFingerprint(session) {
  const actions = session.actions || [];
  // Action type sequence (e.g. "click,key,key,key,mode") is the main structural signal.
  const typeSeq = actions.map((a) => a.type).join(',');
  const pasteCount = actions.filter((a) => a.type === 'key' && String(a.key).toLowerCase() === 'control+v').length;
  const undoRedoCount = actions.filter((a) => a.type === 'key' && ['control+z', 'control+y'].includes(String(a.key).toLowerCase())).length;
  const zoomValues = actions.filter((a) => a.type === 'zoom').map((a) => a.value).sort().join(',');
  const modeCount = actions.filter((a) => a.type === 'mode').length;
  return { typeSeq, pasteCount, undoRedoCount, zoomValues, modeCount };
}

export function detectSessionDuplicates(sessions = []) {
  // Two sessions are considered duplicates when they share the same action type sequence,
  // paste count, undo/redo count, zoom values, and mode switch count. Different text
  // targets or wait times do not differentiate sessions structurally.
  const annotated = sessions.map((s) => ({
    name: s.meta?.name || '(unnamed)',
    fingerprint: computeSessionFingerprint(s),
    labels: autoLabelSession(s),
  }));
  const duplicates = [];
  for (let i = 0; i < annotated.length; i += 1) {
    for (let j = i + 1; j < annotated.length; j += 1) {
      const a = annotated[i];
      const b = annotated[j];
      const fp = (x) => JSON.stringify(x.fingerprint);
      if (fp(a) === fp(b)) {
        duplicates.push({ a: a.name, b: b.name, reason: 'identical action fingerprint' });
      }
    }
  }
  return { sessions: annotated, duplicates };
}

export async function saveRecordedSession(filePath, session) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(session, null, 2));
}

export async function loadRecordedSession(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

export async function replayRecordedSession(page, session) {
  for (const action of session.actions || []) {
    if (action.type === 'click') {
      await resolveTarget(page, action.target).click();
    } else if (action.type === 'key') {
      await page.keyboard.press(action.key);
    } else if (action.type === 'wait') {
      await page.waitForTimeout(action.ms);
    } else if (action.type === 'drag') {
      const locator = resolveTarget(page, action.target);
      const box = await locator.boundingBox();
      if (!box) throw new Error(`drag target missing for ${JSON.stringify(action.target)}`);
      await page.mouse.move(box.x + (action.anchorX ?? 20), box.y + (action.anchorY ?? Math.min(8, box.height / 2)));
      await page.mouse.down();
      await page.mouse.move(box.x + (action.anchorX ?? 20) + action.dx, box.y + (action.anchorY ?? Math.min(8, box.height / 2)) + action.dy, { steps: action.steps || 8 });
      await page.mouse.up();
    } else if (action.type === 'mode') {
      await page.locator(action.mode === 'preview' ? '#tab-preview' : '#tab-design').click();
    } else if (action.type === 'zoom') {
      await page.evaluate(({ value }) => {
        if (window.DS.previewMode) window.PreviewZoomEngine.set(value);
        else window.DesignZoomEngine.set(value);
      }, { value: action.value });
    } else {
      throw new Error(`unsupported session action: ${action.type}`);
    }
    if (action.afterWaitMs) await page.waitForTimeout(action.afterWaitMs);
  }
}

export async function verifySessionCheckpoints(page, session) {
  const results = [];
  for (const checkpoint of session.checkpoints || []) {
    if (!checkpoint.expect) continue;
    const state = await collectUserParityState(page, { textIncludes: checkpoint.expect.textIncludes || null });
    const modelParity = ratioIdParity(state.designIds, state.modelIds, `${checkpoint.label} design-model`);
    const previewParity = state.previewMode
      ? ratioIdParity(state.previewIds, state.modelIds, `${checkpoint.label} preview-model`)
      : { value: 1, diagnostic: null, evidence: null };
    const confidence = computeVisualConfidenceScore({
      modelParity,
      designPreviewParity: state.previewMode ? previewParity : ratioIdParity(state.designIds, checkpoint.expect.designIds || state.designIds, `${checkpoint.label} design parity`),
    });
    results.push({ checkpoint: checkpoint.label, state, confidence });
  }
  return results;
}

function resolveTarget(page, target) {
  if (target.kind === 'design-element' && target.id) return page.locator(`.cr-element:not(.pv-el)[data-id="${target.id}"]`).first();
  if (target.kind === 'preview-element' && target.id) return page.locator(`#preview-content .pv-el[data-origin-id="${target.id}"]`).first();
  if (target.kind === 'design-text') return page.locator('.cr-element:not(.pv-el)').filter({ hasText: target.text }).nth(target.nth || 0);
  if (target.kind === 'preview-text') return page.locator('#preview-content .pv-el').filter({ hasText: target.text }).nth(target.nth || 0);
  if (target.selector) return page.locator(target.selector).nth(target.nth || 0);
  throw new Error(`unsupported target descriptor: ${JSON.stringify(target)}`);
}
