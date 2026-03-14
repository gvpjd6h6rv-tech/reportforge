// ─────────────────────────────────────────────────────────────────────────────
// interaction/snap.js  –  Snap to grid & elements  (features 4–5)
// ─────────────────────────────────────────────────────────────────────────────
RF.Snap = {
  THRESHOLD: 6,   // pixels – snap if within this distance

  /** Snap a single (x, y) candidate position */
  snapPoint(x, y, elId = null) {
    const s = RF.AppState;
    let sx = x, sy = y;

    if (s.snapToGrid) {
      sx = RF.Utils.snap(x, s.gridSize);
      sy = RF.Utils.snap(y, s.gridSize);
    }

    if (s.snapToElements) {
      const result = this._snapToElements(sx, sy, elId);
      sx = result.x;
      sy = result.y;
    }

    return { x: sx, y: sy };
  },

  /** Snap element (x,y,w,h) to neighbour edges */
  snapElement(x, y, w, h, elId) {
    const s = RF.AppState;
    let sx = x, sy = y;

    if (s.snapToGrid) {
      sx = RF.Utils.snap(x, s.gridSize);
      sy = RF.Utils.snap(y, s.gridSize);
    }

    if (s.snapToElements) {
      const snapped = this._snapRectToElements(sx, sy, w, h, elId);
      sx = snapped.x;
      sy = snapped.y;
      this._showGuides(snapped.guides);
    } else {
      this._clearGuides();
    }

    return { x: sx, y: sy };
  },

  _snapToElements(x, y, skipId) {
    const others = RF.AppState.layout.elements.filter(e => e.id !== skipId);
    const T = this.THRESHOLD;
    let sx = x, sy = y;

    for (const o of others) {
      // snap x to left/right/center of other element
      if (Math.abs(x - o.x)           < T) sx = o.x;
      if (Math.abs(x - (o.x+o.w))     < T) sx = o.x + o.w;
      if (Math.abs(x - (o.x+o.w/2))   < T) sx = o.x + o.w / 2;
      // snap y
      if (Math.abs(y - o.y)           < T) sy = o.y;
      if (Math.abs(y - (o.y+o.h))     < T) sy = o.y + o.h;
      if (Math.abs(y - (o.y+o.h/2))   < T) sy = o.y + o.h / 2;
    }
    return { x: sx, y: sy };
  },

  _snapRectToElements(x, y, w, h, skipId) {
    const others = RF.AppState.layout.elements.filter(e => e.id !== skipId);
    const T = this.THRESHOLD;
    let sx = x, sy = y;
    const guides = [];

    const tryX = (cand, gx) => {
      if (Math.abs(sx - cand) < T) { sx = cand; guides.push({o:'v', p:gx}); }
    };
    const tryY = (cand, gy) => {
      if (Math.abs(sy - cand) < T) { sy = cand; guides.push({o:'h', p:gy}); }
    };

    for (const o of others) {
      // left edges
      tryX(o.x,         o.x);
      tryX(o.x + o.w,   o.x + o.w);
      tryX(o.x - w,     o.x);        // right of this aligns to left of other
      tryX(o.x + o.w/2 - w/2, o.x + o.w/2);  // centers align
      // top edges
      tryY(o.y,         o.y);
      tryY(o.y + o.h,   o.y + o.h);
      tryY(o.y - h,     o.y);
      tryY(o.y + o.h/2 - h/2, o.y + o.h/2);
    }
    return { x: sx, y: sy, guides };
  },

  _showGuides(guides) {
    // Emit guide lines for canvas to render
    RF.EventBus.emit('snap:guides', guides);
  },

  _clearGuides() {
    RF.EventBus.emit('snap:guides', []);
  },
};
