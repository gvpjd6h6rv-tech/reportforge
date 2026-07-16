const CSS_PX_PER_MM = 96 / 25.4;

export const PAGE_FORMATS = Object.freeze({
  A4: Object.freeze({
    pageSize: 'A4',
    pageWidthPx: 794,
    pageHeightPx: 1123,
    marginsMm: Object.freeze({ top: 15, right: 20, bottom: 15, left: 20 }),
  }),
  TICKET: Object.freeze({
    pageSize: 'TICKET',
    widthsMm: Object.freeze([58, 70, 76]),
    defaultWidthMm: 76,
    pageHeightPx: 1123,
    marginsMm: Object.freeze({ top: 3, right: 3, bottom: 3, left: 3 }),
  }),
});

function ticketWidth(value) {
  const ticket = PAGE_FORMATS.TICKET;
  const width = Number(value);
  return ticket.widthsMm.includes(width) ? width : ticket.defaultWidthMm;
}

function nearestTicketWidth(pageWidth) {
  const ticket = PAGE_FORMATS.TICKET;
  const mm = Number(pageWidth) / CSS_PX_PER_MM;
  return ticket.widthsMm.reduce((best, width) => (
    Math.abs(width - mm) < Math.abs(best - mm) ? width : best
  ), ticket.defaultWidthMm);
}

function copyMargins(value, fallback) {
  const source = value && typeof value === 'object' ? value : fallback;
  return {
    top: Number(source.top), right: Number(source.right),
    bottom: Number(source.bottom), left: Number(source.left),
  };
}

export function getPageFormatState(layout = {}) {
  const format = String(layout.pageSize || '').toUpperCase() === 'TICKET' ? 'TICKET' : 'A4';
  return {
    format,
    ticketWidthMm: format === 'TICKET'
      ? ticketWidth(layout.ticketWidthMm || nearestTicketWidth(layout.pageWidth))
      : PAGE_FORMATS.TICKET.defaultWidthMm,
  };
}

export function buildPageFormatLayout(layout = {}, selection = {}) {
  const current = getPageFormatState(layout);
  const format = String(selection.format || '').toUpperCase() === 'TICKET' ? 'TICKET' : 'A4';
  const preset = PAGE_FORMATS[format];
  const margins = copyMargins(current.format === format ? layout.margins : null, preset.marginsMm);

  if (format === 'A4') {
    return {
      ...layout,
      pageSize: preset.pageSize,
      pageWidth: preset.pageWidthPx,
      pageHeight: preset.pageHeightPx,
      orientation: 'portrait',
      ticketWidthMm: null,
      margins,
    };
  }

  const widthMm = ticketWidth(selection.ticketWidthMm);
  const currentHeight = Number(layout.pageHeight);
  return {
    ...layout,
    pageSize: preset.pageSize,
    pageWidth: Math.round(widthMm * CSS_PX_PER_MM),
    pageHeight: Number.isFinite(currentHeight) && currentHeight > 0
      ? currentHeight
      : preset.pageHeightPx,
    orientation: 'portrait',
    ticketWidthMm: widthMm,
    margins,
  };
}
