import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function makeSpy(calls, key, impl) {
  return (...args) => {
    calls[key].push(args);
    return impl ? impl(...args) : undefined;
  };
}

function makeLabelSpy(calls, key, label) {
  return (...args) => {
    calls[key].push([label, ...args]);
  };
}

function loadHandlers(options = {}) {
  const calls = {
    file: [],
    preview: [],
    zoom: [],
    selection: [],
    command: [],
    format: [],
    focus: [],
    insert: [],
    layout: [],
    dialog: [],
    system: [],
    alerts: [],
    confirms: [],
    prompts: [],
    statuses: [],
    css: [],
    classToggles: [],
    appliedLayout: 0,
    renderSections: [],
    clearSelection: [],
    close: [],
    print: [],
  };

  const elements = new Map();
  const panelRight = { scrollTop: 0 };
  const propsBody  = { scrollTop: 0 };
  const gridButton = { classList: { toggle: makeSpy(calls, 'classToggles') } };
  const snapButton = { classList: { toggle: makeSpy(calls, 'classToggles') } };
  const fontPicker = { id: 'color-picker-font', value: '', click() { calls.dialog.push(['click', 'color-picker-font']); }, oninput: null };
  const bgPicker = { id: 'color-picker-bg', value: '', click() { calls.dialog.push(['click', 'color-picker-bg']); }, oninput: null };
  const borderPicker = { id: 'color-picker-border', value: '', click() { calls.dialog.push(['click', 'color-picker-border']); }, oninput: null };

  const document = {
    documentElement: {
      style: {
        setProperty(name, value) {
          calls.css.push([name, value]);
        },
      },
    },
    getElementById(id) {
      if (id === 'panel-right') return panelRight;
      if (id === 'props-body')  return propsBody;
      if (id === 'btn-grid') return gridButton;
      if (id === 'btn-snap') return snapButton;
      if (id === 'color-picker-font') return fontPicker;
      if (id === 'color-picker-bg') return bgPicker;
      if (id === 'color-picker-border') return borderPicker;
      return elements.get(id) || null;
    },
  };

  const selection = options.selection || new Set(['e101']);
  const selectedElements = options.selectedElements || [{ id: 'e101', color: '#445566' }];

  const context = {
    CommandRuntimeShared: {
      setStatus(message) {
        calls.statuses.push(message);
      },
      dispatchActionMap(action, handlers) {
        const fn = handlers[action];
        if (!fn) return false;
        fn();
        return true;
      },
    },
    document,
    FileEngine: {
      load: makeSpy(calls, 'file'),
      save: makeSpy(calls, 'file'),
      saveAs: makeSpy(calls, 'file'),
      exportJSON: makeSpy(calls, 'file'),
      exportPDF: makeSpy(calls, 'file', () => {
        if (options.exportPdfReject) return Promise.reject(new Error('pdf-fail'));
        return Promise.resolve(true);
      }),
    },
    SectionEngine: {
      render() {
        calls.renderSections.push([]);
      },
    },
    SelectionEngine: {
      clearSelection() {
        calls.clearSelection.push([]);
      },
      renderHandles: makeSpy(calls, 'selection'),
    },
    CommandEngine: {
      cut: makeSpy(calls, 'command'),
      copy: makeSpy(calls, 'command'),
      paste: makeSpy(calls, 'command'),
      delete: makeSpy(calls, 'command'),
      selectAll: makeSpy(calls, 'command'),
      alignLefts: makeLabelSpy(calls, 'command', 'alignLefts'),
      alignCenters: makeLabelSpy(calls, 'command', 'alignCenters'),
      alignRights: makeLabelSpy(calls, 'command', 'alignRights'),
      alignTops: makeLabelSpy(calls, 'command', 'alignTops'),
      alignMiddles: makeLabelSpy(calls, 'command', 'alignMiddles'),
      alignBottoms: makeLabelSpy(calls, 'command', 'alignBottoms'),
      sameWidth: makeLabelSpy(calls, 'command', 'sameWidth'),
      sameHeight: makeLabelSpy(calls, 'command', 'sameHeight'),
      bringFront: makeSpy(calls, 'command'),
      sendBack: makeSpy(calls, 'command'),
      bringForward: makeLabelSpy(calls, 'command', 'bringForward'),
      sendBackward: makeLabelSpy(calls, 'command', 'sendBackward'),
      group: makeLabelSpy(calls, 'command', 'group'),
      ungroup: makeLabelSpy(calls, 'command', 'ungroup'),
      invertSelection: makeLabelSpy(calls, 'command', 'invertSelection'),
      zoomFitPage: makeSpy(calls, 'command'),
      zoomFitWidth: makeSpy(calls, 'command'),
      addHGuide: makeSpy(calls, 'layout'),
      addVGuide: makeSpy(calls, 'layout'),
      removeGuide: makeSpy(calls, 'layout'),
      insertSection: makeLabelSpy(calls, 'layout', 'insertSection'),
      deleteSection: makeLabelSpy(calls, 'layout', 'deleteSection'),
      moveSectionUp: makeLabelSpy(calls, 'layout', 'moveSectionUp'),
      moveSectionDown: makeLabelSpy(calls, 'layout', 'moveSectionDown'),
      renameSection: makeLabelSpy(calls, 'layout', 'renameSection'),
      lockObject: () => calls.selection.push(['lockObject']),
      unlockObject: () => calls.selection.push(['unlockObject']),
      hideObject: () => calls.selection.push(['hideObject']),
      showObject: () => calls.selection.push(['showObject']),
    },
    ZoomEngine: {
      step: makeSpy(calls, 'zoom'),
      set: makeSpy(calls, 'zoom'),
    },
    RulerEngine: {
      toggle: makeLabelSpy(calls, 'layout', 'toggleRulers'),
    },
    PreviewEngineRenderer: {
      pageFirst: makeSpy(calls, 'preview'),
      pagePrev: makeSpy(calls, 'preview'),
      pageNext: makeSpy(calls, 'preview'),
      pageLast: makeSpy(calls, 'preview'),
    },
    InsertEngine: {
      setTool: makeSpy(calls, 'insert'),
    },
    AlignmentGuides: {
      clear: makeSpy(calls, 'layout'),
    },
    GridEngine: {
      setVisible(value) {
        calls.layout.push(['setVisible', value]);
        context.DS.gridVisible = value;
      },
    },
    PropertiesEngine: {
      render: makeSpy(calls, 'format'),
      focusSection: makeSpy(calls, 'focus'),
    },
    FormatEngine: {
      applyFormat: makeSpy(calls, 'format'),
      toggleFormat: makeSpy(calls, 'format'),
    },
    DS: {
      sections: options.sections || [{ stype: 'det', height: 60 }, { stype: 'hdr', height: 60 }],
      elements: [],
      selection,
      gridVisible: false,
      snapToGrid: false,
      pageMarginLeft: 12,
      pageMarginTop: 24,
      setElements(elements, source) {
        calls.selection.push(['setElements', source, elements.length]);
        this.elements = elements;
      },
      clearSelectionState(source) {
        calls.selection.push(['clearSelectionState', source]);
        this.selection = new Set();
      },
      saveHistory() {
        calls.selection.push(['saveHistory']);
      },
      undo: makeSpy(calls, 'selection'),
      redo: makeSpy(calls, 'selection'),
      setPageMarginLeft(value, source) {
        calls.layout.push(['setPageMarginLeft', value, source]);
        this.pageMarginLeft = value;
      },
      setPageMarginTop(value, source) {
        calls.layout.push(['setPageMarginTop', value, source]);
        this.pageMarginTop = value;
      },
      setSnapToGrid(value, source) {
        calls.layout.push(['setSnapToGrid', value, source]);
        this.snapToGrid = value;
      },
      getSelectedElements() {
        return selectedElements;
      },
    },
    _canonicalPreviewWriter() {
      return {
        toggle: makeSpy(calls, 'preview'),
        show: makeSpy(calls, 'preview'),
        hide: makeSpy(calls, 'preview'),
      };
    },
    applyLayout() {
      calls.appliedLayout += 1;
    },
    confirm(message) {
      calls.confirms.push(message);
      return options.confirm !== undefined ? options.confirm : true;
    },
    prompt(message, value) {
      calls.prompts.push([message, value]);
      return options.promptValue !== undefined ? options.promptValue : '44';
    },
    alert(message) {
      calls.alerts.push(message);
    },
    DocumentTabManager: {
      create() {
        if (!context.confirm('¿Crear nuevo informe? Los cambios no guardados se perderán.')) return;
        calls.dialog.push(['DocumentTabManager.create']);
        context.DS.setElements([], 'CommandRuntimeHandlers.new');
        context.SectionEngine.render();
        context.SelectionEngine.clearSelection();
      },
    },
    print() {
      calls.print.push([]);
    },
    close() {
      calls.close.push([]);
    },
    setTimeout,
    clearTimeout,
    Date,
    console,
  };

  context.window = context;
  context.window.CommandRuntimeShared = context.CommandRuntimeShared;
  context.window.document = document;

  vm.createContext(context);
  const files = [
    'engines/CommandRuntimeHandlersFile.js',
    'engines/CommandRuntimeHandlersPreview.js',
    'engines/CommandRuntimeHandlersZoom.js',
    'engines/CommandRuntimeHandlersSelectionDispatch.js',
    'engines/CommandRuntimeHandlersFormat.js',
    'engines/CommandRuntimeHandlersInsert.js',
    'engines/CommandRuntimeHandlersLayout.js',
    'engines/CommandRuntimeHandlersDialog.js',
    'engines/CommandRuntimeHandlersSystem.js',
    'engines/CommandRuntimeHandlers.js',
  ];
  for (const rel of files) {
    const source = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    vm.runInContext(source, context, { filename: rel });
  }

  return { handlers: context.CommandRuntimeHandlers, calls, context, panelRight, propsBody, fontPicker, bgPicker, borderPicker };
}

