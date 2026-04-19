'use strict';

const AlignmentGuides = {
  _guides: [],
  _threshold: 3,
  clear() {
    this._guides.forEach(g => g.remove());
    this._guides = [];
  },
  show(elId) {
    this.clear();
    const overlay = document.getElementById('guide-layer');
    if (!overlay) return;
    const draggedDiv = document.querySelector(`.cr-element[data-id="${elId}"]`);
    if (!draggedDiv) return;

    const dRect = draggedDiv.getBoundingClientRect();
    const dL = dRect.left, dT = dRect.top, dR = dRect.right, dB = dRect.bottom;
    const vW = window.innerWidth, vH = window.innerHeight;

    document.querySelectorAll('.cr-element').forEach(div => {
      if (div === draggedDiv) return;
      const r = div.getBoundingClientRect();
      const oL = r.left, oT = r.top, oR = r.right, oB = r.bottom;

      const addH = (y) => {
        const g = document.createElement('div');
        g.className = 'rf-guide rf-guide-h snap-guide h';
        g.style.top = Math.round(y) + 'px';
        g.style.left = '0'; g.style.width = vW + 'px';
        overlay.appendChild(g); this._guides.push(g);
      };
      const addV = (x) => {
        const g = document.createElement('div');
        g.className = 'rf-guide rf-guide-v snap-guide v';
        g.style.left = Math.round(x) + 'px';
        g.style.top = '0'; g.style.height = vH + 'px';
        overlay.appendChild(g); this._guides.push(g);
      };

      const T = this._threshold;
      if (Math.abs(dT - oT) < T) addH(oT); if (Math.abs(dT - oB) < T) addH(oB);
      if (Math.abs(dB - oT) < T) addH(oT); if (Math.abs(dB - oB) < T) addH(oB);
      if (Math.abs(dL - oL) < T) addV(oL); if (Math.abs(dL - oR) < T) addV(oR);
      if (Math.abs(dR - oL) < T) addV(oL); if (Math.abs(dR - oR) < T) addV(oR);
    });
  },
};

if (typeof module !== 'undefined') module.exports = AlignmentGuides;
