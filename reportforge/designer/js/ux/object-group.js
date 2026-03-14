import RF from '../rf.js';

/**
 * ux/object-group.js — RF.UX.ObjectGroup
 * Layer   : UX / v4
 * Purpose : Group selected elements into a named logical group and ungroup
 *           them. Groups move and resize as a unit.
 * Deps    : RF.Core.DocumentModel
 */

RF.UX.ObjectGroup = {
  _groups: {},   // groupId → [elementIds]

  group() {
    const DM = RF.Core.DocumentModel;
    const sel = DM.selectedElements;
    if (sel.length < 2) { RF.emit(RF.E.STATUS,'Select 2+ elements to group'); return; }
    RF.H.snapshot('before-group');
    const gid = RF.uid('grp');
    sel.forEach(el => {
      el.groupId = gid;
      el.grouped = true;
      const div = document.getElementById(`el-${el.id}`);
      if (div) div.classList.add('grouped');
    });
    this._groups[gid] = sel.map(e=>e.id);
    DM.isDirty = true;
    RF.emit(RF.E.STATUS, `Grouped ${sel.length} elements (${gid})`);
    this._drawGroupBox(gid);
  },

  ungroupEl(elId) {
    const DM  = RF.Core.DocumentModel;
    const el  = DM.getElementById(elId); if(!el||!el.groupId) return;
    RF.H.snapshot('before-ungroup');
    const gid = el.groupId;
    const ids = this._groups[gid]||[];
    ids.forEach(id => {
      const e = DM.getElementById(id);
      if (e) { delete e.groupId; e.grouped=false; }
      const div = document.getElementById(`el-${id}`);
      if (div) div.classList.remove('grouped');
    });
    delete this._groups[gid];
    DM.isDirty=true;
    RF.emit(RF.E.STATUS,'Ungrouped');
    this._removeGroupBox(gid);
  },

  // When clicking a grouped element, select the whole group
  handleGroupClick(elId, additive) {
    const DM  = RF.Core.DocumentModel;
    const el  = DM.getElementById(elId); if(!el) return false;
    if (!el.groupId) return false;
    const ids = this._groups[el.groupId]||[];
    if (!additive) DM.selectedIds.clear();
    ids.forEach(id => DM.selectedIds.add(id));
    RF.emit(RF.E.SEL_CHANGED);
    return true;
  },

  _drawGroupBox(gid) {
    const els = (this._groups[gid]||[])
      .map(id=>RF.Core.DocumentModel.getElementById(id)).filter(Boolean);
    if (!els.length) return;
    const secId = els[0].sectionId;
    const body  = document.getElementById(`secbody-${secId}`);
    if (!body) return;
    const minX=Math.min(...els.map(e=>e.x)), minY=Math.min(...els.map(e=>e.y));
    const maxX=Math.max(...els.map(e=>e.x+e.w)), maxY=Math.max(...els.map(e=>e.y+e.h));
    const box = document.createElement('div');
    box.className='group-box'; box.dataset.gid=gid;
    box.style.cssText=`left:${minX-4}px;top:${minY-4}px;width:${maxX-minX+8}px;height:${maxY-minY+8}px`;
    body.appendChild(box);
  },

  _removeGroupBox(gid) {
    document.querySelectorAll(`.group-box[data-gid="${gid}"]`).forEach(d=>d.remove());
  },
};


// ── v4: Aspect-ratio resize + resize preview outline ─────────────────────────
