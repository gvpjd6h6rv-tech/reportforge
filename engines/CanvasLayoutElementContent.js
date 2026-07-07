'use strict';

/* CanvasLayoutElementContent — non-line per-element-type content
 * builders/updaters for CanvasLayoutElements.js (design canvas). Extracted
 * verbatim (no behavior change) to keep that file under its governance
 * line-count threshold. Line-specific builders stay in CanvasLayoutElements.js
 * (its own governance baseline pins exactly one cssText assignment there).
 * Owner boundary unchanged: only CanvasLayoutElements.js calls into this.
 */
(function initCanvasLayoutElementContent(global) {
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

  function _appendCorners(div) {
    ['tl', 'tr', 'bl', 'br'].forEach((pos) => {
      const m = document.createElement('span');
      m.className = 'el-corner ' + pos;
      div.appendChild(m);
    });
  }

  function _appendSpan(div, text = '') {
    const span = document.createElement('span');
    span.className = 'el-content';
    span.textContent = text;
    div.appendChild(span);
    return span;
  }

  function _buildField(div, el) {
    div.style.color = el.color;
    div.style.background = el.bgColor === 'transparent' ? 'var(--cr-field-bg)' : el.bgColor;
    _setBorder(div, el);
    const icon = document.createElement('span');
    icon.className = 'el-field-icon'; icon.textContent = '⬚';
    div.appendChild(icon);
    _appendSpan(div, _fieldLabel(el));
  }

  function _buildText(div, el) {
    div.style.color = el.color;
    div.style.background = el.bgColor === 'transparent' ? 'var(--cr-text-bg)' : el.bgColor;
    _setBorder(div, el);
    _appendSpan(div, el.content || 'Texto').contentEditable = 'false';
  }

  function _buildRect(div, el) {
    div.style.background = el.bgColor === 'transparent' ? 'transparent' : el.bgColor;
    div.style.overflow = 'visible';
    _setBorder(div, el);
    _appendSpan(div);
  }

  function _buildImage(div, el) {
    const src = el.src || el.imageSrc || '';
    if (!src) {
      div.style.background = '#F9F9F9';
      div.style.border = '1px dashed #999';
      _appendSpan(div, '⬚ imagen');
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

  function _updateContent(div, el) {
    const span = div.querySelector('.el-content');
    if (!span) return;
    if (el.type === 'field') span.textContent = _fieldLabel(el);
    else if (el.type === 'text') span.textContent = el.content || '';
    else if (el.type === 'image') _updateImageContent(div, el, span);
    else if (el.type === 'barcode') { const img = div.querySelector('img.el-content'); if (img) { img.src = _barcodeSrc(el); img.title = _barcodeLabel(el); } }
  }

  global.CanvasLayoutElementContent = {
    setBorder: _setBorder,
    appendCorners: _appendCorners,
    buildField: _buildField,
    buildText: _buildText,
    buildRect: _buildRect,
    buildImage: _buildImage,
    buildBarcode: _buildBarcode,
    updateContent: _updateContent,
  };
})(window);
