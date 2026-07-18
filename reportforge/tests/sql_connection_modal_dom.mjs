export class MockElement {
  constructor(tag, doc) {
    this.tagName = String(tag).toUpperCase();
    this.style = { cssText: '' };
    this.textContent = '';
    this.value = '';
    this._attrs = {};
    this._events = {};
    this._children = [];
    this._parent = null;
    Object.defineProperty(this, 'id', {
      get: () => this._id || '',
      set: (value) => {
        this._id = value;
        if (value) doc._ids[value] = this;
      },
    });
  }

  setAttribute(name, value) {
    this._attrs[name] = value;
    if (name === 'data-status-type') this.dataStatusType = value;
  }

  getAttribute(name) {
    return this._attrs[name] ?? null;
  }

  appendChild(child) {
    if (child._parent) child._parent._children = child._parent._children.filter((node) => node !== child);
    child._parent = this;
    this._children.push(child);
    return child;
  }

  remove() {
    if (this._parent) this._parent._children = this._parent._children.filter((node) => node !== this);
  }

  addEventListener(type, fn) {
    (this._events[type] ||= []).push(fn);
  }

  _fire(type, event) {
    (this._events[type] || []).forEach((fn) => fn(event));
  }
}

export class MockDocument {
  constructor() {
    this._ids = {};
    this.body = new MockElement('body', this);
  }

  createElement(tag) {
    return new MockElement(tag, this);
  }

  getElementById(id) {
    return this._ids[id] || null;
  }
}

export function createMockDocument() {
  return new MockDocument();
}
