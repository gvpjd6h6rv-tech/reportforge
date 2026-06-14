const UNSAFE_TEXT_RE = /data:image|base64|blob:/i;
const SAFE_REF_RE = /^(artifact:\/\/|file-ref:\/\/|sha256:)[A-Za-z0-9._:/@-]+$/;

function isSafeRef(value = '') {
  const text = String(value || '');
  return Boolean(text && SAFE_REF_RE.test(text) && !UNSAFE_TEXT_RE.test(text) && text !== '[redacted]');
}

function sanitizeValue(value) {
  if (value === undefined) return null;
  if (value instanceof ArrayBuffer || ArrayBuffer.isView?.(value)) return '[redacted]';
  if (typeof value === 'string') return UNSAFE_TEXT_RE.test(value) ? '[redacted]' : value;
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, sanitizeValue(entry)]));
  return value;
}

function normalizeCrop(crop = {}) {
  const clean = sanitizeValue(crop || {});
  return {
    selector: clean.selector || '',
    browserName: clean.browserName || clean.browser || 'unknown',
    phase: clean.phase || 'unknown',
    bounds: clean.bounds || null,
    cropHash: isSafeRef(clean.cropHash) ? clean.cropHash : '[redacted]',
    screenshotRef: isSafeRef(clean.screenshotRef) ? clean.screenshotRef : '',
    timestamp: clean.timestamp || '',
  };
}

function hasUsableCrop(crop = {}) {
  return isSafeRef(crop.cropHash) || isSafeRef(crop.screenshotRef);
}

export function compareLabCropEvidence(before = {}, after = {}, options = {}) {
  const a = normalizeCrop(before);
  const b = normalizeCrop(after);
  if (!hasUsableCrop(a) || !hasUsableCrop(b)) return { verdict: 'UNKNOWN_PIXEL_EVIDENCE', sameCrop: false, reason: 'missing or redacted crop evidence' };
  const sameCrop = a.cropHash === b.cropHash && isSafeRef(a.cropHash);
  const diffPercent = Number(options.diffPercent ?? (sameCrop ? 0 : 100));
  return { verdict: diffPercent > Number(options.threshold ?? 0.5) ? 'VISUAL_DIFF' : 'NO_VISUAL_DIFF', sameCrop, diffPercent };
}

export function buildVisualLabArtifact(input = {}, options = {}) {
  const captures = Array.isArray(input.captures) ? input.captures.map(sanitizeValue) : [];
  return sanitizeValue({
    version: 'visual-doctor-lab-artifact-v1',
    diagnosticId: input.diagnosticId || options.diagnosticId || '',
    selector: input.selector || '',
    createdAt: input.createdAt || new Date().toISOString(),
    captures,
    cropDiffs: input.cropDiffs || [],
    safety: { embedsImage: false, writesFiles: false, autopatch: false },
  });
}

export function normalizeVisualLabArtifact(input = {}) {
  return buildVisualLabArtifact(sanitizeValue(input), { diagnosticId: input.diagnosticId || '' });
}

export function sanitizeVisualLabArtifact(value) {
  return sanitizeValue(value);
}
