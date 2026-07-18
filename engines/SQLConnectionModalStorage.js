'use strict';
var _global = typeof window !== 'undefined' ? window : globalThis;
const SQLConnectionModalStorage = {
  storage() { return _global.localStorage || null; },
  buildPrefsData(fields) { return { alias: fields.alias || '', host: fields.host || '', port: fields.port || 1433, database: fields.database || '', username: fields.username || '' }; },
  loadPrefs() { try { const store = this.storage(); return JSON.parse((store && store.getItem('rf.sqlConnectionModalPrefs')) || '{}') || {}; } catch (_) { return {}; } },
  savePrefs(fields) { try { const store = this.storage(); if (store) store.setItem('rf.sqlConnectionModalPrefs', JSON.stringify(this.buildPrefsData(fields))); } catch (_) { /* ignore */ } },
  applyPrefs(fields, prefs) { const keys = ['alias', 'host', 'port', 'database', 'username']; for (let i = 0; i < keys.length; i++) { const key = keys[i]; if (prefs && prefs[key] != null) fields[key].value = prefs[key]; } },
};
_global.SQLConnectionModalStorage = SQLConnectionModalStorage;
if (typeof module !== 'undefined') module.exports = SQLConnectionModalStorage;