test('CommandRuntimeHandlers.handleAction dispatches each family and preserves side effects', async () => {
  const runtime = loadHandlers({ exportPdfReject: true, promptValue: '88' });
  const { handlers, calls, context, panelRight, propsBody, fontPicker, bgPicker, borderPicker } = runtime;

  handlers.handleAction('open');
  handlers.handleAction('save');
  handlers.handleAction('save-as');
  handlers.handleAction('export-json');
  handlers.handleAction('preview');
  handlers.handleAction('page-first');
  handlers.handleAction('zoom-in');
  handlers.handleAction('zoom-fit-page');
  handlers.handleAction('cut');
  handlers.handleAction('format-field');
  handlers.handleAction('open-properties');
  handlers.handleAction('color-font');
  handlers.handleAction('color-bg');
  handlers.handleAction('color-border');
  handlers.handleAction('undo');
  handlers.handleAction('redo');
  handlers.handleAction('deselect-all');
  handlers.handleAction('align-lefts');
  handlers.handleAction('same-width');
  handlers.handleAction('same-height');
  handlers.handleAction('bring-forward');
  handlers.handleAction('send-backward');
  handlers.handleAction('group');
  handlers.handleAction('ungroup');
  handlers.handleAction('invert-selection');
  handlers.handleAction('lock-object');
  handlers.handleAction('unlock-object');
  handlers.handleAction('hide-object');
  handlers.handleAction('show-object');
  handlers.handleAction('insert-text');
  handlers.handleAction('insert-section');
  handlers.handleAction('toggle-rulers');
  handlers.handleAction('set-margin-left');
  handlers.handleAction('set-margin-right');
  handlers.handleAction('set-margin-top');
  handlers.handleAction('set-margin-bottom');
  handlers.handleAction('delete-section');
  handlers.handleAction('move-section-up');
  handlers.handleAction('move-section-down');
  handlers.handleAction('rename-section');
  handlers.handleAction('toggle-grid');
  handlers.handleAction('toggle-snap');
  handlers.handleAction('new');
  handlers.handleAction('quit');
  handlers.handleAction('print');
  handlers.handleAction('refresh');
  handlers.handleAction('export-pdf');

  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(calls.file, [
    [],
    [],
    [],
    [],
    [],
  ]);
  assert.deepEqual(calls.preview.map((args) => args.length), [0, 0]);
  assert.deepEqual(calls.zoom[0].slice(0, 2), [1, 'plus']);
  assert.equal(calls.command.length >= 1, true);
  assert.deepEqual(calls.format[0], []);   // format-field → PropertiesEngine.render()
  assert.deepEqual(calls.format[1], []);   // open-properties → PropertiesEngine.render()
  assert.deepEqual(calls.focus[0], ['format']);    // format-field → focusSection('format')
  assert.deepEqual(calls.focus[1], ['general']);   // open-properties → focusSection('general')
  assert.equal(fontPicker.value, '#445566');
  assert.equal(bgPicker.value, '#ffffff');
  assert.equal(borderPicker.value, '#000000');
  assert.deepEqual(calls.insert[0], ['text']);
  assert.equal(calls.layout.some((entry) => entry[0] === 'toggleRulers'), true);
  assert.deepEqual(calls.layout.find((entry) => entry[0] === 'setPageMarginLeft'), ['setPageMarginLeft', 88, 'CommandRuntimeHandlers.setMarginLeft']);
  assert.deepEqual(calls.layout.find((entry) => entry[0] === 'setVisible'), ['setVisible', true]);
  assert.deepEqual(calls.layout.find((entry) => entry[0] === 'setSnapToGrid'), ['setSnapToGrid', true, 'CommandRuntimeHandlers.toggleSnap']);
  assert.equal(calls.selection.some((entry) => entry[0] === 'clearSelectionState' && entry[1] === 'CommandRuntimeHandlers.deselectAll'), true);
  assert.equal(calls.selection.some((entry) => entry[0] === 'setElements' && entry[1] === 'CommandRuntimeHandlers.new' && entry[2] === 0), true);
  assert.equal(calls.selection.some((entry) => entry[0] === 'lockObject'), true);
  assert.equal(calls.selection.some((entry) => entry[0] === 'hideObject'), true);
  assert.equal(calls.command.some((entry) => entry[0] === 'alignLefts'), true);
  assert.equal(calls.command.some((entry) => entry[0] === 'sameWidth'), true);
  assert.equal(calls.command.some((entry) => entry[0] === 'sameHeight'), true);
  assert.equal(calls.command.some((entry) => entry[0] === 'bringForward'), true);
  assert.equal(calls.command.some((entry) => entry[0] === 'sendBackward'), true);
  assert.equal(calls.command.some((entry) => entry[0] === 'group'), true);
  assert.equal(calls.command.some((entry) => entry[0] === 'ungroup'), true);
  assert.equal(calls.command.some((entry) => entry[0] === 'invertSelection'), true);
  assert.equal(calls.renderSections.length, 3);
  assert.equal(calls.clearSelection.length, 3);
  assert.equal(calls.selection.filter((entry) => entry[0] === 'saveHistory').length >= 2, true);
  assert.equal(calls.confirms.length, 2);
  assert.equal(calls.close.length, 1);
  assert.equal(calls.print.length, 1);
  assert.equal(calls.statuses.includes('Datos actualizados'), true);
  assert.equal(calls.statuses.includes('Margen derecho: use Configurar página'), true);
  assert.equal(calls.statuses.includes('Margen inferior: use Configurar página'), true);
  assert.match(calls.alerts.at(-1), /Error al exportar PDF: pdf-fail/);
  assert.equal(calls.command.length >= 4, true);
  assert.equal(context.DS.pageMarginLeft, 88);
  assert.equal(calls.layout.some((entry) => entry[0] === 'insertSection'), true);
  assert.equal(calls.layout.some((entry) => entry[0] === 'deleteSection'), true);
  assert.equal(calls.layout.some((entry) => entry[0] === 'moveSectionUp'), true);
  assert.equal(calls.layout.some((entry) => entry[0] === 'moveSectionDown'), true);
  assert.equal(calls.layout.some((entry) => entry[0] === 'renameSection'), true);
  assert.equal(calls.layout.some((entry) => entry[0] === 'setPageMarginRight'), false);
  assert.equal(calls.layout.some((entry) => entry[0] === 'setPageMarginTop'), true);
  assert.equal(calls.layout.some((entry) => entry[0] === 'setPageMarginBottom'), false);
  assert.equal(context.DS.gridVisible, true);
  assert.equal(context.DS.snapToGrid, true);
});

