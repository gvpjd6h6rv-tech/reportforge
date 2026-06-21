'use strict';

(function initCommandRuntimeHandlersSelectionDispatch(global) {
  const { dispatchActionMap } = global.CommandRuntimeShared;

  function handleSelectionCommands(action) {
    return dispatchActionMap(action, {
      undo() { DS.undo(); SectionEngine.render(); SelectionEngine.clearSelection(); },
      redo() { DS.redo(); SectionEngine.render(); SelectionEngine.clearSelection(); },
      cut() { CommandEngine.cut(); },
      copy() { CommandEngine.copy(); },
      paste() { CommandEngine.paste(); },
      delete() { CommandEngine.delete(); },
      'select-all': () => CommandEngine.selectAll(),
      'align-lefts': () => CommandEngine.alignLefts(),
      'align-centers': () => CommandEngine.alignCenters(),
      'align-rights': () => CommandEngine.alignRights(),
      'align-tops': () => CommandEngine.alignTops(),
      'align-middles': () => CommandEngine.alignMiddles(),
      'align-bottoms': () => CommandEngine.alignBottoms(),
      'same-width': () => CommandEngine.sameWidth(),
      'same-height': () => CommandEngine.sameHeight(),
      'bring-front': () => CommandEngine.bringFront(),
      'send-back': () => CommandEngine.sendBack(),
      'bring-forward': () => CommandEngine.bringForward && CommandEngine.bringForward(),
      'send-backward': () => CommandEngine.sendBackward && CommandEngine.sendBackward(),
      group: () => CommandEngine.group && CommandEngine.group(),
      ungroup: () => CommandEngine.ungroup && CommandEngine.ungroup(),
      'invert-selection': () => CommandEngine.invertSelection && CommandEngine.invertSelection(),
      'lock-object': () => CommandEngine.lockObject && CommandEngine.lockObject(),
      'unlock-object': () => CommandEngine.unlockObject && CommandEngine.unlockObject(),
      'hide-object': () => CommandEngine.hideObject && CommandEngine.hideObject(),
      'show-object': () => CommandEngine.showObject && CommandEngine.showObject(),
      'deselect-all': () => { DS.clearSelectionState('CommandRuntimeHandlers.deselectAll'); SelectionEngine.renderHandles && SelectionEngine.renderHandles(); },
    });
  }

  global.CommandRuntimeHandlersSelectionDispatch = { handleSelectionCommands };
})(window);
