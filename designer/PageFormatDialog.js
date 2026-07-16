const DIALOG_ID = 'rf-page-format-dialog';
const TICKET_WIDTHS = [58, 70, 76];

function closePageFormatDialog() {
  document.getElementById(DIALOG_ID)?.remove();
}

function field(label, control) {
  const row = document.createElement('label');
  row.style.cssText = 'display:grid;grid-template-columns:120px 1fr;gap:10px;align-items:center;margin:10px 0';
  const caption = document.createElement('span');
  caption.textContent = label;
  row.append(caption, control);
  return row;
}

function select(options, value) {
  const control = document.createElement('select');
  control.style.cssText = 'width:100%;padding:6px;border:1px solid #aaa;border-radius:4px';
  for (const [optionValue, label] of options) {
    const option = document.createElement('option');
    option.value = optionValue;
    option.textContent = label;
    option.selected = String(optionValue) === String(value);
    control.appendChild(option);
  }
  return control;
}

export function openPageFormatDialog({ current, onApply }) {
  closePageFormatDialog();
  const state = current || { format: 'A4', ticketWidthMm: 76 };

  const overlay = document.createElement('div');
  overlay.id = DIALOG_ID;
  overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.35);display:grid;place-items:center';

  const panel = document.createElement('section');
  panel.style.cssText = 'width:360px;background:#fff;color:#111;border-radius:10px;box-shadow:0 12px 40px rgba(0,0,0,.35);padding:18px;font:13px/1.4 Arial,sans-serif';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Formato de página');

  const title = document.createElement('h2');
  title.textContent = 'Formato de página';
  title.style.cssText = 'font-size:17px;margin:0 0 12px';

  const formatSelect = select([['A4', 'A4'], ['TICKET', 'Ticket']], state.format);
  const widthSelect = select(TICKET_WIDTHS.map((width) => [width, `${width} mm`]), state.ticketWidthMm || 76);
  const widthRow = field('Ancho del ticket', widthSelect);

  const help = document.createElement('p');
  help.textContent = 'Ticket conserva el alto actual del diseño y cambia el ancho físico del papel.';
  help.style.cssText = 'margin:12px 0;color:#555;font-size:12px';

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:16px';
  const cancel = document.createElement('button');
  cancel.textContent = 'Cancelar';
  const apply = document.createElement('button');
  apply.textContent = 'Aplicar';
  apply.style.cssText = 'background:#1769aa;color:#fff;border:0;border-radius:5px;padding:7px 14px';
  cancel.style.cssText = 'padding:7px 14px';
  actions.append(cancel, apply);

  function syncWidthVisibility() {
    widthRow.style.display = formatSelect.value === 'TICKET' ? 'grid' : 'none';
  }

  formatSelect.addEventListener('change', syncWidthVisibility);
  cancel.addEventListener('click', closePageFormatDialog);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closePageFormatDialog();
  });
  apply.addEventListener('click', () => {
    onApply?.({
      format: formatSelect.value,
      ticketWidthMm: Number(widthSelect.value),
    });
    closePageFormatDialog();
  });

  panel.append(title, field('Formato', formatSelect), widthRow, help, actions);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  syncWidthVisibility();
  formatSelect.focus();
}

export { closePageFormatDialog };
