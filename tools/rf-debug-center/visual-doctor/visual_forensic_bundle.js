const BUNDLE_KEYS = [
  'timestamp',
  'browser',
  'selector',
  'sourceElement',
  'diagnosticTarget',
  'targetResolutionReason',
  'rect',
  'computedStyle',
  'currentHeight',
  'reference',
  'driftPx',
  'findingType',
  'suspiciousProperties',
  'matchedCssRules',
  'wrapperMismatch',
  'browserParity',
  'browserCapture',
  'cascadeGraph',
  'pixelEvidence',
  'simulationPlan',
  'simulationResult',
  'fixPreview',
  'reproBundle',
  'labArtifact',
  'sourceHints',
  'repairRecipe',
  'probableOwner',
  'whyChain',
  'recommendation',
];
const BLOCKED_KEYS = new Set(['blob', 'image', 'images', 'imagebytes', 'imagebytes', 'buffer', 'arraybuffer', 'typedarray', 'base64', 'bytes', 'screenshotbase64']);
const BLOCKED_TEXT = /data:image|base64|blob:/i;

function normalizeKey(key) {
  return String(key || '').replace(/[_-]/g, '').toLowerCase();
}

function isBinaryLike(value) {
  return Boolean(value instanceof ArrayBuffer || ArrayBuffer.isView?.(value) || value?.type === 'Buffer' || value?.constructor?.name === 'Buffer');
}

function sanitizeForBundle(value) {
  if (value === undefined) return null;
  if (isBinaryLike(value)) return '[redacted]';
  if (typeof value === 'string') return BLOCKED_TEXT.test(value) ? '[redacted]' : value;
  if (Array.isArray(value)) return value.map(sanitizeForBundle).filter((entry) => entry !== undefined);
  if (value && typeof value === 'object') return sanitizeObjectForBundle(value);
  return value;
}

function sanitizeObjectForBundle(value = {}) {
  const entries = Object.entries(value)
    .filter(([key]) => !BLOCKED_KEYS.has(normalizeKey(key)))
    .map(([key, entry]) => [key, sanitizeForBundle(entry)])
    .filter(([, entry]) => entry !== undefined);
  return Object.fromEntries(entries);
}

function safeClone(value) {
  return sanitizeForBundle(value);
}

function summarizeMatchedCssRules(rules = []) {
  return (Array.isArray(rules) ? rules : []).slice(0, 30).map((rule) => ({
    selectorText: rule.selectorText || '',
    cssText: rule.cssText || '',
    href: rule.href || '',
    ownerNodeId: rule.ownerNodeId || '',
    media: rule.media || '',
    source: rule.source || 'cssom',
    confidence: rule.confidence || 'matched-selector',
  }));
}

function buildBundleCore(diagnosis = {}, options = {}) {
  return {
    timestamp: options.timestamp || new Date().toISOString(),
    browser: diagnosis.browser || options.browser || 'unknown',
    selector: diagnosis.selector || 'none',
    sourceElement: safeClone(diagnosis.sourceElement),
    diagnosticTarget: safeClone(diagnosis.diagnosticTarget),
    targetResolutionReason: diagnosis.targetResolutionReason || '',
    rect: safeClone(diagnosis.rect || {}),
    computedStyle: safeClone(diagnosis.computedStyle || {}),
    currentHeight: Number(diagnosis.currentHeight || 0),
    reference: safeClone(diagnosis.reference),
    driftPx: Number(diagnosis.driftPx || 0),
    findingType: diagnosis.findingType || null,
  };
}

function buildBundleEvidence(diagnosis = {}) {
  return {
    suspiciousProperties: safeClone(diagnosis.suspiciousProperties || []),
    matchedCssRules: summarizeMatchedCssRules(diagnosis.matchedCssRules || []),
    wrapperMismatch: safeClone(diagnosis.wrapperMismatch || null),
    browserParity: safeClone(diagnosis.browserParity || null),
    browserCapture: safeClone(diagnosis.browserCapture || null),
    cascadeGraph: safeClone(diagnosis.cascadeGraph || null),
    pixelEvidence: safeClone(diagnosis.pixelEvidence || null),
    simulationPlan: safeClone(diagnosis.simulationPlan || null),
    simulationResult: safeClone(diagnosis.simulationResult || null),
    fixPreview: safeClone(diagnosis.fixPreview || null),
    reproBundle: safeClone(diagnosis.reproBundle || null),
    labArtifact: safeClone(diagnosis.labArtifact || null),
    sourceHints: safeClone(diagnosis.sourceHints || null),
    repairRecipe: safeClone(diagnosis.repairRecipe || null),
  };
}

function buildBundleNarrative(diagnosis = {}, owner = null, whyChain = []) {
  return {
    probableOwner: safeClone(owner || diagnosis.probableOwner || null),
    whyChain: safeClone(whyChain || diagnosis.whyChain || []),
    recommendation: diagnosis.recommendation || '',
  };
}

export function buildVisualForensicBundle(diagnosis = {}, owner = null, whyChain = [], options = {}) {
  const bundle = {
    ...buildBundleCore(diagnosis, options),
    ...buildBundleEvidence(diagnosis),
    ...buildBundleNarrative(diagnosis, owner, whyChain),
  };
  return Object.fromEntries(BUNDLE_KEYS.map((key) => [key, bundle[key]]));
}

export function serializeVisualForensicBundle(bundle) {
  return JSON.stringify(safeClone(bundle), null, 2);
}

export async function copyVisualForensicBundle(bundle, windowLike = null) {
  const json = serializeVisualForensicBundle(bundle);
  try {
    if (windowLike?.navigator?.clipboard?.writeText) {
      await windowLike.navigator.clipboard.writeText(json);
      return true;
    }
  } catch (_) {}
  try {
    windowLike?.prompt?.('Copy forensic bundle', json);
  } catch (_) {}
  return false;
}
