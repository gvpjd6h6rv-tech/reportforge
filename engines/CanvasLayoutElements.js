'use strict';

(function initCanvasLayoutElements(global) {
  const C = global.CanvasLayoutContracts;

  function _getSectionNode(sectionId) {
    return document.querySelector(`.cr-section[data-section-id="${sectionId}"]`);
  }

  function buildElementDiv(el) {
    C.assertLayoutContract(el, 'CanvasLayoutEngine.buildElementDiv');
    C.assertZoomContract('CanvasLayoutEngine.buildElementDiv');
    const div = document.createElement('div');
    div.className = 'cr-element';
    div.dataset.id = el.id;
    div.dataset.type = el.type;

    const p = RF.Geometry.modelToView(el.x, el.y);
    div.style.left = `${p.x}px`;
    div.style.top = `${p.y}px`;
    div.style.width = `${RF.Geometry.scale(el.w)}px`;
    div.style.height = `${RF.Geometry.scale(el.h)}px`;

    div.style.fontFamily = el.fontFamily || 'Arial';
    div.style.fontSize = `${RF.Geometry.scale(el.fontSize * 96 / 72)}px`;
    div.style.fontWeight = el.bold ? 'bold' : 'normal';
    div.style.fontStyle = el.italic ? 'italic' : 'normal';
    div.style.textDecoration = el.underline ? 'underline' : 'none';
    div.style.textAlign = el.align || 'left';
    div.style.zIndex = el.zIndex || 0;

    ['tl', 'tr', 'bl', 'br'].forEach((pos) => {
      const m = document.createElement('span');
      m.className = 'el-corner ' + pos;
      div.appendChild(m);
    });

    if (el.type === 'field') {
      div.style.color = el.color;
      div.style.background = el.bgColor === 'transparent' ? 'var(--cr-field-bg)' : el.bgColor;
      if (el.borderWidth > 0) div.style.border = `${el.borderWidth}px ${el.borderStyle} ${el.borderColor}`;
      const icon = document.createElement('span');
      icon.className = 'el-field-icon';
      icon.textContent = '⬚';
      const span = document.createElement('span');
      span.className = 'el-content';
      span.textContent = el.fieldPath ? `{${el.fieldPath}}` : '';
      div.appendChild(icon);
      div.appendChild(span);
    } else if (el.type === 'text') {
      div.style.color = el.color;
      div.style.background = el.bgColor === 'transparent' ? 'var(--cr-text-bg)' : el.bgColor;
      if (el.borderWidth > 0) div.style.border = `${el.borderWidth}px ${el.borderStyle} ${el.borderColor}`;
      const span = document.createElement('span');
      span.className = 'el-content';
      span.textContent = el.content || 'Texto';
      span.contentEditable = 'false';
      div.appendChild(span);
    } else if (el.type === 'line') {
      div.style.background = 'transparent';
      div.style.border = 'none';
      div.style.overflow = 'visible';
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.style.cssText = 'position:absolute;overflow:visible;pointer-events:none';
      svg.setAttribute('width', el.w);
      svg.setAttribute('height', Math.max(el.h, 1));
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      const lc = el.borderColor === 'transparent' ? '#000' : (el.borderColor || '#000');
      const mid = Math.max(el.h / 2, 1);
      line.setAttribute('x1', 0); line.setAttribute('y1', mid);
      line.setAttribute('x2', el.w); line.setAttribute('y2', mid);
      line.setAttribute('stroke', lc);
      line.setAttribute('stroke-width', el.lineWidth || 1);
      svg.appendChild(line);
      const span = document.createElement('span');
      span.className = 'el-content';
      div.appendChild(svg);
      div.appendChild(span);
    } else if (el.type === 'rect') {
      div.style.background = el.bgColor === 'transparent' ? 'transparent' : el.bgColor;
      div.style.overflow = 'visible';
      if (el.borderWidth > 0) div.style.border = `${el.borderWidth}px ${el.borderStyle} ${el.borderColor}`;
      const span = document.createElement('span');
      span.className = 'el-content';
      div.appendChild(span);
    } else if (el.type === 'image') {
      div.style.background = '#F9F9F9';
      div.style.border = '1px dashed #999';
      const span = document.createElement('span');
      span.className = 'el-content';
      span.textContent = el.imageSrc ? '🖼' : '⬚ imagen';
      div.appendChild(span);
    }

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
    const p = RF.Geometry.modelToView(el.x, el.y);
    div.style.left = `${p.x}px`;
    div.style.top = `${p.y}px`;
    div.style.width = `${RF.Geometry.scale(el.w)}px`;
    div.style.height = `${RF.Geometry.scale(el.h)}px`;
    div.style.fontFamily = el.fontFamily || 'Arial';
    div.style.fontSize = `${RF.Geometry.scale(el.fontSize * 96 / 72)}px`;
    div.style.fontWeight = el.bold ? 'bold' : 'normal';
    div.style.fontStyle = el.italic ? 'italic' : 'normal';
    div.style.textDecoration = el.underline ? 'underline' : 'none';
    div.style.textAlign = el.align || 'left';
    div.style.zIndex = el.zIndex || 0;
    div.style.color = el.color || '#000';
    div.style.background = el.bgColor === 'transparent'
      ? (el.type === 'field' ? 'var(--cr-field-bg)' : 'var(--cr-text-bg)')
      : (el.bgColor || 'transparent');
    if (el.borderWidth > 0) div.style.border = `${el.borderWidth}px ${el.borderStyle} ${el.borderColor}`;
    else div.style.border = '';
    const span = div.querySelector('.el-content');
    if (span) {
      if (el.type === 'field') span.textContent = el.fieldPath ? `{${el.fieldPath}}` : '';
      else if (el.type === 'text') span.textContent = el.content || '';
    }
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
    const p = RF.Geometry.modelToView(el.x, el.y);
    div.style.left = `${p.x}px`;
    div.style.top = `${p.y}px`;
    div.style.width = `${RF.Geometry.scale(el.w)}px`;
    div.style.height = `${RF.Geometry.scale(el.h)}px`;
  }

  global.CanvasLayoutElements = { buildElementDiv, renderElement, renderAll, updateElement, updateElementPosition };
})(window);
