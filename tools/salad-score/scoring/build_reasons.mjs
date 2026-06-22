'use strict';

/** Assembles { rule, message, evidence } reason entries from a list of evaluated rule checks — only the failing ones. */
export function buildReasons(entries) {
  return entries
    .filter((e) => !e.pass)
    .map((e) => ({ rule: e.rule, message: e.message, evidence: e.evidence || [] }));
}
