import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeRuntimeWithFileHandle() {
  const state = {
    writes: [],
    closes: 0,
    status: [],
    alerts: [],
    localStorageWrites: 0,
  };

  const layoutText = JSON.stringify({
    name: 'Factura abierta',
    pageWidth: 754,
    sections: [{ id: 'det', stype: 'det', height: 60 }],
    elements: [{ id: 't1', x: 10, y: 10, w: 50, h: 12, type: 'text' }],
  });

  const fileHandle = {
    name: 'factura_abierta.rfd.json',

    async getFile() {
      return {
        name: 'factura_abierta.rfd.json',
        text: layoutText,
      };
    },

    async queryPermission(options) {
      assert.equal(options.mode, 'readwrite');
      return 'granted';
    },

    async createWritable() {
      return {
        async write(text) {
          state.writes.push(text);
        },
        async close() {
          state.closes += 1;
        },
      };
    },
  };

  class FakeFileReader {
    readAsText(file) {
      setTimeout(() => {
        this.result = file.text;
        this.onload();
      }, 0);
    }
  }

  const document = {
    body: { appendChild() {} },
    createElement() {
      throw new Error('legacy input picker should not be used when showOpenFilePicker exists');
    },
    getElementById() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    querySelector() {
      return null;
    },
    set title(_value) {},
  };

  const window = {
    CommandRuntimeShared: {
      renderSectionsAndSelection() {},
      setStatus(message) {
        state.status.push(message);
      },
    },

    async showOpenFilePicker(options) {
      assert.equal(options.multiple, false);
      return [fileHandle];
    },

    addEventListener() {},
    removeEventListener() {},
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
      zoom: 1,
      state: { history: [], historyIndex: -1 },
      setSections(sections) { this.sections = sections; },
      setElements(elements) { this.elements = elements; },
      clearSelectionState() {},
      saveHistory() {},
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
      setItem() {
        state.localStorageWrites += 1;
      },
    },
    Blob: class FakeBlob {},
    URL: {
      createObjectURL() { return 'blob:test'; },
      revokeObjectURL() {},
    },
    prompt() {
      throw new Error('save to opened file must not prompt for a name');
    },
    setTimeout,
    clearTimeout,
    Date,
    console,
  };

  context.window.window = context.window;
  context.window.document = document;

  const applySource = fs.readFileSync(path.join(ROOT, 'engines/CommandRuntimeFileApply.js'), 'utf8');
  const source = fs.readFileSync(path.join(ROOT, 'engines/CommandRuntimeFile.js'), 'utf8');
  const ioSource = fs.readFileSync(path.join(ROOT, 'engines/CommandRuntimeFileIO.js'), 'utf8');
  vm.createContext(context);
  vm.runInContext(applySource, context, { filename: 'engines/CommandRuntimeFileApply.js' });
  vm.runInContext(source, context, { filename: 'engines/CommandRuntimeFile.js' });
  vm.runInContext(ioSource, context, { filename: 'engines/CommandRuntimeFileIO.js' });

  return {
    state,
    FileEngine: context.window.CommandRuntimeFile,
  };
}

test('CommandRuntimeFile.save writes to the opened JSON file handle', async () => {
  const runtime = makeRuntimeWithFileHandle();

  assert.equal(runtime.FileEngine.load(), true);
  await sleep(30);

  assert.match(runtime.state.status.at(-1), /Abierto: factura_abierta\.rfd\.json/);

  assert.equal(await runtime.FileEngine.save(), true);

  assert.equal(runtime.state.writes.length, 1);
  assert.equal(runtime.state.closes, 1);
  assert.equal(runtime.state.localStorageWrites, 0);
  assert.equal(runtime.state.alerts.length, 0);

  const saved = JSON.parse(runtime.state.writes[0]);
  assert.equal(saved.name, 'Factura abierta');
  assert.equal(saved.pageWidth, 754);
  assert.equal(saved.sections.length, 1);
  assert.equal(saved.elements.length, 1);
});
