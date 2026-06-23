'use strict';

function fallbackEsc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function fallbackSafeJson(value) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch (_error) {
    return '{}';
  }
}

function countOf(value) {
  if (Array.isArray(value)) return value.length;
  if (!value || typeof value !== 'object') return 0;
  for (const key of ['count', 'total']) {
    if (typeof value[key] === 'number') return value[key];
  }
  for (const key of ['entries', 'items', 'events', 'findings', 'warnings']) {
    if (Array.isArray(value[key])) return value[key].length;
  }
  return Object.keys(value).length;
}

function pickVisualModel(raw) {
  return raw.visualDoctor || raw.visualEvidence || raw.visual || {};
}

function pickVisualBundle(bundle) {
  return bundle.visualDoctor || bundle.visualEvidence || bundle.visual || {};
}

// SPD1E: rf-debug-center-api-visual-doctor.js already builds and maintains
// this state (visualDoctorPreview: {status, selector, plan, result, summary,
// safety, updatedAt}) and the detached-window client script
// (rf-debug-center-detached-client-script.js) already wires
// data-act="visual-preview" to api.runVisualDoctorRuntimePreview() — only
// the markup to render that state and the trigger button were missing from
// this template. Section labels below are real field names, not invented:
// SAFETY CONTRACT renders plan.safety (runtimeOnly/writesFiles/
// rollbackRequired/autopatch — the exact PREVIEW_SAFETY shape); RUNTIME
// PREVIEW renders the preview status/selector/summary; RF VISUAL DOCTOR CSS
// renders plan.cssText (real field name in visual_fix_simulator.js); VISUAL
// REGRESSION GUARD renders result's before/after/improved/confidence
// comparison.
function safetyRow(label, value) {
  return `<div class="rf-row"><span>${fallbackEsc(label)}</span><b class="${value ? 'red' : 'green'}">${value ? 'yes' : 'no'}</b></div>`;
}

function buildPreviewSection(previewOrNull, esc, safeJson) {
  const preview = previewOrNull || {};
  const safety = preview.safety || {};
  const result = preview.result || null;
  const plan = preview.plan || {};

  return `
      <h2>RUNTIME PREVIEW</h2>
      <div class="rf-two">
        <div class="rf-row"><span>status</span><b>${esc(preview.status || 'idle')}</b></div>
        <div class="rf-row"><span>selector</span><b>${esc(preview.selector || 'n/a')}</b></div>
      </div>
      <div class="rf-row"><span>summary</span><b>${esc(preview.summary || 'idle')}</b></div>
      <button class="act visual-preview" data-act="visual-preview" title="Simulate a runtime-only CSS fix — never writes files">RUN RUNTIME PREVIEW</button>

      <h2>SAFETY CONTRACT</h2>
      <div class="rf-two">
        ${safetyRow('runtime only', safety.runtimeOnly !== false)}
        ${safetyRow('writes files', !!safety.writesFiles)}
        ${safetyRow('rollback required', safety.rollbackRequired !== false)}
        ${safetyRow('autopatch', !!safety.autopatch)}
      </div>

      <h2>RF VISUAL DOCTOR CSS</h2>
      <pre>${esc(plan.cssText || '/* no simulated CSS yet — run the runtime preview above */')}</pre>

      <h2>VISUAL REGRESSION GUARD</h2>
      <pre>${esc(safeJson(result || { applied: false, improved: false, confidence: 'n/a', recommendation: 'no simulation run yet' }))}</pre>`;
}

export function buildDetachedVisualDoctorTab(data, helpers = {}) {
  const esc = helpers.esc || fallbackEsc;
  const safeJson = helpers.safeJson || fallbackSafeJson;
  const safeData = data || {};
  const raw = safeData.raw || {};
  const bundleData = safeData.bundle || {};
  const visualModel = pickVisualModel(raw);
  const visualBundle = pickVisualBundle(bundleData);
  const visualCount = countOf(visualModel) + countOf(visualBundle);
  const preview = raw.visualDoctorPreview || bundleData.visualDoctorPreview || null;
  const bundleStatus = safeData.bundleStatus || 'n/a';

  return `
    <section class="panel raw-panel">
      <h2>VISUAL DOCTOR</h2>
      <div class="rf-two">
        <div class="rf-row">
          <span>visual signals</span>
          <b class="${visualCount ? 'cyan' : 'green'}">${esc(visualCount)}</b>
        </div>
        <div class="rf-row">
          <span>bundle status</span>
          <b class="${esc(bundleStatus)}">${esc(bundleStatus)}</b>
        </div>
      </div>
      <h2>VISUAL MODEL</h2>
      <pre>${esc(safeJson(visualModel))}</pre>
      <h2>VISUAL BUNDLE</h2>
      <pre>${esc(safeJson(visualBundle))}</pre>
      ${buildPreviewSection(preview, esc, safeJson)}
    </section>`;
}
