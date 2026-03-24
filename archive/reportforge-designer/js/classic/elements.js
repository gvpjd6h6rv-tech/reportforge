import RF from '../rf.js';

/**
 * classic/elements.js — RF.Classic.Elements
 * Layer   : Classic UI
 * Purpose : Element type registry (DEFAULTS), DOM factory (create),
 *           renderContent (type-specific inner HTML), and applyStyle.
 *           Includes v4 element types: barcode, crosstab, richtext, mapobj.
 * Deps    : none (used by Core.RenderPipeline and Classic.Sections)
 */

RF.Classic.Elements = {

  DEFAULTS: {
    text:  {w:120,h:16,fontFamily:'Arial',fontSize:9,bold:false,italic:false,underline:false,align:'left',color:'#000',bgColor:'transparent',borderWidth:0,borderColor:'#000',borderStyle:'solid',content:'Text',zIndex:0,canGrow:false,wordWrap:false},
    field: {w:120,h:14,fontFamily:'Arial',fontSize:9,bold:false,italic:false,underline:false,align:'left',color:'#000',bgColor:'transparent',borderWidth:0,borderColor:'#000',borderStyle:'solid',fieldPath:'',fieldFmt:null,zIndex:0,suppressIfEmpty:false},
    line:  {w:100,h:2,lineDir:'h',lineWidth:1,color:'#000',zIndex:0},
    rect:  {w:100,h:40,bgColor:'transparent',borderWidth:1,borderColor:'#000',borderStyle:'solid',zIndex:0},
    image: {w:80,h:60,src:'',srcFit:'contain',borderWidth:0,borderColor:'#000',zIndex:0},
    chart: {w:200,h:100,chartType:'bar',color:'#3B7FE8',bgColor:'#fff',borderWidth:1,borderColor:'#ccc',borderStyle:'solid',fieldPath:'',zIndex:0},
    table: {w:300,h:60,bgColor:'#fff',borderWidth:1,borderColor:'#ccc',borderStyle:'solid',columns:[],zIndex:0},
    subreport:{w:300,h:80,layoutPath:'',dataPath:'',bgColor:'#f8f8f8',borderWidth:1,borderColor:'#aaa',borderStyle:'dashed',zIndex:0},
  },

  defaults(type) { return this.DEFAULTS[type] || null; },

  renderDOM(el) {
    const div = document.createElement('div');
    div.id           = `el-${el.id}`;
    div.dataset.elid = el.id;
    div.dataset.type = el.type;
    div.className    = 'rf-el';
    this.applyStyle(div, el);
    div.appendChild(this.renderContent(el));
    return div;
  },

  applyStyle(div, el) {
    const s = div.style;
    s.position  = 'absolute';
    s.left      = el.x+'px'; s.top = el.y+'px';
    s.width     = el.w+'px'; s.height = el.h+'px';
    s.zIndex    = (el.zIndex||0)+10;
    s.boxSizing = 'border-box';
    s.overflow  = 'hidden';

    if (el.locked) { div.classList.add('locked'); }
    else           { div.classList.remove('locked'); }

    if (el.type==='line') {
      s.background = el.color||'#000';
      s.border     = 'none';
      div.classList.add('u-cursor-move');
      return;
    }
    if (el.type==='rect') {
      s.background = el.bgColor==='transparent'?'transparent':el.bgColor;
      s.border     = `${el.borderWidth||1}px ${el.borderStyle||'solid'} ${el.borderColor||'#000'}`;
      div.classList.add('u-cursor-move');
      return;
    }
    if (el.type==='image') {
      s.border     = el.borderWidth ? `${el.borderWidth}px solid ${el.borderColor}` : 'none';
      div.classList.add('u-cursor-move');
      return;
    }
    if (el.type==='chart') {
      s.background = el.bgColor||'#fff';
      s.border     = `${el.borderWidth||1}px ${el.borderStyle||'solid'} ${el.borderColor||'#ccc'}`;
      div.classList.add('u-cursor-move');
      return;
    }
    if (el.type==='table') {
      s.background = el.bgColor||'#fff';
      s.border     = `${el.borderWidth||1}px ${el.borderStyle||'solid'} ${el.borderColor||'#ccc'}`;
      div.classList.add('u-cursor-move');
      return;
    }
    if (el.type==='subreport') {
      s.background = el.bgColor||'#f8f8f8';
      s.border     = `${el.borderWidth||1}px ${el.borderStyle||'dashed'} ${el.borderColor||'#aaa'}`;
      div.classList.add('u-cursor-move');
      return;
    }
    // text / field
    s.fontFamily     = (el.fontFamily||'Arial')+',Arial,sans-serif';
    s.fontSize       = (el.fontSize||9)+'pt';
    s.fontWeight     = el.bold     ? 'bold'      : 'normal';
    s.fontStyle      = el.italic   ? 'italic'    : 'normal';
    s.textDecoration = el.underline? 'underline' : 'none';
    s.textAlign      = el.align    || 'left';
    s.color          = el.color    || '#000';
    s.background     = el.bgColor==='transparent'?'transparent':(el.bgColor||'transparent');
    s.border         = el.borderWidth ? `${el.borderWidth}px ${el.borderStyle||'solid'} ${el.borderColor||'#000'}` : 'none';
    s.padding        = '0 2px';
    s.display        = 'flex';
    s.alignItems     = 'center';
    s.whiteSpace     = el.wordWrap ? 'pre-wrap' : 'nowrap';
    s.cursor         = 'move';
  },

  renderContent(el) {
    if (el.type==='text' || el.type==='field') {
      const span = document.createElement('span');
      span.className = 'el-inner';
      span.style.cssText = 'overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0;pointer-events:none;';
      if (el.type==='field') {
        span.textContent = el.fieldPath||'(field)';
        span.style.color = '#1E6FD4';
        span.style.fontStyle = 'italic';
      } else {
        span.textContent = el.content||'Text';
      }
      return span;
    }
    if (el.type==='image') {
      const img = document.createElement('img');
      img.className = 'el-inner';
      img.style.cssText = 'width:100%;height:100%;object-fit:contain;pointer-events:none;';
      img.src = el.src || `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Crect width='40' height='40' fill='%23ddd'/%3E%3Ctext x='50%25' y='55%25' text-anchor='middle' font-size='9' fill='%23999'%3EIMG%3C/text%3E%3C/svg%3E`;
      return img;
    }
    if (el.type==='chart') {
      const d = document.createElement('div');
      d.className = 'el-inner';
      d.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:2px;pointer-events:none;';
      d.append(RF.html(`<span class="u-fs-18">📊</span><span class="u-el-label">${el.chartType||'bar'} chart</span>`));
      return d;
    }
    if (el.type==='table') {
      const d = document.createElement('div');
      d.className = 'el-inner';
      d.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:2px;pointer-events:none;';
      d.append(RF.html(`<span class="u-fs-14">⊞</span><span class="u-el-label">${(el.columns||[]).length} cols</span>`));
      return d;
    }
    if (el.type==='subreport') {
      const d = document.createElement('div');
      d.className = 'el-inner';
      d.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:2px;pointer-events:none;';
      d.append(RF.html(`<span class="u-fs-14">🗂</span><span class="u-el-label">${el.layoutPath||'(subreport)'}</span>`));
      return d;
    }
    return document.createTextNode('');
  },
};


