'use strict';

const FieldExplorerTree = (() => {
  function render(engine) {
    const tree = document.getElementById('field-tree');
    tree.innerHTML = '';
    const source = engine._activeTree || FIELD_TREE;
    Object.entries(source).forEach(([key, node]) => {
      tree.appendChild(buildNode(engine, key, node, 0));
    });
  }

  function buildNode(engine, key, node, depth) {
    const div = document.createElement('div'); div.className = 'tree-node';
    const hasChildren = node.children && Object.keys(node.children).length > 0;
    const label = document.createElement('div'); label.className = 'tree-node-label';
    const isOpen = engine._expanded.has(key);
    label.innerHTML = `
      <span class="tree-arrow">${hasChildren ? (isOpen ? '▼' : '▶') : ''}</span>
      <span class="tree-icon">${node.icon || '📁'}</span>
      <span class="tree-text">${node.label}</span>`;
    div.appendChild(label);
    if (hasChildren) {
      const children = document.createElement('div');
      children.className = 'tree-children' + (isOpen ? ' open' : '');
      Object.entries(node.children).forEach(([ck, cn]) => {
        if (cn.path) {
          children.appendChild(buildField(engine, cn));
        } else {
          children.appendChild(buildNode(engine, ck, cn, depth + 1));
        }
      });
      div.appendChild(children);
      label.addEventListener('click', () => {
        const open = children.classList.toggle('open');
        label.querySelector('.tree-arrow').textContent = open ? '▼' : '▶';
        if (open) engine._expanded.add(key); else engine._expanded.delete(key);
      });
    }
    return div;
  }

  function buildField(engine, field) {
    const div = document.createElement('div'); div.className = 'tree-field';
    const typeIcon = { string: 'abc', number: '#', currency: '$', date: '📅' }[field.vtype] || '•';
    div.innerHTML = `<span style="font-size:10px">⬚</span><span class="tree-text">${field.label}</span><span class="tree-field-type">${typeIcon}</span>`;
    div.title = field.path;
    div.draggable = true;
    div.addEventListener('dblclick', () => engine._insertField(field));
    div.addEventListener('dragstart', e => {
      engine._dragField = field;
      div.classList.add('dragging');
      document.getElementById('field-drag-ghost').style.display = 'block';
      document.getElementById('field-drag-ghost').textContent = `{${field.path}}`;
      e.dataTransfer.setData('text/plain', field.path);
      e.dataTransfer.effectAllowed = 'copy';
    });
    div.addEventListener('dragend', () => {
      div.classList.remove('dragging');
      document.getElementById('field-drag-ghost').style.display = 'none';
      document.getElementById('field-drop-indicator').style.display = 'none';
      engine._dragField = null;
    });
    return div;
  }

  return { render, buildNode, buildField };
})();

if (typeof module !== 'undefined') module.exports = FieldExplorerTree;
