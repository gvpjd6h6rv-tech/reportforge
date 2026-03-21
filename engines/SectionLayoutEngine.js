/**
 * SectionLayoutEngine — ReportForge v19 Phase 3
 * ─────────────────────────────────────────────────────────────────
 * Manages the view-space rendering of section containers.
 * Sections store model-space heights (section.height).
 * This engine converts to view space and applies to DOM.
 *
 * Architecture rule:
 *   section.height   → MODEL SPACE (never changes with zoom)
 *   div.style.height → RF.Geometry.scale(section.height)
 */
'use strict';

const SectionLayoutEngine = (() => {
  let _rafId = null;
  const _layoutCache = new Map();

  function _setStyleIfChanged(style, prop, value) {
    if (style[prop] !== value) style[prop] = value;
  }

  function _computeLayoutContract() {
    if (typeof DS === 'undefined') {
      return { pageWidth: 0, totalHeight: 0, sections: [] };
    }

    const pageWidth = RF.Geometry.scale(CFG.PAGE_W);
    let top = 0;
    const sections = DS.sections.map(sec => {
      const height = RF.Geometry.scale(sec.height);
      const contract = {
        id: sec.id,
        top,
        height,
        visible: sec.visible !== false,
      };
      top += height;
      return contract;
    });

    return { pageWidth, totalHeight: top, sections };
  }

  function _apply() {
    if (typeof DS === 'undefined') return;

    const contract = _computeLayoutContract();
    contract.sections.forEach(sec => {
      const div = document.querySelector(`.cr-section[data-section-id="${sec.id}"]`);
      if (!div) return;
      const next = {
        display: sec.visible ? '' : 'none',
        height: `${sec.height}px`,
        width: `${contract.pageWidth}px`,
        top: sec.top,
      };
      const prev = _layoutCache.get(sec.id);
      if (prev &&
          prev.display === next.display &&
          prev.height === next.height &&
          prev.width === next.width &&
          prev.top === next.top) {
        return;
      }

      _setStyleIfChanged(div.style, 'display', next.display);
      _setStyleIfChanged(div.style, 'height', next.height);
      _setStyleIfChanged(div.style, 'width', next.width);
      _layoutCache.set(sec.id, next);
    });
  }

  function _schedule() {
    if (typeof RenderScheduler !== 'undefined') {
      RenderScheduler.layout(_apply, 'SectionLayoutEngine._apply');
    } else {
      if (_rafId) return;
      _rafId = requestAnimationFrame(() => {
        _rafId = null;
        _apply();
      });
    }
  }

  return {
    update()     { _schedule(); },
    updateSync() { _apply(); },

    getSectionBand(sectionId) {
      const contract = _computeLayoutContract();
      for (const sec of contract.sections) {
        if (sec.id === sectionId) return { y: sec.top, h: sec.height };
      }
      return { y: 0, h: 0 };
    },

    getTotalViewHeight() {
      return _computeLayoutContract().totalHeight;
    },

    getLayoutContract() {
      return _computeLayoutContract();
    },
  };
})();

if (typeof module !== 'undefined') module.exports = SectionLayoutEngine;
