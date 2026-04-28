'use strict';

const KeyboardRegistry = (() => {
  const _handlers = Object.create(null);

  function _key(combo) {
    return (typeof KeyboardCombo !== 'undefined' && typeof KeyboardCombo.normalizeCombo === 'function')
      ? KeyboardCombo.normalizeCombo(combo)
      : String(combo || '').toLowerCase();
  }

  function register(combo, fn) {
    _handlers[_key(combo)] = fn;
  }

  function off(combo) {
    delete _handlers[_key(combo)];
  }

  function get(combo) {
    return _handlers[_key(combo)] || null;
  }

  function trigger(combo, event) {
    const fn = get(combo);
    if (!fn) return false;
    fn(event);
    return true;
  }

  function clear() {
    Object.keys(_handlers).forEach((key) => { delete _handlers[key]; });
  }

  return {
    register,
    off,
    get,
    trigger,
    clear,
  };
})();

if (typeof module !== 'undefined') module.exports = KeyboardRegistry;
