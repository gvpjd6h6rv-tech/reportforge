const BASELINE_SCHEMA = 'rf-debug-visual-baseline/v1';
const BASELINE_VERSION = 1;
const MAX_JSON_TEXT_LENGTH = 1_000_000;
const MAX_BASELINE_ITEMS = 5000;
const BASELINE_STYLE_KEYS = [
  'display',
  'visibility',
  'opacity',
  'overflowX',
  'overflowY',
  'contain',
  'position',
  'zIndex',
  'transform',
  'filter',
  'pointerEvents',
  'boxSizing',
  'lineHeight',
  'fontSize',
  'paddingTop',
  'paddingBottom',
  'minHeight',
  'maxHeight',
  'backgroundImage',
  'appearance',
];

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function toText(value) {
  return String(value ?? '').trim();
}

function round(value) {
  const num = Number(value);
  return Number.isFinite(num) ? Number(num.toFixed(2)) : 0;
}

function normalizeRect(rect) {
  if (!isPlainObject(rect)) return null;
  return {
    left: round(rect.left),
    top: round(rect.top),
    width: round(rect.width),
    height: round(rect.height),
  };
}

function normalizeStyles(styles = {}) {
  return Object.fromEntries(BASELINE_STYLE_KEYS.map((key) => [key, toText(styles?.[key] ?? '')]));
}

function normalizeTable(table = {}) {
  return {
    tableSection: toText(table?.tableSection ?? ''),
    rowIndex: Number.isFinite(Number(table?.rowIndex)) ? Number(table.rowIndex) : -1,
    cellIndex: Number.isFinite(Number(table?.cellIndex)) ? Number(table.cellIndex) : -1,
    colSpan: Number.isFinite(Number(table?.colSpan)) ? Number(table.colSpan) : 1,
    rowSpan: Number.isFinite(Number(table?.rowSpan)) ? Number(table.rowSpan) : 1,
  };
}

function pickItemsSource(baseline) {
  if (!isPlainObject(baseline)) return null;
  if (Array.isArray(baseline.entries)) return baseline.entries;
  if (Array.isArray(baseline.items)) return baseline.items;
  if (Array.isArray(baseline.snapshots)) return baseline.snapshots;
  return null;
}

function normalizeItem(item, index, errors) {
  if (!isPlainObject(item)) {
    errors.push(`Baseline item ${index} is not an object`);
    return null;
  }

  const selector = toText(item.selector);
  if (!selector) {
    errors.push(`Baseline item ${index} is missing selector`);
    return null;
  }

  const rect = normalizeRect(item.rect);
  if (!rect) {
    errors.push(`Baseline item ${index} is missing rect`);
    return null;
  }

  return {
    selector,
    tagName: toText(item.tagName).toLowerCase(),
    id: toText(item.id),
    className: toText(item.className),
    role: toText(item.role),
    tabIndex: Number.isFinite(Number(item.tabIndex)) ? Number(item.tabIndex) : -1,
    rect,
    styles: normalizeStyles(item.styles),
    table: normalizeTable(item.table),
  };
}

function normalizeBaselineItems(baseline, errors) {
  const itemsSource = pickItemsSource(baseline);
  const items = [];
  if (!Array.isArray(itemsSource)) return items;
  for (const [index, item] of itemsSource.entries()) {
    const normalized = normalizeItem(item, index, errors);
    if (normalized) items.push(normalized);
  }
  if (!items.length) errors.push('Baseline has no valid items');
  return items;
}

function pushBaselineObjectError(baseline, errors) {
  if (!isPlainObject(baseline)) {
    errors.push('Baseline must be an object');
    return true;
  }
  return false;
}

function pushBaselineCollectionErrors(baseline, errors) {
  const itemsSource = pickItemsSource(baseline);
  if (!Array.isArray(itemsSource) || !itemsSource.length) {
    errors.push('Baseline must include a non-empty items or snapshots array');
  } else if (itemsSource.length > MAX_BASELINE_ITEMS) {
    errors.push(`Baseline item count exceeds ${MAX_BASELINE_ITEMS}`);
  }
}

function pushBaselineVersionError(baseline, errors, options = {}) {
  const hasVersion = baseline.version !== undefined && baseline.version !== null && String(baseline.version).trim() !== '';
  const version = Number(hasVersion ? baseline.version : (options.allowDefaults ? options.version ?? BASELINE_VERSION : NaN));
  if (!Number.isFinite(version) || version <= 0 || (!hasVersion && !options.allowDefaults)) {
    errors.push('Baseline version is required');
  }
}

