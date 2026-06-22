'use strict';

const SUGGESTIONS = {
  'io': 'extraer llamadas de I/O a un collector dedicado',
  'dom-mutation': 'extraer manipulación DOM a un módulo dedicado',
  'state-mutation': 'extraer mutación de estado a un módulo dedicado',
  'event-wiring': 'extraer wiring de eventos a un módulo dedicado',
  'business-logic': 'extraer lógica de negocio a un módulo dedicado',
};

/** Maps detected responsibility categories to human split suggestions. */
export function suggestSplit(responsibilities = []) {
  return responsibilities.map((r) => SUGGESTIONS[r]).filter(Boolean);
}
