'use strict';

const GuideRenderer = (() => {
  const GUIDE_COLOR = 'rgba(0, 120, 255, 0.7)';
  const GUIDE_COLOR_S = 'rgba(255, 80, 0, 0.75)';
  let _container = null;

  function _getContainer() {
    if (_container && _container.isConnected) return _container;
    _container = document.getElementById('guide-layer');
    if (!_container) {
      _container = document.createElement('div');
      _container.id = 'guide-layer';
      _container.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:50;overflow:visible';
      const cl = document.getElementById('canvas-layer');
      if (cl) cl.appendChild(_container);
    }
    return _container;
  }

  function _renderGuide(axis, modelPos, type) {
    const c = _getContainer();
    if (!c) return;
    const div = document.createElement('div');
    div.className = 'rf-guide-line';
    const color = type === 'spacing' ? GUIDE_COLOR_S : GUIDE_COLOR;

    if (axis === 'x') {
      const vx = RF.Geometry.scale(modelPos);
      div.style.cssText = [
        'position:absolute',
        `left:${vx}px`,
        'top:0', 'bottom:0',
        'width:1px',
        `background:${color}`,
        'pointer-events:none',
      ].join(';');
    } else {
      const vy = RF.Geometry.scale(modelPos);
      div.style.cssText = [
        'position:absolute',
        'left:0', 'right:0',
        `top:${vy}px`,
        'height:1px',
        `background:${color}`,
        'pointer-events:none',
      ].join(';');
    }
    c.appendChild(div);
  }

  function render(guides) {
    const c = _getContainer();
    if (!c) return;
    c.querySelectorAll('.rf-guide-line').forEach(el => el.remove());
    for (const g of guides || []) {
      _renderGuide(g.axis, g.modelPos, g.type || 'edge');
    }
  }

  function clear() {
    const c = _getContainer();
    if (c) c.querySelectorAll('.rf-guide-line').forEach(el => el.remove());
  }

  return { render, clear };
})();

if (typeof module !== 'undefined') module.exports = GuideRenderer;
