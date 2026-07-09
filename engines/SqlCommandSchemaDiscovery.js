'use strict';

/**
 * SqlCommandSchemaDiscovery — UDS 4.1 Fase 17. Orquesta un SqlCommandModel
 * guardado -> POST /sql-commands/schema (F16, fail-closed) -> escribe
 * FIELD_TREE.sqlCommand.children[id] vía SqlCommandFieldTreeMap. Nunca
 * fabrica alias/valores, nunca renderiza UI propia, nunca persiste.
 */
const SqlCommandSchemaDiscovery = {
  async discover(command) {
    if (!command || !command.datasource_alias) return { ok: false, reason: 'no_alias', error: 'Este comando no tiene un datasource asociado — no se puede inventar uno.' };

    const parameterValues = {};
    (command.parameters || []).forEach((p) => {
      const v = (typeof ParameterValueController !== 'undefined') ? ParameterValueController.getValue(p.name) : undefined;
      if (v !== undefined && v !== null) parameterValues[p.name] = v;
    });

    let res, data;
    try {
      res = await fetch('/sql-commands/schema', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ alias: command.datasource_alias, sql_command: command, parameter_values: parameterValues }) });
      data = await res.json();
    } catch (err) { return { ok: false, reason: 'network', error: String(err) }; }
    if (!res.ok) return { ok: false, reason: 'rejected', error: data.detail || data.error || `HTTP ${res.status}` };

    if (typeof FIELD_TREE !== 'undefined' && FIELD_TREE.sqlCommand) {
      FIELD_TREE.sqlCommand.children = FIELD_TREE.sqlCommand.children || {};
      FIELD_TREE.sqlCommand.children[command.id] = SqlCommandFieldTreeMap.buildCommandNode(command, data.columns);
      if (typeof FieldExplorerEngine !== 'undefined') FieldExplorerEngine.init();
    }
    return { ok: true, columns: data.columns, warnings: data.warnings };
  },
};

if (typeof window !== 'undefined') window.SqlCommandSchemaDiscovery = SqlCommandSchemaDiscovery;
if (typeof module !== 'undefined') module.exports = SqlCommandSchemaDiscovery;
