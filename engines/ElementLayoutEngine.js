/**
 * ElementLayoutEngine — ReportForge v19 Phase 3
 * ─────────────────────────────────────────────────────────────────
 * Applies model-space element geometry to DOM elements.
 *
 * The zoom root now scales the document container as a unit, so element
 * writers must keep raw model coordinates here. The container transform is
 * responsible for the view-space scaling.
 */
'use strict';

const ElementLayoutEngine = (() => {
  /**
   * Apply position + size to a single element's div.
   * @param {object} el   — DS element (model space)
   * @param {HTMLElement} div
   */
  function applyElement(el, div) {
    if (!div || !el) return;

    div.style.left     = `${el.x}px`;
    div.style.top      = `${el.y}px`;
    div.style.width    = `${el.w}px`;
    div.style.height   = `${el.h}px`;
    div.style.fontSize = `${el.fontSize * 96 / 72}px`;
  }

  /**
   * Apply layout for all elements in a section.
   * @param {string} sectionId
   */
  function applySection(sectionId) {
    if (typeof DS === 'undefined') return;
    DS.elements.filter(el => el.sectionId === sectionId).forEach(el => {
      const div = document.querySelector(`.cr-element[data-id="${el.id}"]`);
      applyElement(el, div);
    });
  }

  /** Apply layout for all elements across all sections */
  function applyAll() {
    if (typeof DS === 'undefined') return;
    DS.elements.forEach(el => {
      const div = document.querySelector(`.cr-element[data-id="${el.id}"]`);
      applyElement(el, div);
    });
  }

  let _rafId = null;
  function _schedule() {
    if (typeof RenderScheduler !== 'undefined') {
      RenderScheduler.layout(applyAll, 'ElementLayoutEngine.applyAll');
    } else {
      if (_rafId) return;
      _rafId = requestAnimationFrame(() => { _rafId = null; applyAll(); });
    }
  }

  return {
    /** Apply layout to one element immediately */
    apply: applyElement,

    /** Apply layout to all elements in a section immediately */
    applySection,

    /** Apply layout to all elements (batched rAF) */
    update() { _schedule(); },

    /** Apply layout to all elements (synchronous — boot only) */
    updateSync() {
      if (typeof RenderScheduler !== 'undefined') {
        RenderScheduler.assertDomWriteAllowed('ElementLayoutEngine.updateSync');
      }
      applyAll();
    },

    /**
     * Move an element by delta in MODEL SPACE.
     * Returns the updated {x, y} (floating point, not rounded).
     *
     * @param {object} el
     * @param {number} dxModel   — delta in model units
     * @param {number} dyModel
     * @param {number} [grid]    — snap grid (model units, 0 = no snap)
     * @returns {{ x: number, y: number }}
     */
    moveElement(el, dxModel, dyModel, grid = 0) {
      let newX = el.x + dxModel;
      let newY = el.y + dyModel;
      if (grid > 0) {
        newX = Math.round(newX / grid) * grid;
        newY = Math.round(newY / grid) * grid;
      }
      el.x = newX;
      el.y = newY;
      const div = document.querySelector(`.cr-element[data-id="${el.id}"]`);
      applyElement(el, div);
      return { x: newX, y: newY };
    },

    /**
     * Resize an element by delta in MODEL SPACE.
     * @param {object} el
     * @param {number} dwModel
     * @param {number} dhModel
     * @param {number} [minSize]  — minimum dimension in model units
     */
    resizeElement(el, dwModel, dhModel, minSize = 4) {
      el.w = Math.max(minSize, el.w + dwModel);
      el.h = Math.max(minSize, el.h + dhModel);
      const div = document.querySelector(`.cr-element[data-id="${el.id}"]`);
      applyElement(el, div);
      return { w: el.w, h: el.h };
    },
  };
})();

if (typeof module !== 'undefined') module.exports = ElementLayoutEngine;
