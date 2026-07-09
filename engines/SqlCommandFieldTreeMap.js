'use strict';

/**
 * SqlCommandFieldTreeMap — UDS 4.1 Fase 17. Solo datos: columnas
 * descubiertas -> nodo FIELD_TREE-shaped read-only, path namespaced por
 * command.id (no contamina otros comandos). Sin fetch, sin DOM.
 */
const SqlCommandFieldTreeMap = {
  buildCommandNode(command, columns) {
    const children = {};
    (columns || []).forEach((col) => {
      children[col.name] = { path: `sqlCommand.${command.id}.${col.name}`, label: col.name, vtype: col.rf_type || 'string', readOnly: true };
    });
    return { label: command.name, icon: '📄', children };
  },
};

if (typeof window !== 'undefined') window.SqlCommandFieldTreeMap = SqlCommandFieldTreeMap;
if (typeof module !== 'undefined') module.exports = SqlCommandFieldTreeMap;
