export function setField(doc, id, value) {
  const el = doc.getElementById(id);
  if (el) el.value = value;
}

export function click(doc, id) {
  doc.getElementById(id)?._fire('click');
}

export function statusType(doc) {
  return doc.getElementById('sqlm-status')?.getAttribute('data-status-type');
}

export function statusText(doc) {
  return doc.getElementById('sqlm-status')?.textContent || '';
}

export function root(doc) {
  return doc.body._children[0] || null;
}

export function fireKeydown(doc, targetId, key) {
  const target = doc.getElementById(targetId);
  const prevented = [];
  root(doc)?._fire('keydown', { key, target, preventDefault: () => prevented.push(true) });
  return { prevented };
}

export function flush() {
  return new Promise((resolve) => setTimeout(resolve, 10));
}
