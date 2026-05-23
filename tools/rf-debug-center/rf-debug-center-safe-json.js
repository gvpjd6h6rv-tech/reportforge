'use strict';

const LIMITS = Object.freeze({ maxEvents: 200, maxStringLength: 1000, maxDepth: 6, maxArray: 200 });
const SENSITIVE = /password|pass|token|authorization|cookie|secret|api[-_]?key|apikey|credential|session|bearer|(?:^|[^a-z])key(?:$|[^a-z])/i;

export function clip(text, limit = LIMITS.maxStringLength) {
  const value = text == null ? '' : String(text);
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

export function redact(key, value) { return key && SENSITIVE.test(String(key)) ? '[REDACTED]' : value; }

export function sanitize(value, depth = 0, seen = new WeakSet(), key = '') {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return redact(key, value);
  if (typeof value === 'string') return redact(key, clip(value));
  if (typeof value === 'function' || typeof value === 'symbol') return clip(String(value));
  if (depth >= LIMITS.maxDepth) return clip(typeof value === 'object' ? '[Depth]' : String(value));
  if (Array.isArray(value)) return value.slice(0, LIMITS.maxArray).map((item) => sanitize(item, depth + 1, seen));
  if (typeof value === 'object') {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = sanitize(redact(k, v), depth + 1, seen, k);
    return out;
  }
  return clip(String(value));
}

export function stamp(date = new Date()) { return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, '').replace('T', '-'); }
export function filename(date = new Date()) { return `rf-debug-bundle-${stamp(date)}.json`; }
export const bundleLimits = LIMITS;
