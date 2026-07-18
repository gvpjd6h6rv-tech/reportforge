'use strict';
var _global = globalThis;

function _isObject(value) {
  return !!value && typeof value === 'object';
}

function _textValue(value) {
  let current = value;
  for (let i = 0; i < 3; i++) {
    if (!current || typeof current !== 'object' || !('value' in current)) break;
    current = current.value;
  }
  return String(current ?? '').trim();
}

function _latency(value) {
  const num = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(num) ? Math.round(num * 10) / 10 : null;
}

function _sanitizeText(value) {
  return _textValue(value)
    .replace(/((?:password|passwd|pwd|token|secret|apikey|api_key|access_token|refresh_token|username|user(?:name| id)?|uid)\s*[:=]\s*)([^&;\s]+)/ig, '$1***')
    .replace(/([?&](?:password|passwd|pwd|token|secret|apikey|api_key|access_token|refresh_token|username)=)([^&\s]+)/ig, '$1***')
    .split(/\r?\n/, 1)[0]
    .trim();
}

function _messageForSuccess(context) {
  if (context && context.alias) return `Conexión '${_sanitizeText(context.alias)}' guardada`;
  if (context && context.host && context.database) return `Conectado a ${_sanitizeText(context.host)}/${_sanitizeText(context.database)}`;
  return 'Conexión exitosa';
}

function _messageForError(context) {
  if (context && context.host && context.database) return `No se pudo conectar a ${_sanitizeText(context.host)}/${_sanitizeText(context.database)}`;
  return 'No se pudo conectar';
}

function _pickMessage(data, context, ok) {
  if (data && data.message) return data.message;
  return ok ? _messageForSuccess(context) : _messageForError(context);
}

function _textFor(ok, message, latency_ms, cause, suggestion) {
  if (ok) return `✓ ${message}${latency_ms != null ? ` (${latency_ms} ms)` : ''}`;
  const parts = [`✗ ${message}`];
  if (cause) parts.push(`Causa: ${cause}`);
  if (suggestion) parts.push(`Sugerencia: ${suggestion}`);
  return parts.join('\n');
}

function _describeResponse(response, context) {
  const data = _isObject(response) ? response : {};
  const details = _isObject(data.details) ? data.details : {};
  const ok = data.ok === true || data.registered === true;
  const cause = _sanitizeText(details.debugCode || data.cause || data.debugCode || '');
  const suggestion = _sanitizeText(details.suggestion || data.suggestion || '');
  const latency_ms = _latency(data.latency_ms ?? data.latencyMs);
  const message = _sanitizeText(_pickMessage(data, context, ok));
  const type = ok ? 'ok' : data.type === 'busy' ? 'busy' : 'error';
  return {
    type,
    ok,
    registered: data.registered === true,
    reachable: data.reachable !== false && (ok || data.registered === true),
    message,
    cause,
    suggestion,
    debugCode: cause,
    latency_ms,
    text: _textFor(ok, message, latency_ms, cause, suggestion),
  };
}

const SQLConnectionDiagnosis = {
  sanitizeText: _sanitizeText,
  describeResponse: _describeResponse,
};

_global.SQLConnectionDiagnosis = SQLConnectionDiagnosis;
if (typeof module !== 'undefined') module.exports = SQLConnectionDiagnosis;
