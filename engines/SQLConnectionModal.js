'use strict';
var _global = globalThis;

function _fields() {
  const fields = _global.SQLConnectionModalFields;
  if (!fields || typeof fields.readFields !== 'function' || typeof fields.validate !== 'function') {
    throw new Error('SQLConnectionModalFields is required before opening the SQL connection modal');
  }
  return fields;
}

function _show(statusEl, response, context) {
  const diagnosis = _global.SQLConnectionDiagnosis.describeResponse(response, context);
  _global.SQLConnectionModalView.renderStatus(statusEl, diagnosis);
  return diagnosis;
}

async function _run(mode) {
  if (!this.modal) return;
  const fields = _fields();
  const values = fields.readFields(this.modal.fields);
  const error = fields.validate(mode, values);
  if (error) {
    _show(this.modal.status, { message: error, details: { debugCode: error } }, values);
    return;
  }

  _global.SQLConnectionModalView.renderStatus(this.modal.status, {
    type: 'busy',
    text: mode === 'save' ? 'Guardando…' : 'Probando conexión…',
  });

  try {
    const response = mode === 'save'
      ? await _global.SQLConnectionModalApi.saveConnection(_global.fetch, values)
      : await _global.SQLConnectionModalApi.testConnection(_global.fetch, values);
    const diagnosis = _show(this.modal.status, response, values);
    if (diagnosis.ok || diagnosis.registered) {
      _global.SQLConnectionModalStorage.savePrefs(values);
    }
  } catch (error) {
    const name = _global.SQLConnectionDiagnosis.sanitizeText(error && error.name ? error.name : 'Error');
    const message = _global.SQLConnectionDiagnosis.sanitizeText(error && error.message ? error.message : 'Error de red');
    _show(this.modal.status, {
      message: 'Error de red: ' + message,
      details: {
        debugCode: name + ': ' + message,
        suggestion: 'Verifica la conectividad entre el navegador y el servidor.',
      },
    }, values);
  }
}

function _open() {
  if (this.modal) return;
  this.modal = _global.SQLConnectionModalView.buildModal(_global.document);
  _global.SQLConnectionModalStorage.applyPrefs(this.modal.fields, _global.SQLConnectionModalStorage.loadPrefs());
  _global.SQLConnectionModalView.wireButtons({
    buttons: this.modal.buttons,
    onClose: _close.bind(this),
    onTest: _run.bind(this, 'test'),
    onSave: _run.bind(this, 'save'),
  });
  _global.SQLConnectionModalView.wireKeyboard({
    root: this.modal.root,
    onTest: _run.bind(this, 'test'),
  });
}

function _close() {
  if (!this.modal) return;
  _global.SQLConnectionModalView.destroyModal(this.modal.root);
  this.modal = null;
}

const SQLConnectionModal = {
  modal: null,
  open: _open,
  close: _close,
  runAction: _run,
  show: _show,
};

_global.SQLConnectionModal = SQLConnectionModal;
if (typeof module !== 'undefined') module.exports = SQLConnectionModal;
