import RF from '../rf.js';

RF.Engines.CanvasLayoutEngine = {
  WRITES: Object.freeze(['#canvas-surface.width', '#canvas-surface.height']),

  sync() {
    const surface = RF.DOM?.canvasLayer?.();
    const layout = RF.Core.DocumentModel?.layout;
    if (!surface || !layout) return;

    const styles = window.getComputedStyle(surface);
    const padLeft   = parseFloat(styles.paddingLeft)   || 0;
    const padRight  = parseFloat(styles.paddingRight)  || 0;
    const padTop    = parseFloat(styles.paddingTop)    || 0;
    const padBottom = parseFloat(styles.paddingBottom) || 0;

    const sectionsHeight = (layout.sections ?? []).reduce(
      (total, section) => total + Math.max(0, Number(section.height) || 0),
      0
    );

    const width  = Math.max(0, (layout.pageWidth ?? 0) + padLeft + padRight);
    const height = Math.max(0, sectionsHeight + padTop + padBottom);

    surface.style.width = `${width}px`;
    surface.style.height = `${height}px`;
  },
};

export default RF;
