import RF from '../rf.js';

/**
 * modules/map-editor.js — RF.Modules.MapEditor
 * Layer   : Modules (v4)
 * Purpose : Map element editor. Bind a geographic field, choose map type
 *           (choropleth, bubble), and configure color scale.
 * Deps    : RF.Core.DocumentModel
 */

RF.Modules.MapEditor = {
  _el:null,
  init() { RF.on('mapobj:open', elId=>this.open(elId)); },

  open(elId) {
    this._close();
    const el=RF.Core.DocumentModel.getElementById(elId); if(!el) return;
    const TYPES=['choropleth','bubble','proportional','density','dot-density'];
    const ov=document.createElement('div'); ov.className='modal-overlay';
    ov.append(RF.html(`
    <div class="modal modal-w-480">
      <div class="modal-hdr">
        <span>🗺 Map Designer — ${elId}</span>
        <button class="modal-close" onclick="RF.Modules.MapEditor._close()">×</button>
      </div>
      <div class="modal-body">
        <div class="pi-section u-mt-0">Map Type</div>
        <div class="u-pad-wrap5">
          ${TYPES.map(t=>`)<button class="modal-btn ${el.mapType===t?'primary':''} u-fs-11" onclick="this.closest('.modal').querySelectorAll('.modal-btn:not(.primary)').forEach(b=>b.classList.remove('primary'));this.classList.add('primary');document.getElementById('map-type').value='${t}'">${t}</button>`).join('')}
        </div>
        <input type="hidden" id="map-type" value="${el.mapType||'choropleth'}">
        <div class="pi-section">Data Binding</div>
        <div class="pi-row"><label class="u-mw-110">Location field</label>
          <input id="map-loc" type="text" value="${el.locationField||''}" placeholder="e.g. customer.country" class="u-input-mono"></div>
        <div class="pi-row"><label class="u-mw-110">Value field</label>
          <input id="map-val" type="text" value="${el.valueField||''}" placeholder="e.g. items.total" class="u-input-mono"></div>
        <div class="pi-section">Appearance</div>
        <div class="pi-row"><label class="u-mw-110">Title</label>
          <input id="map-title" type="text" value="${el.mapTitle||''}" placeholder="Map title" class="u-flex-1 u-input"></div>
        <div class="pi-row"><label class="u-mw-110">Color scheme</label>
          <select id="map-scheme" class="u-flex-1 u-input">
            ${['Blues','Reds','Greens','Purples','Oranges','YlOrRd','BuGn'].map(c=>`<option ${el.colorScheme===c?'selected':''}>${c}</option>`).join('')}
          </select></div>
        <div class="pi-checks">
          <label class="pi-check"><input id="map-legend" type="checkbox" ${el.showLegend!==false?'checked':''}><span>Show legend</span></label>
          <label class="pi-check"><input id="map-labels" type="checkbox" ${el.showLabels?'checked':''}><span>Show region labels</span></label>
        </div>
      </div>
      <div class="modal-footer">
        <button class="modal-btn" onclick="RF.Modules.MapEditor._close()">Cancel</button>
        <button class="modal-btn primary" onclick="RF.Modules.MapEditor.save('${elId}')">Apply</button>
      </div>
    </div>`));
    document.body.appendChild(ov); this._el=ov;
  },

  save(elId) {
    RF.H.snapshot('before-map');
    RF.Core.DocumentModel.updateElement(elId,{
      mapType:      document.getElementById('map-type')?.value||'choropleth',
      locationField:document.getElementById('map-loc')?.value||'',
      valueField:   document.getElementById('map-val')?.value||'',
      mapTitle:     document.getElementById('map-title')?.value||'',
      colorScheme:  document.getElementById('map-scheme')?.value||'Blues',
      showLegend:   document.getElementById('map-legend')?.checked!==false,
      showLabels:   document.getElementById('map-labels')?.checked||false,
    });
    RF.RP.syncElement(RF.Core.DocumentModel.getElementById(elId));
    RF.emit(RF.E.STATUS,'Map configured');
    this._close();
  },
  _close() { this._el?.remove(); this._el=null; },
};


// ═══════════════════════════════════════════════════════════════════════════
// v4: Enhanced Field Drag Ghost + Section Drop Preview
// ═══════════════════════════════════════════════════════════════════════════
