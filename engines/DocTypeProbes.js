'use strict';

window.__rfVerify = function(){
  RF.Geometry.invalidate();
  const results = {};
  const sR = RF.Geometry.scrollRect();
  const cR = RF.Geometry.canvasRect();
  const workspaceCX = sR.left + sR.width/2;
  const canvasCX = cR.left + cR.width/2;
  results.bug1_workspace_cx = workspaceCX.toFixed(1);
  results.bug1_canvas_cx = canvasCX.toFixed(1);
  results.bug1_delta = Math.abs(workspaceCX - canvasCX).toFixed(2);
  results.bug1_pass = parseFloat(results.bug1_delta) < 2;
  const vTop = RF.Geometry.rulerVTop();
  results.bug2_ruler_vTop = vTop.toFixed(2);
  results.bug2_sections = [];
  DS.sections.forEach(sec => {
    const secDiv = document.querySelector(`.cr-section[data-section-id="${sec.id}"]`);
    const band = RF.Geometry.sectionBand(secDiv);
    results.bug2_sections.push({id:sec.id, band_y:(band?band.y.toFixed(1):'N/A'), band_h:(band?band.h.toFixed(1):'N/A')});
  });
  results.bug2_pass = vTop >= 0 && results.bug2_sections.every(s => s.band_y !== 'N/A');
  const selBoxes = document.querySelectorAll('.sel-box');
  results.bug3_sel_box_count = selBoxes.length;
  if (selBoxes.length === 1 && DS.selection.size === 1) {
    const id = [...DS.selection][0];
    const elDiv = document.querySelector(`.cr-element[data-id="${id}"]`);
    const gr = RF.Geometry.elementRect(elDiv);
    const sbR = selBoxes[0].getBoundingClientRect();
    const sbX = RF.Geometry.unscale(sbR.left-cR.left), sbY = RF.Geometry.unscale(sbR.top-cR.top);
    results.bug3_element_x = gr ? gr.left.toFixed(2) : 'N/A';
    results.bug3_element_y = gr ? gr.top.toFixed(2) : 'N/A';
    results.bug3_selbox_x = sbX.toFixed(2);
    results.bug3_selbox_y = sbY.toFixed(2);
    results.bug3_delta_x = gr ? Math.abs(gr.left-sbX).toFixed(2) : 'N/A';
    results.bug3_delta_y = gr ? Math.abs(gr.top-sbY).toFixed(2) : 'N/A';
    results.bug3_pass = gr ? parseFloat(results.bug3_delta_x) < 2 && parseFloat(results.bug3_delta_y) < 2 : null;
  } else {
    results.bug3_pass = selBoxes.length === 0;
  }
  console.table(results);
  return results;
};

