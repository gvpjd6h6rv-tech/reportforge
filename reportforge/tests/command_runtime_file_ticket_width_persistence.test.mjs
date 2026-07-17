import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, timeoutMs = 1000, intervalMs = 20, state = null) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await sleep(intervalMs);
  }
  const details = state
    ? `status=${state.status.length}, alerts=${state.alerts.length}, writes=${state.writes.length}, lastAlert=${JSON.stringify(state.alerts.at(-1) || null)}`
    : 'no-state';
  throw new Error(`timed out waiting for runtime readiness (${details})`);
}

function makeLayoutFixture(model, selection) {
  const base = {
    pageSize: 'A4',
    pageWidth: 794,
    pageHeight: 1123,
    margins: { top: 15, right: 20, bottom: 15, left: 20 },
    sections: [{ id: 'det', stype: 'det', height: 60 }],
    elements: [{ id: 't1', x: 10, y: 10, w: 50, h: 12, type: 'text' }],
  };
  return model.buildPageFormatLayout(base, selection);
}

function makeRuntimeWithFileHandle(layoutText, fileName, model) {
  const state = {
    writes: [],
    closes: 0,
    status: [],
    alerts: [],
  };

  const fileHandle = {
    name: fileName,
    async getFile() {
      return { name: fileName, text: layoutText };
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
    async showOpenFilePicker(options) {
      assert.equal(options.multiple, false);
      return [fileHandle];
    },
    addEventListener() {},
    removeEventListener() {},
    setTimeout,
  };
  if (model) window.PageFormatModel = model;

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
      setPageMarginLeft(value) {
        this.pageMarginLeft = value;
      },
      setPageMarginTop(value) {
        this.pageMarginTop = value;
      },
      saveHistory() {},
    },
    SectionEngine: { render() {} },
    SelectionEngine: { clearSelection() {} },
    DesignZoomEngine: { set() {} },
    FieldExplorerEngine: { render() {} },
    SqlCommandStore: {
      clear() {},
      add() {},
      list() { return []; },
    },
    FileReader: FakeFileReader,
    FIELD_TREE: {},
    SAMPLE_DATA: {},
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
  const loadSource = fs.readFileSync(path.join(ROOT, 'engines/CommandRuntimeFileLoad.js'), 'utf8');
  const serializationSource = fs.readFileSync(path.join(ROOT, 'engines/CommandRuntimeFileSerialization.js'), 'utf8');
  const source = fs.readFileSync(path.join(ROOT, 'engines/CommandRuntimeFile.js'), 'utf8');
  const ioSource = fs.readFileSync(path.join(ROOT, 'engines/CommandRuntimeFileIO.js'), 'utf8');
  vm.createContext(context);
  vm.runInContext(applySource, context, { filename: 'engines/CommandRuntimeFileApply.js' });
  vm.runInContext(loadSource, context, { filename: 'engines/CommandRuntimeFileLoad.js' });
  vm.runInContext(serializationSource, context, { filename: 'engines/CommandRuntimeFileSerialization.js' });
  vm.runInContext(source, context, { filename: 'engines/CommandRuntimeFile.js' });
  vm.runInContext(ioSource, context, { filename: 'engines/CommandRuntimeFileIO.js' });

  return {
    state,
    FileEngine: context.window.CommandRuntimeFile,
  };
}

test('CommandRuntimeFile keeps ticket widths intact across open and save', async () => {
  const model = await import(pathToFileURL(path.join(ROOT, 'engines/PageFormatModel.js')).href);
  const scenarios = [
    {
      label: 'TICKET 76 explicit',
      layout: makeLayoutFixture(model, { format: 'TICKET', ticketWidthMm: 76 }),
      expectedTicketWidthMm: 76,
    },
    {
      label: 'TICKET 58 explicit',
      layout: makeLayoutFixture(model, { format: 'TICKET', ticketWidthMm: 58 }),
      expectedTicketWidthMm: 58,
    },
    {
      label: 'TICKET 70 explicit',
      layout: makeLayoutFixture(model, { format: 'TICKET', ticketWidthMm: 70 }),
      expectedTicketWidthMm: 70,
    },
    {
      label: 'TICKET 76 derived from pageWidth',
      layout: { ...makeLayoutFixture(model, { format: 'TICKET', ticketWidthMm: 76 }), ticketWidthMm: null },
      expectedTicketWidthMm: 76,
    },
    {
      label: 'TICKET inválido deriva ancho oficial',
      layout: { ...makeLayoutFixture(model, { format: 'TICKET', ticketWidthMm: 76 }), ticketWidthMm: 999 },
      expectedTicketWidthMm: 76,
    },
    {
      label: 'A4 null',
      layout: makeLayoutFixture(model, { format: 'A4' }),
      expectedTicketWidthMm: null,
    },
  ];

  for (const scenario of scenarios) {
    const runtime = makeRuntimeWithFileHandle(
      JSON.stringify(scenario.layout),
      `${scenario.label.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}.rfd.json`,
      model,
    );

    assert.equal(runtime.FileEngine.load(), true, scenario.label);
    await waitFor(() => runtime.state.status.length > 0, 1000, 20, runtime.state);

    assert.match(runtime.state.status.at(-1), /Abierto:/);
    assert.equal(await runtime.FileEngine.save(), true, scenario.label);

    assert.equal(runtime.state.writes.length, 1, scenario.label);
    assert.equal(runtime.state.closes, 1, scenario.label);
    assert.equal(runtime.state.alerts.length, 0, scenario.label);

    const saved = JSON.parse(runtime.state.writes[0]);
    assert.equal(saved.pageSize, scenario.layout.pageSize, scenario.label);
    assert.equal(saved.pageWidth, scenario.layout.pageWidth, scenario.label);
    assert.equal(saved.pageHeight, scenario.layout.pageHeight, scenario.label);
    assert.deepEqual(saved.margins, scenario.layout.margins, scenario.label);
    assert.equal(saved.ticketWidthMm, scenario.expectedTicketWidthMm, scenario.label);
    assert.equal(saved.sections.length, 1, scenario.label);
    assert.equal(saved.elements.length, 1, scenario.label);
  }

  const missingSsotRuntime = makeRuntimeWithFileHandle(
    JSON.stringify(makeLayoutFixture(model, { format: 'TICKET', ticketWidthMm: 76 })),
    'ticket_missing_ssot.rfd.json',
    null,
  );
  assert.equal(missingSsotRuntime.FileEngine.load(), true, 'TICKET sin SSOT');
  await waitFor(() => missingSsotRuntime.state.status.length > 0, 1000, 20, missingSsotRuntime.state);
  assert.equal(await missingSsotRuntime.FileEngine.save(), false, 'TICKET sin SSOT');
  assert.match(
    missingSsotRuntime.state.alerts.at(-1) || '',
    /Falta el SSOT de formato/,
    'TICKET debe fallar explícitamente cuando PageFormatModel no está disponible',
  );
  assert.equal(missingSsotRuntime.state.writes.length, 0, 'TICKET sin SSOT');
  assert.equal(missingSsotRuntime.state.closes, 0, 'TICKET sin SSOT');
});