test('CommandRuntimeHandlers preserves the existing helper adapters', () => {
  const runtime = loadHandlers();
  const { handlers } = runtime;

  handlers.handleViewSelection('preview');
  handlers.handleViewSelection('design');
  handlers.handleZoomSelection('150', 'toolbar-select');
  handlers.handleFormatAction('bold');
  handlers.handleFormatAction('align-left');
  handlers.handleFontFamilyChange('Arial');
  handlers.handleFontSizeChange('18');

  assert.deepEqual(runtime.calls.preview, [[], []]);
  assert.deepEqual(runtime.calls.zoom[0].slice(0, 3), [1.5, undefined, undefined]);
  assert.equal(runtime.calls.zoom[0][3].event, 'toolbar-select');
  assert.equal(runtime.calls.zoom[0][3].fn, 'CommandRuntimeHandlers.handleZoomSelection');
  assert.deepEqual(runtime.calls.format[0], ['bold']);
  assert.deepEqual(runtime.calls.format[1], ['align', 'left']);
  assert.deepEqual(runtime.calls.format[2], ['fontFamily', 'Arial']);
  assert.deepEqual(runtime.calls.format[3], ['fontSize', 18]);
});

test('CommandRuntimeHandlers ignores unknown or empty actions', () => {
  const runtime = loadHandlers();
  runtime.handlers.handleAction('');
  runtime.handlers.handleAction('not-a-command');
  assert.equal(runtime.calls.file.length, 0);
  assert.equal(runtime.calls.preview.length, 0);
  assert.equal(runtime.calls.zoom.length, 0);
  assert.equal(runtime.calls.selection.length, 0);
  assert.equal(runtime.calls.format.length, 0);
  assert.equal(runtime.calls.insert.length, 0);
  assert.equal(runtime.calls.layout.length, 0);
  assert.equal(runtime.calls.dialog.length, 0);
  assert.equal(runtime.calls.system.length, 0);
});

