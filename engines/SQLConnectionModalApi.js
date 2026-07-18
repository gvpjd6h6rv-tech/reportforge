'use strict';
var _global = globalThis;

function _sanitize(value) {
  return _global.SQLConnectionDiagnosis ? _global.SQLConnectionDiagnosis.sanitizeText(value) : String(value ?? '').trim();
}

async function _parseJson(res) {
  if (!res || typeof res.json !== 'function') return {};
  try {
    const data = await res.json();
    return data && typeof data === 'object' ? data : {};
  } catch (_) {
    return {};
  }
}

function _httpError(res, data) {
  const status = Number(res && res.status);
  const details = data && data.details ? data.details : {};
  const debugCode = details.debugCode || data.debugCode || (Number.isFinite(status) ? `HTTP ${status}` : 'HTTP error');
  const message = data.message || (Number.isFinite(status) ? `HTTP ${status}` : 'Error HTTP');
  return {
    ok: false,
    registered: false,
    reachable: false,
    message: _sanitize(message),
    details: { ...details, debugCode: _sanitize(debugCode) },
  };
}

async function _postJSON(fetchFn, url, body) {
  const res = await fetchFn(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await _parseJson(res);
  return res && res.ok === false ? _httpError(res, data) : data;
}

function _testConnection(fetchFn, fields) {
  return _postJSON(fetchFn, '/datasources/_test', {
    host: fields.host,
    port: fields.port,
    database: fields.database,
    username: fields.username,
    password: fields.password,
  });
}

function _saveConnection(fetchFn, fields) {
  return _postJSON(fetchFn, `/datasources/${encodeURIComponent(fields.alias)}/connect`, {
    alias: fields.alias,
    host: fields.host,
    port: fields.port,
    database: fields.database,
    username: fields.username,
    password: fields.password,
  });
}

const SQLConnectionModalApi = {
  parseJson: _parseJson,
  normalizeHttpError: _httpError,
  postJSON: _postJSON,
  testConnection: _testConnection,
  saveConnection: _saveConnection,
};

_global.SQLConnectionModalApi = SQLConnectionModalApi;
if (typeof module !== 'undefined') module.exports = SQLConnectionModalApi;
