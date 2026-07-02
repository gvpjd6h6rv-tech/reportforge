'use strict';

const EngineCoreRoutingPointerHelpers = (() => {
  function createEngineCoreRoutingPointerHelpers(deps = {}) {
    const state = deps.state || {};
    const getEngine = typeof deps.getEngine === 'function' ? deps.getEngine : () => null;
    const traceElement = typeof deps.traceElement === 'function' ? deps.traceElement : () => {};
    const targetSummary = typeof deps.targetSummary === 'function' ? deps.targetSummary : () => null;
    const cloneSerializable = typeof deps.cloneSerializable === 'function'
      ? deps.cloneSerializable
      : (value) => JSON.parse(JSON.stringify(value));
    // RF-INTERACTION-AUDIT-1 (BUG NEW 4): Design-mode hover highlight, kept
    // in the same closure/module as click routing so both share the exact
    // same HitTestResolver call — Preview's equivalent lives in
    // PreviewHoverOutline.js (separate visible overlay, since .pv-el sits in
    // an opacity:0 hit-layer), fixed to use the same resolver too.
    let _hoverNode = null;

    // RF-INTERACTION-AUDIT-1 (BUG NEW 5): at high zoom the synthetic
    // scrollbar (position:fixed, z-index:150 — see SyntheticScrollbarEngine
    // .js / canvas.css) can visually sit directly over the document. A
    // pointer there is genuinely NOT on interactive report content, but
    // HitTestResolver's elementsFromPoint-based candidate search has no
    // concept of "topmost opaque UI chrome" — it only filters by CSS
    // selector, so it happily returns a .cr-element/.pv-el hidden underneath
    // the scrollbar. Proven live: hover/selection changed while the pointer
    // sat on the scrollbar thumb at 200%/400% zoom (never at 100%, where the
    // document doesn't reach the scrollbar). This guard runs BEFORE any
    // HitTestResolver call or selection/insert dispatch, so chrome pixels
    // are excluded up front instead of trying to teach the resolver about
    // UI chrome it has no business knowing about.
    function isPointerOnDesignerChrome(event) {
      const target = event && event.target;
      return !!(target && typeof target.closest === 'function' &&
        target.closest('.rf-scrollbar-track, .rf-scrollbar-thumb'));
    }

    function _clearHover() {
      if (_hoverNode) _hoverNode.classList.remove('rf-hit-hover');
      _hoverNode = null;
    }

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

    function resolvePreviewTargetId(event, pvElNode, selBoxNode, handleNode) {
      let targetId;
      if (pvElNode) {
        targetId = pvElNode.dataset.originId || pvElNode.dataset.id;
      } else if (selBoxNode || handleNode) {
        targetId = [...DS.selection][0];
      }
      return targetId || (event.hit.element ? event.hit.element.id : null);
    }

    function dispatchPreviewDown(event, selection, targetId, interactionEngineName, pvElNode) {
      if (!targetId || !selection || typeof selection.onElementPointerDown !== 'function') return;
      // RF-DESIGN-PREVIEW-DBLCLICK-EDIT-PARITY-1: prefer the ALREADY-resolved
      // pvElNode (the exact row instance actually under the pointer) over a
      // fresh querySelector — for a repeating detail-row element there are N
      // .pv-el[data-origin-id] nodes (one per row), and querySelector always
      // returns the FIRST one in DOM order regardless of which row was
      // clicked. That wrong node then gets pointer-captured, retargeting the
      // matching mouseup/click (and any dblclick built from them) back to
      // row 0 even when row N was clicked.
      const pv = pvElNode || document.querySelector(`.pv-el[data-origin-id="${targetId}"], .cr-element[data-id="${targetId}"]`);
      const delegatedEvent = pv ? { ...event, target: pv } : event;
      traceElement('EngineCore', 'dispatch-preview-element-down', {
        id: targetId,
        elementId: targetId,
        engine: interactionEngineName,
      });
      selection.onElementPointerDown(delegatedEvent, targetId);
    }

    function dismissMenus(closest) {
      if (!closest('#ctx-menu')) {
        const ctxMenu = getEngine('ContextMenuEngine');
        if (ctxMenu && typeof ctxMenu.hide === 'function') ctxMenu.hide();
      }
      if (!closest('.menu-item') && !closest('.dropdown')) {
        const menu = getEngine('MenuEngine');
        if (menu && typeof menu.closeAll === 'function') menu.closeAll();
      }
    }

    function dispatchDesignDown(event, ctx) {
      const { handleNode, elementNode, selection, sectionResize, sectionHandleNode,
        insert, interactionEngineName } = ctx;
      if (sectionHandleNode) {
        if (sectionResize && typeof sectionResize.onPointerDown === 'function') {
          sectionResize.onPointerDown(event, sectionHandleNode.dataset.sectionId);
        }
      } else if (handleNode) {
        if (selection && typeof selection.onHandlePointerDown === 'function') {
          const handlePos = handleNode.dataset.pos || handleNode.dataset.handlePos || null;
          traceElement('EngineCore', 'dispatch-handle-down', {
            id: event.hit.element ? event.hit.element.id : null,
            handle: handlePos, handlePos, engine: interactionEngineName,
          });
          selection.onHandlePointerDown(event, handlePos);
        }
      } else if (elementNode) {
        if (selection && typeof selection.onElementPointerDown === 'function') {
          traceElement('EngineCore', 'dispatch-element-down', {
            id: elementNode.dataset.id || null,
            elementId: elementNode.dataset.id || null,
            engine: interactionEngineName,
          });
          selection.onElementPointerDown(event, elementNode.dataset.id);
        }
      } else if (insert && typeof insert.onCanvasMouseDown === 'function') {
        traceElement('EngineCore', 'dispatch-canvas-down', { engine: 'InsertEngine' });
        insert.onCanvasMouseDown(event);
      }
    }

    function tracePointerDown(event, elementNode, handleNode, interactionEngineName) {
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
    }

    function routePreviewPointerDown(event, selection, pvElNode, selBoxNode, handleNode, interactionEngineName) {
      const targetId = resolvePreviewTargetId(event, pvElNode, selBoxNode, handleNode);
      if (handleNode && selection && typeof selection.onHandlePointerDown === 'function') {
        const handlePos = handleNode.dataset.pos || handleNode.dataset.handlePos || null;
        traceElement('EngineCore', 'dispatch-preview-handle-down', {
          id: targetId,
          handle: handlePos,
          handlePos,
          engine: interactionEngineName,
        });
        selection.onHandlePointerDown(event, handlePos);
        return;
      }
      dispatchPreviewDown(event, selection, targetId, interactionEngineName, pvElNode);
    }

    function routeDown(event, ctx) {
      const { closest, elementNode, handleNode, pvElNode, selBoxNode,
        selection, insert, interactionEngineName } = ctx;
      tracePointerDown(event, elementNode, handleNode, interactionEngineName);
      dismissMenus(closest);
      if (event.button !== 0) return;
      if (DS.previewMode) {
        if (pvElNode || selBoxNode || handleNode) {
          routePreviewPointerDown(event, selection, pvElNode, selBoxNode, handleNode, interactionEngineName);
          return;
        }
        // RF-PREVIEW-INSERT-CLICK-POSITION-1: click landed on empty Preview
        // canvas (no existing element/handle under the pointer). If an insert
        // tool is armed, route it to InsertEngine exactly like Design's
        // dispatchDesignDown does for its own empty-canvas case, instead of
        // silently dropping the click.
        if (insert && DS.tool !== 'pointer' && typeof insert.onCanvasMouseDown === 'function') {
          traceElement('EngineCore', 'dispatch-preview-canvas-down', { engine: 'InsertEngine' });
          insert.onCanvasMouseDown(event);
        }
        return;
      }
      if (!DS.previewMode) {
        dispatchDesignDown(event, ctx);
      }
    }

    function updateHoverHighlight(event, selection) {
      if (typeof HitTestResolver === 'undefined' || typeof document === 'undefined') return;
      if (typeof DS !== 'undefined' && DS.previewMode) return; // Preview: PreviewHoverOutline.js owns this
      if (selection && selection._drag) return; // no flicker mid drag/resize/insert/rubber
      const node = HitTestResolver.resolve(event.clientX, event.clientY, { selector: '.cr-element', idAttr: 'id' });
      if (node === _hoverNode) return;
      _clearHover();
      _hoverNode = node;
      if (_hoverNode) _hoverNode.classList.add('rf-hit-hover');
    }

    function routeMove(event, selection, sectionResize) {
      updateHoverHighlight(event, selection);
      if (sectionResize && sectionResize._drag && typeof sectionResize.onMouseMove === 'function') {
        sectionResize.onMouseMove(event);
      } else if (selection && typeof selection.onMouseMove === 'function') {
        selection.onMouseMove(event);
      }
    }

    function routeUp(event, selection, sectionResize, interactionEngineName) {
      traceElement('EngineCore', event.phase === 'cancel' ? 'pointercancel' : 'pointerup', {
        id: event.hit.element ? event.hit.element.id : null,
        handle: event.hit.handle || null,
        interactionEngine: interactionEngineName,
      });
      if (sectionResize && typeof sectionResize.onMouseUp === 'function') {
        sectionResize.onMouseUp(event);
      }
      if (selection && typeof selection.onMouseUp === 'function') {
        traceElement('EngineCore', event.phase === 'cancel' ? 'dispatch-selection-cancel' : 'dispatch-selection-up', {
          id: event.hit.element ? event.hit.element.id : null,
          handle: event.hit.handle || null,
          cancel: event.phase === 'cancel',
          engine: interactionEngineName,
          dragType: selection._drag ? selection._drag.type || null : null,
        });
        selection.onMouseUp(event);
      }
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

      // BUG NEW 5 guard: must run before HitTestResolver.resolve, before
      // elementNode/pvElNode resolution, before InsertEngine, before
      // SelectionEngine.startRubberBand / selection. A drag legitimately
      // started on real canvas content (selection._drag / sectionResize
      // ._drag already active) must keep tracking smoothly even if the
      // pointer transiently crosses the scrollbar strip — only a NEW
      // interaction is refused here; nothing already in progress is cut off.
      if (isPointerOnDesignerChrome(event)) {
        const dragAlreadyActive = !!(selection && selection._drag) || !!(sectionResize && sectionResize._drag);
        if (phase === 'move') {
          if (!dragAlreadyActive) { _clearHover(); return event; }
        } else if (phase === 'down') {
          return event;
        }
        // 'up'/'cancel' phases always fall through to routeUp below so any
        // drag that DID start legitimately on canvas can still terminate
        // cleanly, even if it ends with the pointer over the scrollbar.
      }

      const closest = selector => (
        event.target &&
        typeof event.target.closest === 'function' &&
        event.target.closest(selector)
      );
      // BUG NEW 4: closest('.cr-element'|'.pv-el') trusted the browser's
      // native topmost element at the point, which a same-z-index, later-
      // in-DOM decorative frame (e.g. a transparent rect wrapping fields)
      // wins by pure DOM-order tie-break — regardless of a smaller, more
      // specific element sitting right under the same pixel. HitTestResolver
      // collects every candidate and picks the right one; falls back to the
      // original closest() if the resolver script hasn't loaded for some
      // reason (defensive, should not happen in the shipped app).
      const elementNode = (typeof HitTestResolver !== 'undefined')
        ? HitTestResolver.resolve(event.clientX, event.clientY, { selector: '.cr-element', idAttr: 'id' })
        : closest('.cr-element');
      const pvElNode = (typeof HitTestResolver !== 'undefined')
        ? HitTestResolver.resolve(event.clientX, event.clientY, { selector: '.pv-el', idAttr: 'originId' })
        : closest('.pv-el');
      const selBoxNode = closest('.sel-box');
      const handleNode = closest('.sel-handle');
      const sectionHandleNode = closest('.section-resize-handle');
      const interactionEngineName = selection === getEngine('SelectionEngine')
        ? 'SelectionEngine'
        : null;

      if (phase === 'down') {
        routeDown(event, {
          closest,
          elementNode,
          pvElNode,
          selBoxNode,
          handleNode,
          sectionHandleNode,
          selection,
          sectionResize,
          insert,
          interactionEngineName,
        });
      } else if (phase === 'move') {
        routeMove(event, selection, sectionResize);
      } else if (phase === 'up' || phase === 'cancel') {
        routeUp(event, selection, sectionResize, interactionEngineName);
      }

      return event;
    }

    return { normalizePointerEvent, interactionEngine, routePointer };
  }

  return { createEngineCoreRoutingPointerHelpers };
})();

if (typeof module !== 'undefined') {
  module.exports = {
    createEngineCoreRoutingPointerHelpers: EngineCoreRoutingPointerHelpers.createEngineCoreRoutingPointerHelpers,
  };
}

if (typeof globalThis !== 'undefined') {
  globalThis.EngineCoreRoutingPointerHelpers = EngineCoreRoutingPointerHelpers;
}
