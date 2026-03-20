import RF from '../rf.js';

const IDS = Object.freeze({
  workspace: 'workspace',
  viewport: 'canvas-scroll',
  canvasLayer: 'canvas-surface',
  rulerH: 'ruler-h',
  rulerV: 'ruler-v',
  rulerCorner: 'ruler-corner',
  selectionLayer: 'sel-layer',
  marquee: 'marquee',
  sectionLabelColumn: 'sec-label-col-inner',
});

function byId(id) {
  return document.getElementById(id);
}

RF.DOM = Object.freeze({
  IDS,
  workspace: () => byId(IDS.workspace),
  viewport: () => byId(IDS.viewport),
  canvasLayer: () => byId(IDS.canvasLayer),
  rulerH: () => byId(IDS.rulerH),
  rulerV: () => byId(IDS.rulerV),
  rulerCorner: () => byId(IDS.rulerCorner),
  selectionLayer: () => byId(IDS.selectionLayer),
  marquee: () => byId(IDS.marquee),
  sectionLabelColumn: () => byId(IDS.sectionLabelColumn),
  sectionWrap: secId => byId(`sec-${secId}`),
  sectionBody: secId => byId(`secbody-${secId}`),
  sectionResize: secId => byId(`secresize-${secId}`),
  sectionLabelCell: secId => document.querySelector(`.rf-sec-label-cell[data-secid="${secId}"]`),
  sectionBodies: () => [...document.querySelectorAll('.rf-sec-body[data-secid]')],
});

export default RF;
