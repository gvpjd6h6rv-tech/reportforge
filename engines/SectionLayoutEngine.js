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

  function _apply() {
    if (typeof DS === 'undefined') return;

    console.log('🔥 REAL SectionLayoutEngine._apply', {
      sections: Array.isArray(DS?.sections) ? DS.sections.map(sec => ({ id: sec.id, height: sec.height })) : 'no-sections'
    });

    const scaledPageW = RF.Geometry.scale(CFG.PAGE_W);

    DS.sections.forEach(sec => {
      const div = document.querySelector(`.cr-section[data-section-id="${sec.id}"]`);
      if (!div) return;
      const rect = div.getBoundingClientRect();
      console.log('🔥 SEC POS', sec.id, 'modelH=', sec.height, 'domH=', div.style.height, 'top=', rect.top);

      if (sec.visible === false) {
        div.style.display = 'none';
        return;
      }

      div.style.display = '';
      div.style.height  = `${RF.Geometry.scale(sec.height)}px`;
      div.style.width   = `${scaledPageW}px`;
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
    update()     { console.log('🔥 REAL SectionLayoutEngine.update'); _schedule(); },
    updateSync() { console.log('🔥 REAL SectionLayoutEngine.updateSync'); _apply(); },

    getSectionBand(sectionId) {
      if (typeof DS === 'undefined') return { y: 0, h: 0 };
      let y = 0;
      for (const sec of DS.sections) {
        const h = RF.Geometry.scale(sec.height);
        if (sec.id === sectionId) return { y, h };
        y += h;
      }
      return { y: 0, h: 0 };
    },

    getTotalViewHeight() {
      if (typeof DS === 'undefined') return 0;
      return DS.sections.reduce((s, sec) => s + RF.Geometry.scale(sec.height), 0);
    },
  };
})();

if (typeof module !== 'undefined') module.exports = SectionLayoutEngine;
