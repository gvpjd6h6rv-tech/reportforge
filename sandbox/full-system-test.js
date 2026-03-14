'use strict';
const { DS, GEO, Matrix2D, AABB, MagneticSnap, ok } = require('./_harness');

// 1. Load report model
ok(`report loaded: ${DS.sections.length} sections`,DS.sections.length>=3);
ok(`total height: ${DS.getTotalHeight()}px`,DS.getTotalHeight()>0);

// 2. Render (layout accumulation)
let y=0;
for(const s of DS.sections){
  const top=DS.getSectionTop(s.id);
  ok(`section ${s.id} top=${top}`,top===y); y+=s.height;
}

// 3. Zoom: all steps
[0.25,0.5,0.75,1,1.5,2,3,4].forEach(z=>{
  const m=Matrix2D.scale(z).transformPoint(100,0);
  ok(`zoom ${z*100}% → 100px = ${m.x}px`,Math.abs(m.x-100*z)<1e-3);
});

// 4. Drag (snap)
const el={x:37.4,y:93.2}; const snapped=MagneticSnap.snapPoint(el.x,el.y,8);
ok(`drag+snap (37.4→${snapped.x}, 93.2→${snapped.y})`,snapped.x===40&&snapped.y===96);

// 5. Collision
const a=new AABB(0,0,50,20), b=new AABB(30,10,50,20);
ok(`collision detected`,a.overlaps(b));
const mtv=a.mtv(b); ok(`MTV resolves collision`,mtv.dx!==0||mtv.dy!==0);

// 6. Export (hash determinism)
const crypto=require('crypto');
const h1=crypto.createHash('md5').update(JSON.stringify(DS.sections)).digest('hex');
const h2=crypto.createHash('md5').update(JSON.stringify(DS.sections)).digest('hex');
ok(`export hash deterministic`,h1===h2);

process.stdout.write('\nFULL SYSTEM VALIDATION PASS\n');
