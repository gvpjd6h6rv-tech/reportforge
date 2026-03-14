// ─────────────────────────────────────────────────────────────────────────────
// elements/element_factory.js  –  Create & render all element types
// ─────────────────────────────────────────────────────────────────────────────

/** Default properties shared by all elements */
RF.ElementDefaults = {
  text:  { type:'text',  w:120, h:16, fontFamily:'Arial', fontSize:9,
           bold:false, italic:false, underline:false, align:'left',
           color:'#000000', bgColor:'transparent', borderWidth:0,
           borderColor:'#000000', borderStyle:'solid', content:'Text',
           zIndex:0, canGrow:false, wordWrap:false },
  field: { type:'field', w:120, h:14, fontFamily:'Arial', fontSize:9,
           bold:false, italic:false, underline:false, align:'left',
           color:'#000000', bgColor:'transparent', borderWidth:0,
           borderColor:'#000000', borderStyle:'solid', fieldPath:'',
           fieldFmt:null, zIndex:0 },
  line:  { type:'line',  w:100, h:2,  lineDir:'h', lineWidth:1,
           color:'#000000', zIndex:0 },
  rect:  { type:'rect',  w:100, h:40, bgColor:'transparent',
           borderWidth:1, borderColor:'#000000', borderStyle:'solid', zIndex:0 },
  image: { type:'image', w:80,  h:60, src:'', srcFit:'contain',
           borderWidth:0, borderColor:'#000000', zIndex:0 },
};

RF.ElementFactory = {

  /**
   * Create a new element of the given type at (sectionId, x, y).
   * Returns the new element object (already pushed into layout.elements).
   */
  create(type, sectionId, x, y, extraProps = {}) {
    const id      = RF.uid('el');
    const section = RF.AppState.getSectionById(sectionId);
    if (!section) return null;
    const defs    = RF.ElementDefaults[type];
    if (!defs) return null;

    const el = {
      id,
      sectionId,
      x: Math.round(x),
      y: Math.round(y),
      ...RF.clone(defs),
      ...extraProps,
    };

    RF.AppState.layout.elements.push(el);
    RF.AppState.isDirty = true;
    RF.EventBus.emit('element:created', el);
    return el;
  },

  /**
   * Delete elements by ID array.
   */
  deleteElements(ids) {
    const idSet = new Set(ids);
    RF.AppState.layout.elements = RF.AppState.layout.elements.filter(e => !idSet.has(e.id));
    ids.forEach(id => RF.AppState.selectedIds.delete(id));
    RF.AppState.isDirty = true;
    RF.EventBus.emit('layout:changed');
    RF.EventBus.emit('selection:changed');
  },

  /**
   * Render an element as an HTML div (used by Canvas).
   */
  renderDOM(el) {
    const div = document.createElement('div');
    div.id           = `el-${el.id}`;
    div.dataset.elid = el.id;
    div.className    = 'rf-element';
    RF.ElementFactory.applyStyle(div, el);
    div.appendChild(RF.ElementFactory.renderContent(el));
    return div;
  },

  applyStyle(div, el) {
    const s = div.style;
    s.position  = 'absolute';
    s.left      = el.x + 'px';
    s.top       = el.y + 'px';
    s.width     = el.w + 'px';
    s.height    = el.h + 'px';
    s.zIndex    = (el.zIndex || 0) + 10;
    s.boxSizing = 'border-box';
    s.overflow  = 'hidden';
    s.cursor    = 'move';
    s.userSelect= 'none';

    if (el.type === 'line') {
      s.background = el.color || '#000';
      s.cursor     = 'move';
      return;
    }
    if (el.type === 'rect') {
      s.background = el.bgColor === 'transparent' ? 'transparent' : el.bgColor;
      s.border     = `${el.borderWidth||1}px ${el.borderStyle||'solid'} ${el.borderColor||'#000'}`;
      return;
    }
    if (el.type === 'image') {
      s.border     = el.borderWidth ? `${el.borderWidth}px solid ${el.borderColor}` : 'none';
      return;
    }

    // text / field
    s.fontFamily    = (el.fontFamily || 'Arial') + ',Arial,sans-serif';
    s.fontSize      = (el.fontSize   || 9)  + 'pt';
    s.fontWeight    = el.bold     ? 'bold'   : 'normal';
    s.fontStyle     = el.italic   ? 'italic' : 'normal';
    s.textDecoration= el.underline? 'underline':'none';
    s.textAlign     = el.align    || 'left';
    s.color         = el.color    || '#000';
    s.background    = el.bgColor === 'transparent' ? 'transparent' : (el.bgColor||'transparent');
    s.border        = el.borderWidth ? `${el.borderWidth}px ${el.borderStyle||'solid'} ${el.borderColor||'#000'}` : 'none';
    s.padding       = '0 2px';
    s.display       = 'flex';
    s.alignItems    = 'center';
    s.whiteSpace    = el.wordWrap ? 'pre-wrap' : 'nowrap';
  },

  renderContent(el) {
    const inner = document.createElement('span');
    inner.style.overflow     = 'hidden';
    inner.style.textOverflow = 'ellipsis';
    inner.style.flex         = '1';
    inner.style.minWidth     = '0';
    inner.style.pointerEvents= 'none';

    switch (el.type) {
      case 'text':
        inner.textContent = el.content || 'Text';
        break;
      case 'field':
        inner.textContent = el.fieldPath || '(field)';
        inner.style.color = '#0066CC';
        break;
      case 'image': {
        const img = document.createElement('img');
        img.style.cssText = 'width:100%;height:100%;object-fit:contain;pointer-events:none';
        img.src = el.src || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="%23ddd"/><text x="50%" y="55%" text-anchor="middle" font-size="10" fill="%23999">IMG</text></svg>';
        return img;
      }
      case 'line':
      case 'rect':
        return document.createTextNode('');
      default:
        inner.textContent = el.content || '';
    }
    return inner;
  },

  /** Update existing DOM element to match data model */
  syncDOM(el) {
    const div = document.getElementById(`el-${el.id}`);
    if (!div) return;
    RF.ElementFactory.applyStyle(div, el);
    const inner = div.querySelector('span, img');
    if (inner) {
      div.removeChild(inner);
    }
    div.appendChild(RF.ElementFactory.renderContent(el));
  },
};
