'use strict';

const DocumentHistory = (() => {
  function syncViewsAfterHistoryChange(global, state) {
    if (typeof SectionEngine !== 'undefined' && typeof SectionEngine.render === 'function') {
      SectionEngine.render();
    }
    if (typeof _canonicalCanvasWriter === 'function') {
      _canonicalCanvasWriter().renderAll();
    } else if (typeof CanvasLayoutEngine !== 'undefined' && typeof CanvasLayoutEngine.renderAll === 'function') {
      CanvasLayoutEngine.renderAll();
    }
    if (state.previewMode && typeof _canonicalPreviewWriter === 'function') {
      _canonicalPreviewWriter().refresh();
    } else if (state.previewMode && typeof PreviewEngineV19 !== 'undefined' && typeof PreviewEngineV19.refresh === 'function') {
      PreviewEngineV19.refresh();
    }
    if (typeof SelectionEngine !== 'undefined' && typeof SelectionEngine.renderHandles === 'function') {
      SelectionEngine.renderHandles();
    }
    if (typeof PropertiesEngine !== 'undefined' && typeof PropertiesEngine.render === 'function') {
      PropertiesEngine.render();
    }
    if (typeof FormatEngine !== 'undefined' && typeof FormatEngine.updateToolbar === 'function') {
      FormatEngine.updateToolbar();
    }
  }

  function createDocumentHistory(state, notify, global) {
    return Object.freeze({
      saveHistory() {
        const snapshot = JSON.stringify({
          sections: state.sections.map((section) => ({ ...section })),
          elements: state.elements.map((element) => ({ ...element })),
        });
        state.history = state.history.slice(0, state.historyIndex + 1);
        state.history.push(snapshot);
        if (state.history.length > 80) state.history.shift();
        state.historyIndex = state.history.length - 1;
        this.updateUndoRedo();
      },
      undo() {
        if (state.historyIndex <= 0) return;
        state.historyIndex -= 1;
        const snapshot = JSON.parse(state.history[state.historyIndex]);
        state.sections = snapshot.sections;
        state.elements = snapshot.elements;
        state.selection.clear();
        if (typeof notify === 'function') notify();
        syncViewsAfterHistoryChange(global, state);
        this.updateUndoRedo();
      },
      redo() {
        if (state.historyIndex >= state.history.length - 1) return;
        state.historyIndex += 1;
        const snapshot = JSON.parse(state.history[state.historyIndex]);
        state.sections = snapshot.sections;
        state.elements = snapshot.elements;
        state.selection.clear();
        if (typeof notify === 'function') notify();
        syncViewsAfterHistoryChange(global, state);
        this.updateUndoRedo();
      },
      updateUndoRedo() {
        const undoButton = global.document && global.document.getElementById('btn-undo');
        const redoButton = global.document && global.document.getElementById('btn-redo');
        if (undoButton) undoButton.classList.toggle('disabled', state.historyIndex <= 0);
        if (redoButton) redoButton.classList.toggle('disabled', state.historyIndex >= state.history.length - 1);
      },
    });
  }

  return { createDocumentHistory };
})();

if (typeof module !== 'undefined') {
  module.exports = DocumentHistory;
}

