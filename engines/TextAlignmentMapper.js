'use strict';

(function initTextAlignmentMapper(global) {
  const _VALIGN_FLEX = { top: 'flex-start', middle: 'center', bottom: 'flex-end' };

  function valignToFlex(valign) {
    return _VALIGN_FLEX[valign] || 'center';
  }

  global.TextAlignmentMapper = { valignToFlex };
})(window);
