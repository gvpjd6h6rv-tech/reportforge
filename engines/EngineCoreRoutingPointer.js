'use strict';

const EngineCoreRoutingPointer = (() => {
  function createEngineCoreRoutingPointer(deps = {}) {
    const state = deps.state || {};
    const getEngine = typeof deps.getEngine === 'function' ? deps.getEngine : () => null;
    const traceElement = typeof deps.traceElement === 'function' ? deps.traceElement : () => {};
    const targetSummary = typeof deps.targetSummary === 'function' ? deps.targetSummary : () => null;
    const cloneSerializable = typeof deps.cloneSerializable === 'function'
      ? deps.cloneSerializable
      : (value) => JSON.parse(JSON.stringify(value));

    function normalizePointerEvent(e, phase) {
      const ws = typeof document !== 'undefined' ? document.getElementById('workspace') : null;
      const rect = ws ? ws.getBoundingClientRect() : null;
      const model = RF.Geometry.viewToModel(e.clientX, e.clientY);
      const selected = (typeof DS !== 'undefined' && DS.getSelectedElements)
        ? DS.getSelectedElements()
        : [];
      const hitTest = getEngine('HitTestEngine');
      return {
        phase,
        pointerId: typeof e.pointerId === 'number' ? e.pointerId : null,
        pointerType: e.pointerType || 'mouse',
        button: typeof e.button === 'number' ? e.button : 0,
        buttons: typeof e.buttons === 'number' ? e.buttons : 0,
        detail: typeof e.detail === 'number' ? e.detail : 0,
        clientX: e.clientX,
        clientY: e.clientY,
        client: { x: e.clientX, y: e.clientY },
        workspace: rect ? { x: e.clientX - rect.left, y: e.clientY - rect.top } : { x: e.clientX, y: e.clientY },
        model,
        hit: hitTest ? {
          element: hitTest.elementAt(e.clientX, e.clientY),
          section: hitTest.sectionAt(e.clientX, e.clientY),
          handle: selected.length === 1 ? hitTest.handleAt(selected[0], e.clientX, e.clientY) : null,
        } : { element: null, section: null, handle: null },
        modifiers: {
          altKey: !!e.altKey,
          ctrlKey: !!e.ctrlKey,
          metaKey: !!e.metaKey,
          shiftKey: !!e.shiftKey,
        },
        target: e.target || null,
        originalEvent: e,
      };
    }

    function interactionEngine() {
      const selection = getEngine('SelectionEngine');
      if (
        selection &&
        typeof selection.onElementPointerDown === 'function' &&
        typeof selection.onHandlePointerDown === 'function'
      ) {
        return selection;
      }
      if (typeof console !== 'undefined' && console.error) {
        console.error('SELECTION OWNER MISSING IN CANONICAL RUNTIME: expected SelectionEngine');
      }
      return selection || null;
    }

    function routePointer(e, phase) {
      const event = normalizePointerEvent(e, phase);
      state.runtime.pipeline.lastPointerEvent = cloneSerializable({
        phase: event.phase,
        pointerId: event.pointerId,
        buttons: event.buttons,
        client: event.client,
        workspace: event.workspace,
        model: event.model,
        hit: {
          elementId: event.hit.element ? event.hit.element.id : null,
          sectionId: event.hit.section ? event.hit.section.id : null,
          handle: event.hit.handle,
        },
        modifiers: event.modifiers,
      });

      const selection = interactionEngine();
      const sectionResize = getEngine('SectionResizeEngine');
      const insert = getEngine('InsertEngine');
      const closest = selector => (
        event.target &&
        typeof event.target.closest === 'function' &&
        event.target.closest(selector)
      );
      const elementNode = closest('.cr-element');
      const handleNode = closest('.sel-handle');
      const sectionHandleNode = closest('.section-resize-handle');
      const interactionEngineName = selection === getEngine('SelectionEngine')
        ? 'SelectionEngine'
        : null;

      if (phase === 'down') {
        if (elementNode || handleNode) {
          traceElement('EngineCore', 'pointerdown', {
            id: elementNode ? (elementNode.dataset.id || null) : null,
            handle: handleNode ? (handleNode.dataset.pos || handleNode.dataset.handlePos || null) : null,
            target: targetSummary(event.target),
            elementId: elementNode ? (elementNode.dataset.id || null) : null,
            handlePos: handleNode ? (handleNode.dataset.pos || handleNode.dataset.handlePos || null) : null,
            interactionEngine: interactionEngineName,
          });
        }
        if (!closest('#ctx-menu')) {
          const ctx = getEngine('ContextMenuEngine');
          if (ctx && typeof ctx.hide === 'function') ctx.hide();
        }
        if (!closest('.menu-item') && !closest('.dropdown')) {
          const menu = getEngine('MenuEngine');
          if (menu && typeof menu.closeAll === 'function') menu.closeAll();
        }
        if (event.button === 0 && sectionHandleNode) {
          if (sectionResize && typeof sectionResize.onPointerDown === 'function') {
            sectionResize.onPointerDown(event, sectionHandleNode.dataset.sectionId);
          }
        } else if (event.button === 0 && handleNode) {
          if (selection && typeof selection.onHandlePointerDown === 'function') {
            const handlePos = handleNode.dataset.pos || handleNode.dataset.handlePos || null;
            traceElement('EngineCore', 'dispatch-handle-down', {
              id: event.hit.element ? event.hit.element.id : null,
              handle: handlePos,
              handlePos,
              engine: interactionEngineName,
            });
            selection.onHandlePointerDown(event, handlePos);
          }
        } else if (event.button === 0 && elementNode) {
          if (selection && typeof selection.onElementPointerDown === 'function') {
            traceElement('EngineCore', 'dispatch-element-down', {
              id: elementNode.dataset.id || null,
              elementId: elementNode.dataset.id || null,
              engine: interactionEngineName,
            });
            selection.onElementPointerDown(event, elementNode.dataset.id);
          }
        } else if (event.button === 0 && typeof DS !== 'undefined' && !DS.previewMode) {
          if (insert && typeof insert.onCanvasMouseDown === 'function') {
            traceElement('EngineCore', 'dispatch-canvas-down', { engine: 'InsertEngine' });
            insert.onCanvasMouseDown(event);
          }
        }
      } else if (phase === 'move') {
        if (sectionResize && sectionResize._drag && typeof sectionResize.onMouseMove === 'function') {
          sectionResize.onMouseMove(event);
        } else if (selection && typeof selection.onMouseMove === 'function') {
          selection.onMouseMove(event);
        }
      } else if (phase === 'up' || phase === 'cancel') {
        traceElement('EngineCore', phase === 'cancel' ? 'pointercancel' : 'pointerup', {
          id: event.hit.element ? event.hit.element.id : null,
          handle: event.hit.handle || null,
          interactionEngine: interactionEngineName,
        });
        if (sectionResize && typeof sectionResize.onMouseUp === 'function') {
          sectionResize.onMouseUp(event);
        }
        if (selection && typeof selection.onMouseUp === 'function') {
          traceElement('EngineCore', phase === 'cancel' ? 'dispatch-selection-cancel' : 'dispatch-selection-up', {
            id: event.hit.element ? event.hit.element.id : null,
            handle: event.hit.handle || null,
            cancel: phase === 'cancel',
            engine: interactionEngineName,
            dragType: selection._drag ? selection._drag.type || null : null,
          });
          selection.onMouseUp(event);
        }
      }

      return event;
    }

    return { normalizePointerEvent, interactionEngine, routePointer };
  }

  return { createEngineCoreRoutingPointer };
})();

if (typeof module !== 'undefined') {
  module.exports = { createEngineCoreRoutingPointer: EngineCoreRoutingPointer.createEngineCoreRoutingPointer };
}

if (typeof globalThis !== 'undefined') {
  globalThis.EngineCoreRoutingPointer = EngineCoreRoutingPointer;
}