function pushBaselineCreatedAtError(baseline, metadata, errors, options = {}) {
  const createdAt = toText(baseline.createdAt ?? (options.allowDefaults ? metadata.createdAt || baseline.generatedAt || new Date().toISOString() : ''));
  if (!createdAt) {
    errors.push('Baseline createdAt is required');
  }
}

function pushBaselineSourceError(baseline, metadata, errors, options = {}) {
  const source = toText(baseline.source ?? (options.allowDefaults ? metadata.source || 'debug-center' : ''));
  if (!source) {
    errors.push('Baseline source is required');
  }
}

function pushBaselineSchemaError(baseline, errors) {
  if (baseline.schema && baseline.schema !== BASELINE_SCHEMA) {
    errors.push(`Unsupported baseline schema: ${String(baseline.schema)}`);
  }
}

function collectBaselineErrors(baseline, metadata, options = {}) {
  const errors = [];
  if (pushBaselineObjectError(baseline, errors)) return errors;
  pushBaselineCollectionErrors(baseline, errors);
  pushBaselineVersionError(baseline, errors, options);
  pushBaselineCreatedAtError(baseline, metadata, errors, options);
  pushBaselineSourceError(baseline, metadata, errors, options);
  pushBaselineSchemaError(baseline, errors);
  return errors;
}

function buildBaselinePayloadObject(baseline, metadata, options, items) {
  const payload = {
    schema: BASELINE_SCHEMA,
    version: Number(baseline.version ?? options.version ?? BASELINE_VERSION),
    createdAt: toText(baseline.createdAt ?? (options.allowDefaults ? metadata.createdAt || baseline.generatedAt || new Date().toISOString() : '')),
    source: toText(baseline.source ?? (options.allowDefaults ? metadata.source || 'debug-center' : '')),
    items,
    snapshots: items,
    entries: items,
    itemCount: items.length,
  };

  const extraMetadata = {
    ...(isPlainObject(baseline.metadata) ? baseline.metadata : {}),
    ...(isPlainObject(metadata) ? metadata : {}),
  };
  if (Object.keys(extraMetadata).length) {
    payload.metadata = { ...extraMetadata };
  }
  if (baseline.generatedAt) {
    payload.generatedAt = toText(baseline.generatedAt);
  }
  return payload;
}

function buildBaselinePayload(baseline, metadata = {}, options = {}) {
  const errors = collectBaselineErrors(baseline, metadata, options);
  if (errors.length) {
    return { valid: false, errors, baseline: null };
  }

  const items = normalizeBaselineItems(baseline, errors);
  if (errors.length || !items.length) {
    return { valid: false, errors, baseline: null };
  }

  return { valid: true, errors: [], baseline: buildBaselinePayloadObject(baseline, metadata, options, items) };
}

function normalizeBaselinePayload(baseline, metadata = {}, options = {}) {
  return buildBaselinePayload(baseline, metadata, options);
}

export function validateVisualBaselineShape(value) {
  return buildBaselinePayload(value, {}, { allowDefaults: false });
}

export function buildBaselineDownloadPayload(baseline, metadata = {}) {
  const result = buildBaselinePayload(baseline, metadata, { allowDefaults: true });
  if (!result.valid || !result.baseline) {
    const message = result.errors.join('; ') || 'Invalid visual baseline';
    throw new Error(message);
  }
  return result.baseline;
}

export function serializeVisualBaseline(baseline) {
  return JSON.stringify(buildBaselineDownloadPayload(baseline), null, 2);
}

export function parseVisualBaselineJson(text) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('Visual baseline JSON is empty');
  }
  if (text.length > MAX_JSON_TEXT_LENGTH) {
    throw new Error(`Visual baseline JSON exceeds ${MAX_JSON_TEXT_LENGTH} characters`);
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`Visual baseline JSON is invalid: ${String(error?.message || error)}`);
  }

  const validation = validateVisualBaselineShape(parsed);
  if (!validation.valid || !validation.baseline) {
    throw new Error(validation.errors.join('; ') || 'Invalid visual baseline');
  }
  return validation.baseline;
}

export function readBaselineFromFileText(text) {
  return parseVisualBaselineJson(text);
}
