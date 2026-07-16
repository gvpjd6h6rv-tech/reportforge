import { PAGE_FORMATS, buildPageFormatLayout, getPageFormatState } from './PageFormatModel.js';
import { openPageFormatDialog } from '../designer/PageFormatDialog.js';

function formatLabel(state) {
  return state.format === 'TICKET' ? `Ticket ${state.ticketWidthMm} mm` : 'A4';
}

export function openPageFormatCommand({ file, apply, setStatus }) {
  if (!file || !apply) {
    setStatus('No se pudo abrir el selector de formato de página');
    return;
  }

  openPageFormatDialog({
    current: getPageFormatState(file._currentLayout),
    ticketWidths: PAGE_FORMATS.TICKET.widthsMm,
    onApply(selection) {
      const next = buildPageFormatLayout(file._currentLayout, selection);
      file._currentLayout = next;
      apply.applyPageMetrics(next, next);
      apply.refreshPageLayout();
      setStatus(`✓ Formato de página: ${formatLabel(getPageFormatState(next))}`);
    },
  });
}
