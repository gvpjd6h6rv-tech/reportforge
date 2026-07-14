'use strict';
function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/');
}

function result(name, value, evidence, diagnostics = []) {
  return { name, value: Boolean(value), evidence, diagnostics };
}

export function checkDuplicateClassification({ capabilityMap = {} } = {}) {
  const files = capabilityMap?.capabilities?.[0]?.files || [];
  const seen = new Map();
  const duplicates = [];
  const diagnostics = [];
  files.forEach((file, index) => {
    const rel = normalizePath(file?.path);
    if (!rel) return;
    if (seen.has(rel)) {
      duplicates.push(rel);
      diagnostics.push({ code: 'DUPLICATE_CLASSIFICATION', path: rel, firstIndex: seen.get(rel), duplicateIndex: index });
    } else {
      seen.set(rel, index);
    }
  });
  return result('check_duplicate_classification', duplicates.length === 0, { duplicates, total: files.length }, diagnostics);
}
