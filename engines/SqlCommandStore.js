'use strict';

/**
 * SqlCommandStore — UDS 4.1 Fase 12.
 *
 * Responsabilidad única: owner exclusivo de DS.sqlCommands (la
 * colección en memoria de SqlCommandModel-shaped objects que el usuario
 * ya construyó y aceptó, vía SqlCommandEditor o StoredProcedurePicker).
 * add()/list()/clear()/remove(id) — nada más.
 *
 * NO hace:
 *   - no valida SQL, no ejecuta nada, no llama sql_executor.
 *   - no renderiza ninguna UI (SqlCommandsListPanel.js's job, Fase 13).
 *   - no serializa/deserializa el documento (CommandRuntimeFile.js's job).
 *   - no deduplica por id/name (DEBT-F12-2, aceptada).
 *   - no actualiza/edita comandos existentes (Fase 13 alcance reducido —
 *     no hay update(), BL-F13-1 diferido).
 */
const SqlCommandStore = {
  add(command) {
    if (typeof DS === 'undefined') return;
    if (!Array.isArray(DS.sqlCommands)) DS.sqlCommands = [];
    DS.sqlCommands.push({ ...command });
  },

  list() {
    if (typeof DS === 'undefined' || !Array.isArray(DS.sqlCommands)) return [];
    return DS.sqlCommands.map((c) => ({ ...c }));
  },

  clear() {
    if (typeof DS === 'undefined') return;
    DS.sqlCommands = [];
  },

  remove(id) {
    if (typeof DS === 'undefined' || !Array.isArray(DS.sqlCommands)) return;
    DS.sqlCommands = DS.sqlCommands.filter((c) => c.id !== id);
  },
};

window.SqlCommandStore = SqlCommandStore;
