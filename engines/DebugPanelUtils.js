'use strict';

function makePanelDraggable(el, handle, storageKey, defaults) {
  if (!el || !handle) return null;

  const controls = _createPanelDragControls(el, storageKey, defaults);
  let drag = null;

  function onPointerDown(event) {
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
  }

  function onPointerMove(event) {
    if (!drag) return;
    syncElementPosition(
      el,
      { left: drag.left + (event.clientX - drag.startX), top: drag.top + (event.clientY - drag.startY) },
      false,
      storageKey,
    );
  }

  function stopDrag(event) {
    if (!drag) return;
    drag = null;
    handle.classList.remove('is-dragging');
    const next = syncElementPosition(el, { left: el.offsetLeft, top: el.offsetTop }, true, storageKey);
    if (handle.releasePointerCapture && typeof event?.pointerId === 'number') {
      try { handle.releasePointerCapture(event.pointerId); } catch (_) {}
    }
    return next;
  }

  function onResize() {
    syncElementPosition(el, { left: el.offsetLeft || defaults.left, top: el.offsetTop || defaults.top }, true, storageKey);
  }

  handle.addEventListener('pointerdown', onPointerDown);
  handle.addEventListener('pointermove', onPointerMove);
  handle.addEventListener('pointerup', stopDrag);
  handle.addEventListener('pointercancel', stopDrag);

  window.addEventListener('resize', onResize);
  if (window.visualViewport?.addEventListener) {
    window.visualViewport.addEventListener('resize', onResize);
    window.visualViewport.addEventListener('scroll', onResize);
  }

  _loadPanelDragPosition(el, storageKey, defaults);
  el.__rfPanelDraggable = controls;
  return controls;
}

function _createPanelDragControls(el, storageKey, defaults) {
  return {
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
}

function _loadPanelDragPosition(el, storageKey, defaults) {
  const next = applyStoredPosition(el, storageKey, defaults);
  syncElementPosition(el, next, false, storageKey);
  return next;
}

window.makePanelDraggable = makePanelDraggable;
