// ─────────────────────────────────────────────────────────────────────────────
// sections/sections.js  –  Report sections  (features 34–38)
// Renders section bands and handles height dragging.
// ─────────────────────────────────────────────────────────────────────────────
RF.Sections = {

  STYPE_META: {
    rh:  { label: 'Report Header',  abbr: 'RH',  color: '#3B4A6B', icon: '⊤' },
    ph:  { label: 'Page Header',    abbr: 'PH',  color: '#2E5E8E', icon: '▤' },
    gh:  { label: 'Group Header',   abbr: 'GH',  color: '#1B6B5E', icon: '▼' },
    det: { label: 'Detail',         abbr: 'D',   color: '#2D5A2D', icon: '≡' },
    gf:  { label: 'Group Footer',   abbr: 'GF',  color: '#5E5B1B', icon: '▲' },
    pf:  { label: 'Page Footer',    abbr: 'PF',  color: '#5E2E2E', icon: '▥' },
    rf:  { label: 'Report Footer',  abbr: 'RF',  color: '#4A2E6B', icon: '⊥' },
  },

  MIN_HEIGHT: 14,

  /** Build the full canvas surface from current layout */
  render(container) {
    container.innerHTML = '';
    const s = RF.AppState;

    s.layout.sections.forEach(sec => {
      const wrap = this._buildSection(sec, s.layout.pageWidth);
      container.appendChild(wrap);
    });

    // Attach selection-handles layer
    RF.SelectionHandles.init();
  },

  _buildSection(sec, pageWidth) {
    const meta = this.STYPE_META[sec.stype] || { label: sec.label, abbr: '?', color: '#444', icon: '■' };

    const wrap = document.createElement('div');
    wrap.className       = 'rf-section';
    wrap.id              = `sec-${sec.id}`;
    wrap.dataset.secid   = sec.id;
    wrap.style.cssText   = `width:${pageWidth}px;position:relative;flex-shrink:0;`;

    // ── Label bar ─────────────────────────────────────────────────
    const label = document.createElement('div');
    label.className     = 'rf-sec-label';
    label.style.cssText = `
      height:20px;display:flex;align-items:center;padding:0 6px;gap:6px;
      background:${meta.color};color:#EEE;font-size:10px;font-weight:600;
      letter-spacing:.5px;user-select:none;cursor:default;
      border-top:1px solid rgba(255,255,255,.1);
    `;
    label.innerHTML = `
      <span style="opacity:.7">${meta.icon}</span>
      <span>${meta.label}</span>
      <span style="margin-left:auto;opacity:.6;font-weight:400">${sec.height}px</span>
    `;
    wrap.appendChild(label);

    // ── Body (where elements live) ────────────────────────────────
    const body = document.createElement('div');
    body.className       = 'rf-sec-body';
    body.id              = `secbody-${sec.id}`;
    body.dataset.secid   = sec.id;
    body.style.cssText   = `
      position:relative;width:${pageWidth}px;height:${sec.height}px;
      background:#FEFEFE;overflow:hidden;border-bottom:1px solid #D0D8E0;
    `;

    // Elements that belong to this section
    RF.AppState.layout.elements
      .filter(e => e.sectionId === sec.id)
      .sort((a, b) => (a.zIndex||0) - (b.zIndex||0))
      .forEach(el => {
        const div = RF.ElementFactory.renderDOM(el);
        body.appendChild(div);
        this._attachElementEvents(div);
      });

    wrap.appendChild(body);

    // ── Resize handle ─────────────────────────────────────────────
    const rsz = document.createElement('div');
    rsz.className       = 'rf-sec-resize';
    rsz.dataset.secid   = sec.id;
    rsz.title           = 'Drag to resize section';
    rsz.style.cssText   = `
      height:4px;background:${meta.color};opacity:.4;cursor:ns-resize;
      transition:opacity .15s;width:${pageWidth}px;
    `;
    rsz.addEventListener('mouseenter', () => rsz.style.opacity = '1');
    rsz.addEventListener('mouseleave', () => rsz.style.opacity = '.4');
    rsz.addEventListener('mousedown',  e => this._startSectionResize(e, sec.id));
    wrap.appendChild(rsz);

    return wrap;
  },

  _attachElementEvents(div) {
    div.addEventListener('mouseenter', () => {
      RF.AppState.hoveredId = div.dataset.elid;
      div.classList.add('hovered');
      RF.EventBus.emit('status', `${div.dataset.elid}`);
    });
    div.addEventListener('mouseleave', () => {
      RF.AppState.hoveredId = null;
      div.classList.remove('hovered');
    });
    div.addEventListener('mousedown', e => {
      // Check if clicking a resize handle
      if (e.target.dataset.handle) return;
      RF.Drag.startDrag(e, div.dataset.elid);
    });
    div.addEventListener('click', e => {
      if (Math.abs(e.movementX) > 3 || Math.abs(e.movementY) > 3) return;
      RF.Selection.select(div.dataset.elid, e.ctrlKey || e.metaKey || e.shiftKey);
    });
    div.addEventListener('dblclick', e => {
      e.stopPropagation();
      const el = RF.AppState.getElementById(div.dataset.elid);
      if (el && (el.type === 'text' || el.type === 'field')) {
        RF.PropertyInspector.focusField('content');
      }
    });
  },

  /** Section height resize drag */
  _startSectionResize(e, secId) {
    e.preventDefault();
    const sec    = RF.AppState.getSectionById(secId);
    if (!sec) return;
    const startY = e.clientY;
    const startH = sec.height;

    RF.History.snapshot('before-sec-resize');

    const onMove = ev => {
      const dy = (ev.clientY - startY) / RF.AppState.zoom;
      sec.height = Math.max(this.MIN_HEIGHT, Math.round(startH + dy));

      const body = document.getElementById(`secbody-${secId}`);
      if (body) body.style.height = sec.height + 'px';

      // Update the height label
      const lbl = document.querySelector(`#sec-${secId} .rf-sec-label span:last-child`);
      if (lbl) lbl.textContent = sec.height + 'px';

      RF.EventBus.emit('inspector:refresh');
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      RF.AppState.isDirty = true;
      RF.EventBus.emit('status', `Section height: ${sec.height}px`);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  },

  /** Fully re-render sections (used after undo/redo) */
  fullRender() {
    const surface = document.getElementById('canvas-surface');
    if (!surface) return;
    this.render(surface);
    RF.EventBus.emit('selection:changed');
  },

  /** Add a new element to the canvas body and attach events */
  attachNewElement(el) {
    const body = document.getElementById(`secbody-${el.sectionId}`);
    if (!body) return;
    const div = RF.ElementFactory.renderDOM(el);
    body.appendChild(div);
    this._attachElementEvents(div);
    RF.Selection.select(el.id);
  },
};
