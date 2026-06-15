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
  if (typeof value?.count === 'number') return value.count;
  if (typeof value?.total === 'number') return value.total;
  if (Array.isArray(value?.entries)) return value.entries.length;
  if (Array.isArray(value?.items)) return value.items.length;
  if (Array.isArray(value?.events)) return value.events.length;
  if (Array.isArray(value?.findings)) return value.findings.length;
  if (Array.isArray(value?.warnings)) return value.warnings.length;
  if (value && typeof value === 'object') return Object.keys(value).length;
  return 0;
}

function pickVisualModel(data) {
  const raw = data?.raw || {};
  return raw.visualDoctor || raw.visualEvidence || raw.visual || {};
}

function pickVisualBundle(data) {
  const bundle = data?.bundle || {};
  return bundle.visualDoctor || bundle.visualEvidence || bundle.visual || {};
}

export function buildDetachedVisualDoctorTab(data, helpers = {}) {
  const esc = helpers.esc || fallbackEsc;
  const safeJson = helpers.safeJson || fallbackSafeJson;
  const visualModel = pickVisualModel(data);
  const visualBundle = pickVisualBundle(data);
  const visualCount = countOf(visualModel) + countOf(visualBundle);

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
          <b class="${esc(data?.bundleStatus || 'n/a')}">${esc(data?.bundleStatus || 'n/a')}</b>
        </div>
      </div>
      <h2>VISUAL MODEL</h2>
      <pre>${esc(safeJson(visualModel))}</pre>
      <h2>VISUAL BUNDLE</h2>
      <pre>${esc(safeJson(visualBundle))}</pre>
    </section>`;
}
