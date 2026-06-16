import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeRuntime() {
  const state = {
    clicks: 0,
    inputs: [],
    focusListeners: new Set(),
    status: [],
    alerts: [],
  };

  const elements = new Map();

  function makeInput() {
    const listeners = new Map();

    const input = {
      id: '',
      type: '',
      accept: '',
      value: '',
      files: [],
      style: {},
      removed: false,

      addEventListener(type, handler) {
        listeners.set(type, handler);
      },

      click() {
        state.clicks += 1;
      },

      remove() {
        this.removed = true;
        if (this.id) elements.delete(this.id);
      },

      dispatchChange(files) {
        this.files = files;
        const handler = listeners.get('change');
        if (handler) handler({ target: this });
      },
    };

    state.inputs.push(input);
    return input;
  }

  const document = {
    body: {
      appendChild(input) {
        elements.set(input.id, input);
        return input;
      },
    },

    createElement(tag) {
      assert.equal(tag, 'input');
      return makeInput();
    },

    getElementById(id) {
      return elements.get(id) || null;
    },

    querySelectorAll() {
      return [];
    },

    querySelector() {
      return null;
    },

    get title() {
      return '';
    },

    set title(_value) {},
  };

  class FakeFileReader {
    readAsText(file) {
      setTimeout(() => {
        this.result = file.text;
        this.onload();
      }, 0);
    }
  }

  const window = {
    CommandRuntimeShared: {
      renderSectionsAndSelection() {},
      setStatus(message) {
        state.status.push(message);
      },
    },

    addEventListener(type, handler) {
      if (type === 'focus') state.focusListeners.add(handler);
    },

    removeEventListener(type, handler) {
      if (type === 'focus') state.focusListeners.delete(handler);
    },

    setTimeout,
  };

  const context = {
    window,
    document,
    CFG: { PAGE_W: 754 },
    DS: {
      sections: [],
      elements: [],
      _docType: null,
      setSections(sections) { this.sections = sections; },
      setElements(elements) { this.elements = elements; },
      clearSelectionState() {},
      saveHistory() {},
      state: { history: [], historyIndex: -1 },
      zoom: 1,
    },
    SectionEngine: { render() {} },
    SelectionEngine: { clearSelection() {} },
    DesignZoomEngine: { set() {} },
    FieldExplorerEngine: { render() {} },
    FIELD_TREE: {},
    SAMPLE_DATA: {},
    FileReader: FakeFileReader,
    alert(message) {
      state.alerts.push(message);
    },
    localStorage: {
      setItem() {},
    },
    Blob: class FakeBlob {},
    URL: {
      createObjectURL() { return 'blob:test'; },
      revokeObjectURL() {},
    },
    prompt() {
      return 'test';
    },
    setTimeout,
    clearTimeout,
    Date,
    console,
  };

  context.window.window = context.window;
  context.window.document = document;

  const source = fs.readFileSync('engines/CommandRuntimeFile.js', 'utf8');
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'engines/CommandRuntimeFile.js' });

  return {
    state,
    FileEngine: context.window.CommandRuntimeFile,
    dispatchFocus() {
      for (const handler of [...state.focusListeners]) handler();
    },
  };
}

test('CommandRuntimeFile.load blocks immediate double open picker reentry', () => {
  const runtime = makeRuntime();

  assert.equal(runtime.FileEngine.load(), true);
  assert.equal(runtime.FileEngine.load(), false);
  assert.equal(runtime.state.clicks, 1);
  assert.equal(runtime.state.inputs.length, 1);
});

test('CommandRuntimeFile.load releases after cancel focus and cooldown', async () => {
  const runtime = makeRuntime();

  assert.equal(runtime.FileEngine.load(), true);
  assert.equal(runtime.state.clicks, 1);

  const firstInput = runtime.state.inputs[0];
  runtime.dispatchFocus();

  await sleep(300);

  assert.equal(firstInput.removed, true);
  assert.equal(runtime.FileEngine.load(), false);
  assert.equal(runtime.state.clicks, 1);

  await sleep(950);

  assert.equal(runtime.FileEngine.load(), true);
  assert.equal(runtime.state.clicks, 2);
});

test('CommandRuntimeFile.load keeps picker blocked while selected file is being processed', async () => {
  const runtime = makeRuntime();

  assert.equal(runtime.FileEngine.load(), true);
  assert.equal(runtime.state.clicks, 1);

  const input = runtime.state.inputs[0];
  input.dispatchChange([{
    name: 'factura.rfd.json',
    text: JSON.stringify({
      name: 'Factura Test',
      pageWidth: 754,
      sections: [{ id: 'det', stype: 'det', height: 60 }],
      elements: [],
    }),
  }]);

  assert.equal(runtime.FileEngine.load(), false);
  assert.equal(runtime.state.clicks, 1);

  await sleep(50);

  assert.equal(input.removed, true);
  assert.match(runtime.state.status.at(-1), /Abierto: factura\.rfd\.json/);
});
