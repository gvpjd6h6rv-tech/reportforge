'use strict';
var _global = globalThis;

function _trim(node, fallback) {
  let value = node;
  for (let i = 0; i < 3; i++) {
    if (!value || typeof value !== 'object' || !('value' in value)) break;
    value = value.value;
  }
  if (value == null || value === '') value = fallback || '';
  return String(value).trim();
}

function _validate(mode, values) {
  if (mode === 'save' && !values.alias) return 'El alias es obligatorio';
  if (!values.host || !values.database || !values.username || !values.password) {
    return 'Servidor, base de datos, usuario y contraseña son obligatorios';
  }
  return '';
}

const SQLConnectionModalFields = {
  readFields(fields) {
    const port = Number.parseInt(String((fields.port && fields.port.value) || '1433').trim(), 10);
    return {
      alias: _trim(fields.alias),
      host: _trim(fields.host),
      port: Number.isFinite(port) ? port : 1433,
      database: _trim(fields.database),
      username: _trim(fields.username),
      password: _trim(fields.password, ''),
    };
  },
  validate: _validate,
};

_global.SQLConnectionModalFields = SQLConnectionModalFields;
if (typeof module !== 'undefined') module.exports = SQLConnectionModalFields;
