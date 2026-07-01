'use strict';
/**
 * BorderMapper
 *
 * Single responsibility: receive a format.borders config,
 * return { cssString, inlineStyles } for per-side border rendering.
 * No DOM. No DS. No events.
 *
 * config = {
 *   top: boolean,
 *   right: boolean,
 *   bottom: boolean,
 *   left: boolean,
 *   style: "solid" | "none",
 *   color: string,  // CSS color
 * }
 */
(function initBorderMapper(global) {

  const SIDES = ['top', 'right', 'bottom', 'left'];

  function mapBorders(config) {
    if (!config) return { cssString: '', inlineStyles: {} };
    const style = config.style || 'solid';
    const color = config.color || '#000000';
    const parts  = [];
    const inline = {};

    SIDES.forEach(function(side) {
      const prop = 'border' + side.charAt(0).toUpperCase() + side.slice(1);
      if (config[side]) {
        const val = '1px ' + style + ' ' + color;
        parts.push(prop.replace(/([A-Z])/g, '-$1').toLowerCase() + ':' + val + ';');
        inline[prop] = val;
      } else {
        inline[prop] = '';
      }
    });

    return { cssString: parts.join(''), inlineStyles: inline };
  }

  global.BorderMapper = { mapBorders };
  if (typeof module !== 'undefined') module.exports = { mapBorders };

})(typeof window !== 'undefined' ? window : globalThis);
