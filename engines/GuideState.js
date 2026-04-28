'use strict';

const GuideState = (() => {
  let _activeGuides = [];

  function setGuides(guides) {
    _activeGuides = guides || [];
  }

  function clearGuides() {
    _activeGuides = [];
  }

  function getGuides() {
    return _activeGuides;
  }

  function hasGuides() {
    return _activeGuides.length > 0;
  }

  return { setGuides, clearGuides, getGuides, hasGuides };
})();

if (typeof module !== 'undefined') module.exports = GuideState;
