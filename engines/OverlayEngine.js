'use strict';

const OverlayEngine = {
  render(){
    if (typeof RenderScheduler !== 'undefined' && !RenderScheduler.allowsDomWrite()) {
      RenderScheduler.visual(() => OverlayEngine.render(), 'OverlayEngine.render');
      return;
    }
    if (typeof RenderScheduler !== 'undefined') {
      RenderScheduler.assertDomWriteAllowed('OverlayEngine.render');
    }
    RF.Geometry.invalidate();
    this.renderHRuler();
    this.renderVRuler();
  },
  renderHRuler(){
    const canvas=document.getElementById('ruler-h-inner');
    const ws=document.getElementById('workspace');
    const cl=document.getElementById('canvas-layer');
    const cssW=ws.clientWidth;
    const cssH=16;
    const clR=cl.getBoundingClientRect(), wsR=ws.getBoundingClientRect();
    const canvasOffX=Math.round(clR.left-wsR.left);
    const canvasW=Math.round(clR.width);
    const dpr=window.devicePixelRatio||1;
    canvas.width=Math.round(cssW*dpr);
    canvas.height=Math.round(cssH*dpr);
    canvas.style.width=cssW+'px';
    canvas.style.height=cssH+'px';
    const ctx=canvas.getContext('2d');
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.fillStyle='#C0C0C0';ctx.fillRect(0,0,cssW,cssH);
    ctx.fillStyle='#FFFFFF';ctx.fillRect(canvasOffX,0,canvasW,cssH);
    ctx.strokeStyle='#888888';ctx.lineWidth=0.5;ctx.beginPath();
    ctx.moveTo(0,cssH-0.5);ctx.lineTo(cssW,cssH-0.5);ctx.stroke();
    ctx.lineWidth=1;
    ctx.strokeStyle='#000000';ctx.fillStyle='#222222';ctx.font='9px Segoe UI,Tahoma,sans-serif';
    const step=RF.Geometry.zoom()>=1.5?10:20;
    for(let i=0;i<=CFG.PAGE_W;i+=step){
      const x=canvasOffX + RF.Geometry.scale(i);
      if(x<canvasOffX-0.5||x>canvasOffX+canvasW+0.5) continue;
      const isMajor=(i%(step*5)===0);
      const tickH=isMajor?9:5;
      ctx.beginPath();ctx.moveTo(x,cssH-tickH);ctx.lineTo(x,cssH);ctx.stroke();
      if(isMajor&&i>0){
        ctx.fillText(i,x-6,cssH-tickH-1);
      }
    }
  },
  renderVRuler(){
    const canvasEl=document.getElementById('ruler-v-inner');
    const vTop=RF.Geometry.rulerVTop();
    canvasEl.style.top=vTop+'px';
    const clEl=document.getElementById('canvas-layer');
    const cssH=clEl ? Math.round(clEl.getBoundingClientRect().height) : Math.ceil(RF.Geometry.scale(DS.getTotalHeight()));
    const GUTTER_W = 14;
    const RULER_W = 8;
    const TOTAL_W = GUTTER_W + RULER_W;
    const cssW = TOTAL_W;
    const dpr=window.devicePixelRatio||1;
    canvasEl.width=Math.round(cssW*dpr);
    canvasEl.height=Math.round(cssH*dpr);
    canvasEl.style.width=cssW+'px';
    canvasEl.style.height=cssH+'px';
    const ctx=canvasEl.getContext('2d');
    ctx.setTransform(dpr,0,0,dpr,0,0);
    const totalH=cssH;

    ctx.clearRect(0,0,cssW,totalH);
    ctx.fillStyle='#FFFFFF';ctx.fillRect(0,0,cssW,totalH);

    ctx.font='8px Segoe UI,Tahoma,sans-serif';
    DS.sections.forEach(sec=>{
      const secDiv=document.querySelector(`.cr-section[data-section-id="${sec.id}"]`);
      const band=RF.Geometry.sectionBand(secDiv);
      const bandY=band ? band.y : RF.Geometry.scale(DS.getSectionTop(sec.id));
      const bandH=band ? band.h : RF.Geometry.scale(sec.height);
      const sColor={'rh':'#FFFDE7','ph':'#E8F5E9','det':'#FFF','pf':'#E3F2FD','rf':'#FCE4EC','gh':'#F3E5F5','gf':'#FFF3E0'}[sec.stype]||'#F5F5F5';
      ctx.fillStyle=sColor;
      ctx.fillRect(0,bandY,GUTTER_W,bandH);
      ctx.fillStyle='#555555';
      ctx.save();
      ctx.translate(GUTTER_W/2, bandY+bandH/2);
      ctx.rotate(-Math.PI/2);
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(sec.abbr, 0, 0);
      ctx.restore();
      ctx.strokeStyle='#CCCCCC';ctx.beginPath();
      ctx.moveTo(0,bandY+bandH);ctx.lineTo(TOTAL_W,bandY+bandH);ctx.stroke();
    });

    ctx.strokeStyle='#AAAAAA';ctx.beginPath();
    ctx.moveTo(GUTTER_W,0);ctx.lineTo(GUTTER_W,totalH);ctx.stroke();

    ctx.strokeStyle='#000000';ctx.fillStyle='#222222';ctx.font='9px Segoe UI,Tahoma,sans-serif';
    const step = RF.Geometry.zoom() >= 1.5 ? 10 : 20;
    for(let i=0; i<=RF.Geometry.unscale(totalH); i+=step){
      const y = RF.Geometry.scale(i);
      if(y > totalH+0.5) break;
      const isMajor = (i % (step*5) === 0);
      const tickLen = isMajor ? RULER_W : Math.floor(RULER_W/2);
      ctx.beginPath();
      ctx.moveTo(GUTTER_W, y);
      ctx.lineTo(GUTTER_W+tickLen, y);
      ctx.stroke();
      if(isMajor && i>0){
        ctx.save();
        ctx.translate(GUTTER_W + RULER_W/2, y);
        ctx.rotate(-Math.PI/2);
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText(i, 0, 0);
        ctx.restore();
      }
    }
  },
  updateCursor(x,y){
  }
};
OverlayEngine.__active = true;

if (typeof module !== 'undefined') {
  module.exports = OverlayEngine;
}
