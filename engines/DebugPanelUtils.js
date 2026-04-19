'use strict';

function makePanelDraggable(el, handle, storageKey, defaults) {
  if (!el || !handle) return;
  const clampPosition = (left, top) => { const width = el.offsetWidth || 0; const height = el.offsetHeight || 0; const maxLeft = Math.max(8, window.innerWidth - width - 8); const maxTop = Math.max(8, window.innerHeight - height - 8); return { left: Math.min(Math.max(8, left), maxLeft), top: Math.min(Math.max(8, top), maxTop) }; };
  const applyPosition = (left, top, persist = true) => { const next = clampPosition(left, top); el.style.left = `${next.left}px`; el.style.top = `${next.top}px`; el.style.right = 'auto'; el.style.bottom = 'auto'; if (persist) { try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch (_) {} } };
  const loadPosition = () => { try { const raw = localStorage.getItem(storageKey); if (raw) { const saved = JSON.parse(raw); if (typeof saved.left === 'number' && typeof saved.top === 'number') { applyPosition(saved.left, saved.top, false); return; } } } catch (_) {} applyPosition(defaults.left, defaults.top, false); };
  let drag = null;
  handle.addEventListener('pointerdown', e => { if (e.button !== 0) return; drag = { startX: e.clientX, startY: e.clientY, left: el.offsetLeft, top: el.offsetTop }; handle.classList.add('is-dragging'); handle.setPointerCapture && handle.setPointerCapture(e.pointerId); e.preventDefault(); });
  handle.addEventListener('pointermove', e => { if (!drag) return; applyPosition(drag.left + (e.clientX - drag.startX), drag.top + (e.clientY - drag.startY), false); });
  const stopDrag = e => { if (!drag) return; applyPosition(el.offsetLeft, el.offsetTop, true); drag = null; handle.classList.remove('is-dragging'); if (handle.releasePointerCapture && typeof e.pointerId === 'number') { handle.releasePointerCapture(e.pointerId); } };
  handle.addEventListener('pointerup', stopDrag);
  handle.addEventListener('pointercancel', stopDrag);
  window.addEventListener('resize', () => { applyPosition(el.offsetLeft || defaults.left, el.offsetTop || defaults.top, true); });
  loadPosition();
}

window.makePanelDraggable = makePanelDraggable;
