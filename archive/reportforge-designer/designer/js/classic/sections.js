import RF from '../rf.js';

/**
 * classic/sections.js — RF.Classic.Sections
 * Layer   : Classic UI
 * Purpose : Renders section label column (left sidebar) + section bodies +
 *           resize handles. Label column replaces old horizontal color bands.
 * Deps    : RF.Classic.Elements, RF.Classic.Inspector,
 *           RF.Core.DocumentModel, RF.UX.DragTools, RF.UX.Guides
 */

// Short abbreviations shown in the 22px label column
const SEC_ABBR = { rh:'RH', ph:'PH', gh:'GH', det:'D', gf:'GF', pf:'PF', rf:'RF' };

RF.Classic.Sections = {
  // kept for any external reference
  COLORS: { rh:'#1A3C5E',ph:'#1B4F72',gh:'#1E5F4A',det:'#2D5A2D',gf:'#7D5A10',pf:'#7D1F1F',rf:'#4A1F7D' },
  ICONS:  { rh:'RH',ph:'PH',gh:'GH',det:'D',gf:'GF',pf:'PF',rf:'RF' },

  render(container) {
    RF.clear(container);

    const labelCol = document.createElement('div');
    labelCol.id = 'sec-label-col-inner';
    labelCol.className = 'sec-label-col-inner';
    container.appendChild(labelCol);

    const DM = RF.Core.DocumentModel;

    DM.layout.sections.forEach(sec => {
      const { wrap, body } = this._buildSection(sec);
      container.appendChild(wrap);
      const cell = this._buildLabelCell(sec);
      labelCol.appendChild(cell);
    });

    RF.Engines.SectionLayoutEngine.syncAll();
    RF.Core.SelectionSystem.initLayer();
    RF.UX.Guides.init();
  },

  _buildSection(sec) {
    const DM = RF.Core.DocumentModel;

    const wrap = document.createElement('div');
    wrap.className     = `rf-section sec-${sec.stype}`;
    wrap.id            = `sec-${sec.id}`;
    wrap.dataset.secid = sec.id;

    const body = document.createElement('div');
    body.className     = 'rf-sec-body';
    body.id            = `secbody-${sec.id}`;
    body.dataset.secid = sec.id;

    DM.layout.elements
      .filter(e => e.sectionId === sec.id)
      .sort((a, b) => (a.zIndex||0) - (b.zIndex||0))
      .forEach(el => {
        const div = RF.Classic.Elements.renderDOM(el);
        body.appendChild(div);
        this.attachElementEvents(div);
      });

    wrap.appendChild(body);

    // Resize handle
    const rsz = document.createElement('div');
    rsz.className     = 'rf-sec-resize';
    rsz.id            = `secresize-${sec.id}`;
    rsz.title         = 'Drag to resize section';
    rsz.addEventListener('pointerdown', e => this._startResize(e, sec.id));
    wrap.appendChild(rsz);

    RF.Engines.SectionLayoutEngine.syncSection(sec);

    return { wrap, body };
  },

  _buildLabelCell(sec) {
    const cell = document.createElement('div');
    cell.className       = 'rf-sec-label-cell';
    cell.dataset.secid   = sec.id;
    cell.title           = sec.label + (sec.canGrow ? ' (Can Grow)' : '');

    const abbr = SEC_ABBR[sec.stype] || sec.stype.toUpperCase().slice(0,3);
    const txt  = document.createElement('span');
    txt.className   = 'rf-sec-label-text';
    txt.textContent = abbr;
    cell.appendChild(txt);

    // Can-grow indicator
    if (sec.canGrow) {
      const cg = document.createElement('span');
      cg.style.cssText = 'position:absolute;bottom:2px;left:50%;transform:translateX(-50%);font-size:8px;color:#666;';
      cg.textContent = '↕';
      cell.appendChild(cg);
    }

    cell.addEventListener('click',    ()  => this._selectSection(sec.id));
    cell.addEventListener('dblclick', ()  => this._editSection(sec));
    cell.addEventListener('contextmenu', e => { e.preventDefault(); this._sectionContextMenu(e, sec); });

    return cell;
  },

  // Sync label column heights after a section resize
  _syncLabelCol() {
    RF.Engines.SectionLayoutEngine.syncAll();
  },

  attachElementEvents(div) {
    const elid = div.dataset.elid;
    div.addEventListener('pointerenter', () => RF.emit(RF.E.STATUS, elid));
    div.addEventListener('pointerdown',  e => {
      if (e.target.dataset.handle) return;
      RF.UX.DragTools.startDrag(e, elid);
    });
    div.addEventListener('click', e => {
      if (Math.abs(e.movementX)>3||Math.abs(e.movementY)>3) return;
      RF.Sel.select(elid, e.ctrlKey||e.metaKey||e.shiftKey);
    });
    div.addEventListener('dblclick', e => {
      e.stopPropagation();
      const el = RF.Core.DocumentModel.getElementById(elid);
      if (el?.type==='text'||el?.type==='field') RF.Classic.Inspector.focusProp('content');
    });
  },

  attachNewElement(el) {
    const body = document.getElementById(`secbody-${el.sectionId}`);
    if (!body) return;
    const div = RF.Classic.Elements.renderDOM(el);
    body.appendChild(div);
    this.attachElementEvents(div);
    RF.Sel.select(el.id);
  },

  fullRender() {
    const surf = RF.DOM.canvasLayer();
    if (surf) this.render(surf);
    RF.Core.SelectionSystem.syncDOM();
    RF.Core.SelectionSystem.initLayer();
  },

  _selectSection(secId) {
    // Highlight label cell, clear element selection
    document.querySelectorAll('.rf-sec-label-cell').forEach(c => c.classList.remove('selected'));
    const cell = document.querySelector(`.rf-sec-label-cell[data-secid="${secId}"]`);
    if (cell) cell.classList.add('selected');
    RF.Sel.clear();
    RF.emit(RF.E.STATUS, `Section selected: ${secId}`);
  },

  _sectionContextMenu(e, sec) {
    // Minimal context menu for section labels
    const items = [
      { label: 'Section Expert…',   action: () => RF.Modules.SectionExpert?.open(sec.id) },
      { sep: true },
      { label: 'Insert Section Above', action: () => this._insertSectionAbove(sec) },
      { label: 'Delete Section',       action: () => this._deleteSection(sec), danger: true },
      { sep: true },
      { label: sec.suppress ? 'Unsuppress Section' : 'Suppress Section',
        action: () => { sec.suppress = !sec.suppress; this.fullRender(); RF.emit(RF.E.LAYOUT_CHANGED); } },
      { label: sec.canGrow ? '✓ Can Grow' : 'Can Grow',
        action: () => { sec.canGrow = !sec.canGrow; this.fullRender(); RF.emit(RF.E.LAYOUT_CHANGED); } },
    ];
    RF.UX.ContextMenu.showAt(e.clientX, e.clientY, items);
  },

  _insertSectionAbove(sec) {
    const DM  = RF.Core.DocumentModel;
    const idx = DM.layout.sections.indexOf(sec);
    if (idx < 0) return;
    const newSec = { id: RF.uid(), stype: sec.stype, label: sec.label + ' (2)', height: 60, elements: [], canGrow: false };
    DM.layout.sections.splice(idx, 0, newSec);
    RF.H.snapshot('insert-section');
    this.fullRender();
    RF.emit(RF.E.LAYOUT_CHANGED);
  },

  _deleteSection(sec) {
    const DM  = RF.Core.DocumentModel;
    if (DM.layout.sections.length <= 1) { RF.emit(RF.E.STATUS, 'Cannot delete the last section'); return; }
    DM.layout.sections = DM.layout.sections.filter(s => s !== sec);
    DM.layout.elements = DM.layout.elements.filter(e => e.sectionId !== sec.id);
    RF.H.snapshot('delete-section');
    this.fullRender();
    RF.emit(RF.E.LAYOUT_CHANGED);
  },

  _startResize(e, secId) {
    e.preventDefault();
    const sec    = RF.Core.DocumentModel.getSectionById(secId);
    if (!sec) return;
    const startY = e.clientY, startH = sec.height;
    RF.H.snapshot('before-sec-resize');
    const onMove = ev => {
      const dy = (ev.clientY - startY) / RF.Core.DocumentModel.zoom;
      RF.Engines.SectionLayoutEngine.setSectionHeight(secId, startH + dy);
      console.log('[trace sections:onMove]', secId, 'sec.height=', sec.height);
      RF.emit(RF.E.INSPECTOR_REFRESH);
      RF.emit(RF.E.STATUS, `Height: ${sec.height}px`);
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      console.log('[trace sections:onUp before emit]', secId, 'sec.height=', sec.height);
      RF.Core.DocumentModel.isDirty = true;
      RF.emit(RF.E.SECTION_RESIZED, { sectionId: secId });
      console.log('[trace sections:onUp after emit]', secId, 'sec.height=', sec.height);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  },

  _editSection(sec) {
    if (RF.Modules.SectionExpert?.open) RF.Modules.SectionExpert.open(sec.id);
    else RF.emit(RF.E.STATUS, `Section: ${sec.label}`);
  },
};