// ═══════════════════════════════════════════════════════════════════════════════
// RF.Classic.Canvas — Grid, rulers, zoom, pan, marquee selection.
// ═══════════════════════════════════════════════════════════════════════════════

// ── v4 element defaults + renderContent/applyStyle patches ─
  const D = RF.Classic.Elements.DEFAULTS;

  D.barcode  = {w:120,h:50,barcodeType:'code128',fieldPath:'',color:'#000',bgColor:'transparent',
                borderWidth:0,zIndex:0,content:'',showText:true};
  D.crosstab = {w:300,h:80,rowField:'',colField:'',summaryField:'',summaryFunc:'sum',
                bgColor:'#fff',borderWidth:1,borderColor:'#ccc',borderStyle:'solid',zIndex:0,
                rowTotals:true,colTotals:true,rows:[],cols:[]};
  D.richtext = {w:200,h:60,htmlContent:'<p>Rich text</p>',bgColor:'transparent',
                borderWidth:0,zIndex:0,canGrow:true};
  D.mapobj   = {w:200,h:120,mapField:'',mapType:'choropleth',bgColor:'#e8eef4',
                borderWidth:1,borderColor:'#ccc',zIndex:0};

  // Extend renderContent for new types
  const _orig = RF.Classic.Elements.renderContent.bind(RF.Classic.Elements);
  RF.Classic.Elements.renderContent = function(el) {
    if (el.type === 'barcode') {
      const wrap = document.createElement('div');
      wrap.className = 'el-barcode el-inner';
      wrap.style.cssText = `width:100%;height:100%;color:${el.color||'#000'};pointer-events:none`;
      // Fake barcode bars
      const bars = document.createElement('div');
      bars.className = 'barcode-bars';
      const pat = [3,1,2,1,3,2,1,3,1,2,3,1,2,1,2,3,1,2,3,1,2,1,3,2,1,3];
      pat.forEach((w,i) => {
        if (i%2===0) {
          const b = document.createElement('div');
          b.className='barcode-bar';
          b.style.cssText=`width:${w*1.5}px;height:${Math.round((el.h||50)*.7)}px`;
          bars.appendChild(b);
        }
      });
      wrap.appendChild(bars);
      if (el.showText) {
        const txt = document.createElement('div');
        txt.className = 'barcode-text';
        txt.textContent = el.fieldPath || el.content || '000000';
        wrap.appendChild(txt);
      }
      return wrap;
    }
    if (el.type === 'crosstab') {
      const wrap = document.createElement('div');
      wrap.className = 'el-inner';
      wrap.style.cssText = 'width:100%;height:100%;overflow:hidden;pointer-events:none;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:2px';
      wrap.append(RF.html(`<span class="u-fs-14">⊞</span><span class="u-el-label">Crosstab: ${el.rowField||'row'} × ${el.colField||'col'}</span>`));
      return wrap;
    }
    if (el.type === 'richtext') {
      const wrap = document.createElement('div');
      wrap.className = 'el-inner';
      wrap.style.cssText = 'width:100%;height:100%;overflow:hidden;pointer-events:none;padding:2px 4px;font-size:9pt';
      // Rich text: use DOMParser for safer insertion
      RF.clear(wrap);
      if (el.htmlContent) {
        try {
          const doc = new DOMParser().parseFromString(el.htmlContent, 'text/html');
          [...doc.body.childNodes].forEach(n => wrap.appendChild(document.adoptNode(n)));
        } catch(e) { wrap.textContent = el.htmlContent; }
      } else {
        const em = document.createElement('em');
        em.className = 'u-text-888';
        em.textContent = 'Rich Text';
        wrap.appendChild(em);
      }
      return wrap;
    }
    if (el.type === 'mapobj') {
      const wrap = document.createElement('div');
      wrap.className = 'el-inner';
      wrap.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:2px;pointer-events:none';
      wrap.append(RF.html(`<span class="u-fs-18">🗺</span><span class="u-el-label">${el.mapType||'map'}</span>`));
      return wrap;
    }
    return _orig(el);
  };

  // Extend applyStyle for new types
  const _origStyle = RF.Classic.Elements.applyStyle.bind(RF.Classic.Elements);
  RF.Classic.Elements.applyStyle = function(div, el) {
    _origStyle(div, el);
    if (['barcode','crosstab','richtext','mapobj'].includes(el.type)) {
      div.style.background = el.bgColor==='transparent'?'transparent':(el.bgColor||'transparent');
      div.style.border = el.borderWidth ? `${el.borderWidth}px ${el.borderStyle||'solid'} ${el.borderColor||'#ccc'}` : 'none';
      div.classList.add('u-cursor-move');
    }
  };


// ── v4: Section collapse / expand + advanced section properties ───────────────
