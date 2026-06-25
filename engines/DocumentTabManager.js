'use strict';

(function () {
  var _tabs        = [];
  var _activeTabId = null;
  var _counter     = 0;

  function _newId() {
    return 'tab-' + (++_counter) + '-' + Math.random().toString(36).slice(2, 7);
  }

  function _makeTabRecord(opts) {
    return {
      id:                 _newId(),
      name:               opts.name       || 'Reporte',
      fileHandle:         opts.fileHandle || null,
      _savedHistoryIndex: -1,
      snapshot:           null,
      _domNode:           null,
    };
  }

  function _getTab(id) {
    for (var i = 0; i < _tabs.length; i++) {
      if (_tabs[i].id === id) return _tabs[i];
    }
    return null;
  }

  // DS and CommandRuntimeFile are global in both browser and vm-test context.
  function _ds()  { return (typeof DS !== 'undefined')                 ? DS                 : null; }
  function _crf() { return (typeof CommandRuntimeFile !== 'undefined') ? CommandRuntimeFile : null; }

  function _snapshotCurrentIntoTab(tab) {
    if (!tab) return;
    var DS  = _ds();
    var CRF = _crf();
    if (!DS) return;
    var s  = DS.state || {};
    var ws = (typeof document !== 'undefined') ? document.getElementById('workspace') : null;
    tab.snapshot = {
      sections:       (DS.sections || []).map(function (sec) { return Object.assign({}, sec); }),
      elements:       (DS.elements || []).map(function (el)  { return Object.assign({}, el);  }),
      zoom:           (typeof s.zoom        === 'number') ? s.zoom        : 1.0,
      zoomDesign:     (typeof s.zoomDesign  === 'number') ? s.zoomDesign  : 1.0,
      zoomPreview:    (typeof s.zoomPreview === 'number') ? s.zoomPreview : 1.0,
      gridVisible:    s.gridVisible  !== false,
      snapToGrid:     s.snapToGrid   !== false,
      previewMode:    !!s.previewMode,
      pageMarginLeft: (typeof s.pageMarginLeft === 'number') ? s.pageMarginLeft : 0,
      pageMarginTop:  (typeof s.pageMarginTop  === 'number') ? s.pageMarginTop  : 0,
      history:        Array.isArray(s.history) ? s.history.slice() : [],
      historyIndex:   (typeof s.historyIndex   === 'number') ? s.historyIndex   : -1,
      scrollLeft:     ws ? (ws.scrollLeft || 0) : 0,
      scrollTop:      ws ? (ws.scrollTop  || 0) : 0,
      layoutMeta: (CRF && CRF._currentLayout) ? {
        name:      CRF._currentLayout.name      || 'Reporte',
        version:   CRF._currentLayout.version   || '1.0',
        pageWidth: CRF._currentLayout.pageWidth || 754,
        pageSize:  CRF._currentLayout.pageSize  || 'A4',
        docType:   CRF._currentLayout.docType   || null,
        margins:   CRF._currentLayout.margins   || null,
      } : null,
    };
    if (CRF) tab.fileHandle = CRF._currentLayoutFileHandle || tab.fileHandle || null;
  }

  function _restoreTabToDS(tab) {
    if (!tab || !tab.snapshot) return;
    var snap = tab.snapshot;
    var DS   = _ds();
    var CRF  = _crf();
    if (!DS) return;
    var s = DS.state;

    DS.setSections(snap.sections.map(function (sec) { return Object.assign({}, sec); }),
      'DocumentTabManager.activate');
    DS.setElements(snap.elements.map(function (el)  { return Object.assign({}, el);  }),
      'DocumentTabManager.activate');
    DS.clearSelectionState('DocumentTabManager.activate');

    if (s) {
      s.zoom           = snap.zoom;
      s.zoomDesign     = snap.zoomDesign;
      s.zoomPreview    = snap.zoomPreview;
      s.history        = snap.history.slice();
      s.historyIndex   = snap.historyIndex;
      s.pageMarginLeft = snap.pageMarginLeft;
      s.pageMarginTop  = snap.pageMarginTop;
      s.previewMode    = !!snap.previewMode;
    }

    var ws = (typeof document !== 'undefined') ? document.getElementById('workspace') : null;
    if (ws) { ws.scrollLeft = snap.scrollLeft || 0; ws.scrollTop = snap.scrollTop || 0; }

    if (CRF && snap.layoutMeta) {
      CRF._currentLayout          = Object.assign({}, snap.layoutMeta);
      CRF._currentLayoutFileHandle = tab.fileHandle || null;
    }
    if (snap.layoutMeta && snap.layoutMeta.name) tab.name = snap.layoutMeta.name;

    if (typeof SectionEngine      !== 'undefined' && SectionEngine.render)         SectionEngine.render();
    if (typeof SelectionEngine    !== 'undefined' && SelectionEngine.clearSelection) SelectionEngine.clearSelection();
    if (typeof CanvasLayoutEngine !== 'undefined' && CanvasLayoutEngine.renderAll)  CanvasLayoutEngine.renderAll();
    if (typeof DesignZoomEngine   !== 'undefined' && DesignZoomEngine.set)          DesignZoomEngine.set(snap.zoom || 1.0);
    if (DS && typeof DS._updateUndoRedo === 'function') DS._updateUndoRedo();
  }

  function _appendTabDOM(tab) {
    var tabsRow = (typeof document !== 'undefined') ? document.getElementById('tabs-row') : null;
    if (!tabsRow) return;
    var node    = document.createElement('div');
    node.classList.add('file-tab');
    node.dataset.tabId = tab.id;
    node.textContent   = tab.name + ' ';
    var closeBtn = document.createElement('span');
    closeBtn.classList.add('close-tab');
    closeBtn.textContent = '✕';
    node.appendChild(closeBtn);
    node.addEventListener('click', function (e) {
      if (e.target && e.target.classList && e.target.classList.contains('close-tab')) {
        closeTab(tab.id);
        return;
      }
      activate(tab.id);
    });
    tab._domNode = node;
    // Insert before .sub-tabs to maintain visual order
    var subTabs = (typeof tabsRow.querySelector === 'function') ? tabsRow.querySelector('.sub-tabs') : null;
    if (subTabs && typeof tabsRow.insertBefore === 'function') {
      tabsRow.insertBefore(node, subTabs);
    } else {
      tabsRow.appendChild(node);
    }
  }

  function _setActiveDOMTab(newId) {
    var tabsRow = (typeof document !== 'undefined') ? document.getElementById('tabs-row') : null;
    if (!tabsRow) return;
    var allTabs = tabsRow.querySelectorAll('.file-tab');
    for (var i = 0; i < allTabs.length; i++) allTabs[i].classList.remove('active');
    var target = tabsRow.querySelector('[data-tab-id="' + newId + '"]');
    if (target) target.classList.add('active');
  }

  function _defaultSections() {
    var DS = _ds();
    return (DS ? DS.sections || [] : []).map(function (s) {
      return Object.assign({}, s, { height: s.stype === 'det' ? 14 : 60 });
    });
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  function _registerInitialTab() {
    var DS  = _ds();
    var CRF = _crf();
    var name   = (CRF && typeof CRF._currentLayoutName === 'function')
      ? (CRF._currentLayoutName() || 'Reporte') : 'Reporte';
    var handle = CRF ? (CRF._currentLayoutFileHandle || null) : null;
    var tab    = _makeTabRecord({ name: name, fileHandle: handle });
    tab._savedHistoryIndex = (DS && DS.state && typeof DS.state.historyIndex === 'number')
      ? DS.state.historyIndex : 0;
    _tabs.push(tab);
    _activeTabId = tab.id;
    _appendTabDOM(tab);
    _setActiveDOMTab(tab.id);
  }

  function create() {
    var DS  = _ds();
    var CRF = _crf();

    var currentTab = _getTab(_activeTabId);
    if (currentTab) _snapshotCurrentIntoTab(currentTab);

    if (DS) {
      var defSections = _defaultSections();
      DS.setSections(defSections, 'DocumentTabManager.create');
      DS.setElements([],          'DocumentTabManager.create');
      DS.clearSelectionState('DocumentTabManager.create');
      if (DS.state) {
        DS.state.history        = [];
        DS.state.historyIndex   = -1;
        DS.state.zoom           = 1.0;
        DS.state.zoomDesign     = 1.0;
        DS.state.zoomPreview    = 1.0;
        DS.state.pageMarginLeft = 0;
        DS.state.pageMarginTop  = 0;
        DS.state.previewMode    = false;
      }
      if (typeof DS.saveHistory === 'function') DS.saveHistory();
    }

    if (CRF) {
      CRF._currentLayout = {
        name:      'Nuevo reporte',
        version:   '1.0',
        pageWidth: (typeof CFG !== 'undefined' && CFG.PAGE_W) || 754,
        pageSize:  'A4',
        docType:   null,
        margins:   null,
      };
      CRF._currentLayoutFileHandle = null;
    }

    var newTab = _makeTabRecord({ name: 'Nuevo reporte', fileHandle: null });
    newTab._savedHistoryIndex = (DS && DS.state && typeof DS.state.historyIndex === 'number')
      ? DS.state.historyIndex : 0;
    _tabs.push(newTab);
    _appendTabDOM(newTab);
    _setActiveDOMTab(newTab.id);
    _activeTabId = newTab.id;

    if (typeof SectionEngine   !== 'undefined' && SectionEngine.render)          SectionEngine.render();
    if (typeof SelectionEngine !== 'undefined' && SelectionEngine.clearSelection) SelectionEngine.clearSelection();
  }

  // Called by CommandRuntimeFile._applyLoadedLayout BEFORE _refreshEditor runs.
  // Snapshots current tab and registers a new tab record; DS update is done by
  // _refreshEditor. Call updateCurrent + markCurrentSaved after _refreshEditor.
  function _switchToNewTab(name, fileHandle) {
    var currentTab = _getTab(_activeTabId);
    if (currentTab) _snapshotCurrentIntoTab(currentTab);
    var newTab = _makeTabRecord({ name: name || 'Reporte', fileHandle: fileHandle || null });
    _tabs.push(newTab);
    _appendTabDOM(newTab);
    _setActiveDOMTab(newTab.id);
    _activeTabId = newTab.id;
  }

  // Used by unit tests and for future extension (e.g. drag-to-open).
  // Unlike _switchToNewTab + external _refreshEditor, this self-contained
  // function applies both the tab switch AND the DS content in one call.
  function openInNewTab(layout, fileHandle) {
    var DS  = _ds();
    var CRF = _crf();

    var currentTab = _getTab(_activeTabId);
    if (currentTab) _snapshotCurrentIntoTab(currentTab);

    var name     = (layout && layout.name) || 'Reporte';
    var sections = Array.isArray(layout && layout.sections)
      ? layout.sections.map(function (s) { return Object.assign({}, s); }) : [];
    var elements = Array.isArray(layout && layout.elements)
      ? layout.elements.map(function (e) { return Object.assign({}, e); }) : [];

    if (DS) {
      DS.setSections(sections, 'DocumentTabManager.openInNewTab');
      DS.setElements(elements, 'DocumentTabManager.openInNewTab');
      DS.clearSelectionState('DocumentTabManager.openInNewTab');
      if (DS.state) {
        DS.state.history      = [];
        DS.state.historyIndex = -1;
        DS.state.zoom         = (layout && typeof layout.zoom === 'number') ? layout.zoom : 1.0;
      }
      if (typeof DS.saveHistory === 'function') DS.saveHistory();
    }

    if (CRF && layout) {
      CRF._currentLayout = {
        name:      name,
        version:   layout.version  || '1.0',
        pageWidth: layout.pageWidth || 754,
        pageSize:  layout.pageSize  || 'A4',
        docType:   layout.docType   || null,
        margins:   layout.margins   || null,
      };
      CRF._currentLayoutFileHandle = fileHandle || null;
    }

    var newTab = _makeTabRecord({ name: name, fileHandle: fileHandle || null });
    newTab._savedHistoryIndex = (DS && DS.state && typeof DS.state.historyIndex === 'number')
      ? DS.state.historyIndex : 0;
    _tabs.push(newTab);
    _appendTabDOM(newTab);
    _setActiveDOMTab(newTab.id);
    _activeTabId = newTab.id;

    if (typeof SectionEngine   !== 'undefined' && SectionEngine.render)          SectionEngine.render();
    if (typeof SelectionEngine !== 'undefined' && SelectionEngine.clearSelection) SelectionEngine.clearSelection();
  }

  function activate(id) {
    if (id === _activeTabId) return;
    var currentTab = _getTab(_activeTabId);
    var targetTab  = _getTab(id);
    if (!targetTab) return;
    if (currentTab) _snapshotCurrentIntoTab(currentTab);
    _restoreTabToDS(targetTab);
    _setActiveDOMTab(id);
    _activeTabId = id;
  }

  function updateCurrent(opts) {
    if (!opts) return;
    var CRF = _crf();
    var tab = _getTab(_activeTabId);
    if (!tab) return;
    if (opts.name !== undefined) {
      tab.name = opts.name;
      if (CRF && CRF._currentLayout) CRF._currentLayout.name = opts.name;
      if (tab._domNode) {
        var first = tab._domNode.childNodes && tab._domNode.childNodes[0];
        if (first && first.nodeValue !== undefined) {
          first.nodeValue = opts.name + ' ';
        } else {
          tab._domNode.textContent = opts.name + ' ';
        }
      }
    }
    if (opts.fileHandle !== undefined) {
      tab.fileHandle = opts.fileHandle;
      if (CRF) CRF._currentLayoutFileHandle = opts.fileHandle;
    }
  }

  function markCurrentSaved() {
    var DS  = _ds();
    var tab = _getTab(_activeTabId);
    if (!tab) return;
    tab._savedHistoryIndex = (DS && DS.state && typeof DS.state.historyIndex === 'number')
      ? DS.state.historyIndex : 0;
  }

  function isCurrentDirty() {
    var DS  = _ds();
    var tab = _getTab(_activeTabId);
    if (!tab) return false;
    var cur = (DS && DS.state && typeof DS.state.historyIndex === 'number')
      ? DS.state.historyIndex : 0;
    return cur !== tab._savedHistoryIndex;
  }

  function _isTabDirty(tab) {
    if (!tab) return false;
    if (tab.id !== _activeTabId) {
      // inactive tab: compare against its snapshot historyIndex (already flushed)
      var snapIdx = (tab.snapshot && typeof tab.snapshot.historyIndex === 'number')
        ? tab.snapshot.historyIndex : 0;
      return snapIdx !== tab._savedHistoryIndex;
    }
    // active tab: compare live DS state
    var DS = _ds();
    var cur = (DS && DS.state && typeof DS.state.historyIndex === 'number')
      ? DS.state.historyIndex : 0;
    return cur !== tab._savedHistoryIndex;
  }

  function closeTab(id) {
    if (_tabs.length <= 1) return;   // last tab — never close
    var tab = _getTab(id);
    if (!tab) return;

    if (_isTabDirty(tab)) {
      var ok = (typeof window !== 'undefined' && typeof window.confirm === 'function')
        ? window.confirm('¿Cerrar sin guardar? Los cambios se perderán.')
        : true;
      if (!ok) return;
    }

    var idx     = _tabs.indexOf(tab);
    _tabs.splice(idx, 1);
    if (tab._domNode && tab._domNode.parentNode) tab._domNode.parentNode.removeChild(tab._domNode);

    if (_activeTabId === id) {
      var next = _tabs[idx] || _tabs[idx - 1];
      _restoreTabToDS(next);
      _setActiveDOMTab(next.id);
      _activeTabId = next.id;
    }
  }

  function getActive() { return _getTab(_activeTabId); }
  function getTabs()   { return _tabs.slice(); }

  var DocumentTabManager = {
    _registerInitialTab: _registerInitialTab,
    _switchToNewTab:     _switchToNewTab,
    create:              create,
    openInNewTab:        openInNewTab,
    activate:            activate,
    closeTab:            closeTab,
    updateCurrent:       updateCurrent,
    markCurrentSaved:    markCurrentSaved,
    isCurrentDirty:      isCurrentDirty,
    getActive:           getActive,
    getTabs:             getTabs,
  };

  if (typeof window !== 'undefined') window.DocumentTabManager = DocumentTabManager;
  if (typeof module !== 'undefined') module.exports = DocumentTabManager;
})();
