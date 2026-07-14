'use strict';
function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/');
}

function result(name, value, evidence, diagnostics = []) {
  return { name, value: Boolean(value), evidence, diagnostics };
}

export function checkMissingClassification({ physicalPaths = [], capabilityMap = {} } = {}) {
  const files = capabilityMap?.capabilities?.[0]?.files || [];
  const classifiedByPath = new Map(files.map((file) => [normalizePath(file.path), file]));
  const missing = [];
  const diagnostics = [];
  for (const path of physicalPaths) {
    const entry = classifiedByPath.get(normalizePath(path));
    if (!entry || !entry.classification) {
      missing.push(normalizePath(path));
      diagnostics.push({ code: entry ? 'UNCLASSIFIED_PHYSICAL_PATH' : 'MISSING_CLASSIFICATION', path: normalizePath(path) });
    }
  }
  return result('check_missing_classification', missing.length === 0, { missing, classifiedCount: files.length }, diagnostics);
}
