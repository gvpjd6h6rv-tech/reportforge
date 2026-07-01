'use strict';

(function initCanvasLayoutElements(global) {
  const C = global.CanvasLayoutContracts;

  function _getSectionNode(sectionId) {
    return document.querySelector(`.cr-section[data-section-id="${sectionId}"]`);
  }

  // Documented call site for RF.Geometry's pixel API (magic_offset_guard RULE-B).
  function _scale(value) {
    return (typeof RF !== 'undefined' && RF.Geometry && typeof RF.Geometry.scale === 'function') ? RF.Geometry.scale(value) : value;
  }
  function _modelToView(x, y) {
    return (typeof RF !== 'undefined' && RF.Geometry && typeof RF.Geometry.modelToView === 'function') ? RF.Geometry.modelToView(x, y) : { x, y };
  }

  function _px(value) {
    return `${value}px`;
  }

  function _applyBaseStyle(div, el) {
    // Zoom is owned by the canvas container, so element DOM stays in model space.
    div.style.left = _px(el.x);
    div.style.top = _px(el.y);
    div.style.width = _px(el.w);
    div.style.height = _px(el.h);
    div.style.fontFamily = global.FontStack.resolveCssFontFamily(el.fontFamily);
    div.style.fontSize = _px(el.fontSize * 96 / 72);
    div.style.fontWeight = el.bold ? 'bold' : 'normal';
    div.style.fontStyle = el.italic ? 'italic' : 'normal';
    div.style.textDecoration = el.underline ? 'underline' : 'none';
    div.style.textAlign = el.align || 'left';
    // Only set an inline z-index for an EXPLICIT document order — an
    // inline `z-index:0` fallback otherwise permanently wins over
    // `.cr-element.selected`'s stylesheet z-index, burying a
    // selected/dragged element behind a later unselected sibling.
    if (el.zIndex) {
      div.style.zIndex = el.zIndex;
    } else {
      div.style.removeProperty('z-index');
    }
  }

  function _setBorder(div, el) {
    const fb = el.format && el.format.borders;
    if (fb) {
      const { inlineStyles } = BorderMapper.mapBorders(fb);
      div.style.border = '';
      Object.keys(inlineStyles).forEach(function(prop) {
        div.style[prop] = inlineStyles[prop];
      });
    } else {
      div.style.border = el.borderWidth > 0 ? `${el.borderWidth}px ${el.borderStyle} ${el.borderColor}` : '';
    }
  }

  function _fieldLabel(el) {
    if (el.content && el.content !== el.fieldPath) return el.content;
    return el.fieldPath ? `{${el.fieldPath}}` : '';
  }

  function _appendContentSpan(div, text = '') {
    const span = document.createElement('span');
    span.className = 'el-content';
    span.textContent = text;
    div.appendChild(span);
    return span;
  }

  function _appendCorners(div) {
    ['tl', 'tr', 'bl', 'br'].forEach((pos) => {
      const m = document.createElement('span');
      m.className = 'el-corner ' + pos;
      div.appendChild(m);
    });
  }

  function _buildField(div, el) {
    div.style.color = el.color;
    div.style.background = el.bgColor === 'transparent' ? 'var(--cr-field-bg)' : el.bgColor;
    _setBorder(div, el);
    const icon = document.createElement('span');
    icon.className = 'el-field-icon'; icon.textContent = '⬚';
    div.appendChild(icon);
    _appendContentSpan(div, _fieldLabel(el));
  }

  function _buildText(div, el) {
    div.style.color = el.color;
    div.style.background = el.bgColor === 'transparent' ? 'var(--cr-text-bg)' : el.bgColor;
    _setBorder(div, el);
    _appendContentSpan(div, el.content || 'Texto').contentEditable = 'false';
  }

  function _buildLine(div, el) {
    div.style.background = 'transparent';
    div.style.border = 'none';
    div.style.overflow = 'visible';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.style.cssText = 'position:absolute;overflow:visible;pointer-events:none';
    svg.setAttribute('width', Math.max(el.w, 1));
    svg.setAttribute('height', Math.max(el.h, 1));
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    const lc = el.borderColor === 'transparent' ? '#000' : (el.borderColor || '#000');
    // Missing lineDir used to always default horizontal (matching element_renderers.py fix).
    const isVertical = el.lineDir === 'v' || (!el.lineDir && el.h > el.w);
    // Clamping mid to >=1 pushed a 1px-thin line's true center (0.5) to
    // the SVG's far edge, splitting the stroke into a ~50% gray sliver
    // 1px outside its own box. No floor needed; svg is overflow:visible.
    const mid = (isVertical ? el.w : el.h) / 2;
    if (isVertical) { line.setAttribute('x1', mid); line.setAttribute('y1', 0); line.setAttribute('x2', mid); line.setAttribute('y2', el.h); }
    else { line.setAttribute('x1', 0); line.setAttribute('y1', mid); line.setAttribute('x2', el.w); line.setAttribute('y2', mid); }
    line.setAttribute('stroke', lc);
    line.setAttribute('stroke-width', el.lineWidth || 1);
    svg.appendChild(line);
    div.appendChild(svg);
    _appendContentSpan(div);
  }

  function _buildRect(div, el) {
    div.style.background = el.bgColor === 'transparent' ? 'transparent' : el.bgColor;
    div.style.overflow = 'visible';
    _setBorder(div, el);
    _appendContentSpan(div);
  }

  function _buildImage(div, el) {
    const src = el.src || el.imageSrc || '';
    if (!src) {
      div.style.background = '#F9F9F9';
      div.style.border = '1px dashed #999';
      _appendContentSpan(div, '⬚ imagen');
      return;
    }
    div.style.background = 'transparent';
    div.style.border = 'none';
    const img = document.createElement('img');
    img.className = 'el-content'; img.alt = el.content || '';
    img.src = src;
    img.style.display = 'block';
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = el.srcFit || el.imageFit || 'contain';
    img.style.pointerEvents = 'none';
    div.appendChild(img);
  }

  function _barcodeLabel(el) { return el.fieldPath ? `{${el.fieldPath}}` : 'BARCODE'; }
  function _barcodeSrc(el) { return `/preview-barcode?value=${encodeURIComponent(_barcodeLabel(el))}&barcodeType=${encodeURIComponent(el.barcodeType||'code128')}&width=${el.w||200}&height=${el.h||60}&showText=${el.showText!==false}`; }
  function _buildBarcode(div, el) {
    const img = document.createElement('img');
    img.className = 'el-content';
    img.style.display = 'block'; img.style.width = '100%'; img.style.height = '100%'; img.style.pointerEvents = 'none';
    img.title = _barcodeLabel(el);
    img.src = _barcodeSrc(el);
    div.appendChild(img);
  }

  function _buildElementContent(div, el) {
    if (el.type === 'field') return _buildField(div, el);
    if (el.type === 'text') return _buildText(div, el);
    if (el.type === 'line') return _buildLine(div, el);
    if (el.type === 'rect') return _buildRect(div, el);
    if (el.type === 'image') return _buildImage(div, el);
    if (el.type === 'barcode') return _buildBarcode(div, el);
  }

  function _updateContent(div, el) {
    const span = div.querySelector('.el-content');
    if (!span) return;
    if (el.type === 'field') span.textContent = _fieldLabel(el);
    else if (el.type === 'text') span.textContent = el.content || '';
    else if (el.type === 'image') _updateImageContent(div, el, span);
    else if (el.type === 'barcode') { const img = div.querySelector('img.el-content'); if (img) { img.src = _barcodeSrc(el); img.title = _barcodeLabel(el); } }
  }

  function _updateImageContent(div, el, span) {
    const img = div.querySelector('img.el-content');
    if (!img) {
      span.textContent = '⬚ imagen';
      return;
    }
    img.src = el.src || el.imageSrc || '';
    img.alt = el.content || '';
    img.style.objectFit = el.srcFit || el.imageFit || 'contain';
  }

  function _updateVisualStyle(div, el) {
    div.style.color = el.color || '#000';
    div.style.background = el.bgColor === 'transparent'
      ? (el.type === 'field' ? 'var(--cr-field-bg)' : 'var(--cr-text-bg)')
      : (el.bgColor || 'transparent');
    _setBorder(div, el);
  }

  function buildElementDiv(el) {
    C.assertLayoutContract(el, 'CanvasLayoutEngine.buildElementDiv');
    C.assertZoomContract('CanvasLayoutEngine.buildElementDiv');
    const div = document.createElement('div');
    div.className = 'cr-element';
    div.dataset.id = el.id;
    div.dataset.type = el.type;

    _applyBaseStyle(div, el);
    _appendCorners(div);
    _buildElementContent(div, el);

    const SE = (typeof EngineRegistry !== 'undefined' && EngineRegistry.get('SelectionEngine'))
            || (typeof SelectionEngine !== 'undefined' ? SelectionEngine : null);
    if (SE && SE.attachElementEvents) SE.attachElementEvents(div, el.id);

    return div;
  }

  function renderElement(el) {
    const secDiv = _getSectionNode(el.sectionId);
    if (!secDiv) return;
    const div = buildElementDiv(el);
    secDiv.appendChild(div);
  }

  function renderAll() {
    C.assertSelectionState('CanvasLayoutEngine.renderAll.selection');
    C.assertZoomContract('CanvasLayoutEngine.renderAll.zoom');
    if (typeof RenderScheduler !== 'undefined' && !RenderScheduler.allowsDomWrite()) {
      RenderScheduler.layout(() => renderAll(), 'CanvasLayoutEngine.renderAll');
      return;
    }
    if (typeof RenderScheduler !== 'undefined') {
      RenderScheduler.assertDomWriteAllowed('CanvasLayoutEngine.renderAll');
    }
    document.querySelectorAll('.cr-element').forEach((e) => e.remove());
    if (typeof DS !== 'undefined') {
      for (const el of DS.elements) renderElement(el);
    }
  }

  function updateElement(id) {
    const div = document.querySelector(`.cr-element[data-id="${id}"]`);
    if (!div) return;
    const el = typeof DS !== 'undefined' ? DS.getElementById(id) : null;
    if (!el) return;
    C.assertLayoutContract(el, 'CanvasLayoutEngine.updateElement');
    _applyBaseStyle(div, el);
    _updateVisualStyle(div, el);
    _updateContent(div, el);
    if (typeof DS !== 'undefined')
      div.classList.toggle('selected', (C.assertSelectionState('CanvasLayoutEngine.updateElement.selection'), DS.selection.has(id)));
  }

  function updateElementPosition(id) {
    const div = document.querySelector(`.cr-element[data-id="${id}"]`);
    if (!div) return;
    const el = typeof DS !== 'undefined' ? DS.getElementById(id) : null;
    if (!el) return;
    C.assertLayoutContract(el, 'CanvasLayoutEngine.updateElementPosition');
    C.assertZoomContract('CanvasLayoutEngine.updateElementPosition');
    div.style.left = _px(el.x);
    div.style.top = _px(el.y);
    div.style.width = _px(el.w);
    div.style.height = _px(el.h);
  }

  global.CanvasLayoutElements = { buildElementDiv, renderElement, renderAll, updateElement, updateElementPosition };
})(window);
