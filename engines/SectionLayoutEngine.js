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
  let _lastContractSignature = null;

  function _px(value) {
    return `${Math.round(value)}px`;
  }

  function _trace(event, payload) {
    if (typeof window === 'undefined' || typeof window.rfTrace !== 'function') return;
    if (!window.DebugTrace?.isEnabled('runtime')) return;
    const frame = (typeof RenderScheduler !== 'undefined' && typeof RenderScheduler.frame === 'number')
      ? RenderScheduler.frame
      : null;
    window.rfTrace('runtime', event, {
      frame,
      source: 'SectionLayoutEngine',
      phase: 'layout',
      payload: payload || null,
    });
  }

  function _computeLayoutContract() {
    if (typeof DS === 'undefined') {
      return { ready: false, pageWidth: 0, totalHeight: 0, sections: [] };
    }

    const pageWidth = Math.round(RF.Geometry.scale(CFG.PAGE_W));
    let top = 0;
    const sections = DS.sections.map(sec => {
      const height = Math.round(RF.Geometry.scale(sec.height));
      const band = {
        id: sec.id,
        top: Math.round(top),
        height,
        visible: sec.visible !== false,
      };
      top += height;
      return band;
    });

    return {
      ready: true,
      pageWidth,
      totalHeight: top,
      sections,
    };
  }

  function _apply() {
    if (typeof DS === 'undefined') return;
    const contract = _computeLayoutContract();
    const signature = JSON.stringify(contract);
    if (_lastContractSignature === signature) return;
    _lastContractSignature = signature;
    _trace('updateSync-apply', {
      sectionsCount: contract.sections.length,
      totalHeight: contract.totalHeight,
      pageWidth: contract.pageWidth,
    });

    contract.sections.forEach(sec => {
      const div = document.querySelector(`.cr-section[data-section-id="${sec.id}"]`);
      if (!div) return;

      const nextDisplay = sec.visible === false ? 'none' : '';
      const nextHeight = _px(sec.height);
      const nextWidth = _px(contract.pageWidth);
      if (div.style.display !== nextDisplay) div.style.display = nextDisplay;
      if (div.style.height !== nextHeight) div.style.height = nextHeight;
      if (div.style.width !== nextWidth) div.style.width = nextWidth;
    });
  }

  function _schedule() {
    if (typeof RenderScheduler !== 'undefined') {
      RenderScheduler.invalidateLayer('layout', 'SectionLayoutEngine');
    }
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
    update()     {
      const contract = _computeLayoutContract();
      _trace('update-schedule', {
        sectionsCount: contract.sections.length,
        totalHeight: contract.totalHeight,
      });
      _schedule();
    },
    updateSync() {
      if (typeof RenderScheduler !== 'undefined') {
        RenderScheduler.assertDomWriteAllowed('SectionLayoutEngine.updateSync');
      }
      const contract = _computeLayoutContract();
      _trace('updateSync-enter', {
        sectionsCount: contract.sections.length,
        totalHeight: contract.totalHeight,
      });
      _apply();
    },

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

    getLayoutContract() {
      return _computeLayoutContract();
    },
  };
})();

if (typeof module !== 'undefined') module.exports = SectionLayoutEngine;