test('CommandRuntimeHandlers keeps margin-right and margin-bottom as status-only actions', () => {
  const runtime = loadHandlers();
  const { handlers, calls, context } = runtime;
  const layoutBefore = calls.layout.length;
  const selectionBefore = calls.selection.length;
  const fileBefore = calls.file.length;
  const previewBefore = calls.preview.length;
  const commandBefore = calls.command.length;
  const statusesBefore = calls.statuses.length;
  const appliedLayoutBefore = calls.appliedLayout;
  const marginLeftBefore = context.DS.pageMarginLeft;
  const marginTopBefore = context.DS.pageMarginTop;
  const gridBefore = context.DS.gridVisible;
  const snapBefore = context.DS.snapToGrid;

  handlers.handleAction('set-margin-right');
  handlers.handleAction('set-margin-bottom');

  assert.equal(calls.layout.length, layoutBefore);
  assert.equal(calls.selection.length, selectionBefore);
  assert.equal(calls.file.length, fileBefore);
  assert.equal(calls.preview.length, previewBefore);
  assert.equal(calls.command.length, commandBefore);
  assert.equal(calls.appliedLayout, appliedLayoutBefore);
  assert.equal(calls.selection.some((entry) => entry[0] === 'saveHistory'), false);
  assert.equal(context.DS.pageMarginLeft, marginLeftBefore);
  assert.equal(context.DS.pageMarginTop, marginTopBefore);
  assert.equal(context.DS.gridVisible, gridBefore);
  assert.equal(context.DS.snapToGrid, snapBefore);
  assert.deepEqual(calls.statuses.slice(statusesBefore), [
    'Margen derecho: use Configurar página',
    'Margen inferior: use Configurar página',
  ]);
});
