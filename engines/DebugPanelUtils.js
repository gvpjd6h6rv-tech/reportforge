'use strict';

function makePanelDraggable(el, handle, storageKey, defaults) {
  if (!el || !handle) return null;

  const controls = {
    storageKey,
    defaults,
    reset() {
      clearStoredPosition(storageKey);
      return syncElementPosition(el, defaults, false, storageKey);
    },
    clamp() {
      return syncElementPosition(el, { left: el.offsetLeft || defaults.left, top: el.offsetTop || defaults.top }, true, storageKey);
    },
    getPosition() {
      return { left: el.offsetLeft || defaults.left, top: el.offsetTop || defaults.top };
    },
  };

  const loadPosition = () => {
    const next = applyStoredPosition(el, storageKey, defaults);
    syncElementPosition(el, next, false, storageKey);
    return next;
  };

  let drag = null;
  handle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest('button, input, select, textarea, a, [data-no-drag="true"]')) return;
    drag = {
      startX: event.clientX,
      startY: event.clientY,
      left: el.offsetLeft || defaults.left,
      top: el.offsetTop || defaults.top,
    };
    handle.classList.add('is-dragging');
    if (handle.setPointerCapture) handle.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  handle.addEventListener('pointermove', (event) => {
    if (!drag) return;
    syncElementPosition(
      el,
      { left: drag.left + (event.clientX - drag.startX), top: drag.top + (event.clientY - drag.startY) },
      false,
      storageKey,
    );
  });
  const stopDrag = (event) => {
    if (!drag) return;
    drag = null;
    handle.classList.remove('is-dragging');
    const next = syncElementPosition(el, { left: el.offsetLeft, top: el.offsetTop }, true, storageKey);
    if (handle.releasePointerCapture && typeof event?.pointerId === 'number') {
      try { handle.releasePointerCapture(event.pointerId); } catch (_) {}
    }
    return next;
  };
  handle.addEventListener('pointerup', stopDrag);
  handle.addEventListener('pointercancel', stopDrag);

  const onResize = () => {
    syncElementPosition(el, { left: el.offsetLeft || defaults.left, top: el.offsetTop || defaults.top }, true, storageKey);
  };
  window.addEventListener('resize', onResize);
  if (window.visualViewport?.addEventListener) {
    window.visualViewport.addEventListener('resize', onResize);
    window.visualViewport.addEventListener('scroll', onResize);
  }

  loadPosition();
  el.__rfPanelDraggable = controls;
  return controls;
}

window.makePanelDraggable = makePanelDraggable;
