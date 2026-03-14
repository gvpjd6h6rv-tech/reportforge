'use strict';
const { GEO, Matrix2D, AABB, MagneticSnap, DS, ok } = require('./_harness');

// RF.Geometry API contract
['invalidate','canvasRect','scrollRect','rulerVRect','elementRect','sectionBand',
 'canvasLeft','rulerVTop','toCanvasSpace','getCanvasRect','getElementRect','getSectionRect',
 'canvasMatrix','canvasMatrixInverse','elementAABB','allElementAABBs','findOverlaps',
 'Matrix2D','AABB','MagneticSnap','PointerNorm'].forEach(fn=>{
  ok(`RF.Geometry.${fn} exists`, fn in GEO);
});

// Matrix2D contract
ok('Matrix2D.identity() returns instance', Matrix2D.identity() instanceof Matrix2D);
ok('Matrix2D.translate returns instance', Matrix2D.translate(1,2) instanceof Matrix2D);
ok('Matrix2D.multiply returns instance', Matrix2D.identity().multiply(Matrix2D.scale(2)) instanceof Matrix2D);
ok('transformPoint returns {x,y}', 'x' in Matrix2D.identity().transformPoint(0,0));

// AABB contract
const a=new AABB(0,0,10,10);
ok('AABB.overlaps is boolean', typeof a.overlaps(a)==='boolean');
ok('AABB.intersection returns AABB or null', a.intersection(a) instanceof AABB || a.intersection(new AABB(99,99,1,1))===null);
ok('AABB.mtv returns {dx,dy}', 'dx' in a.mtv(a));

// MagneticSnap contract
ok('snap returns number', typeof MagneticSnap.snap(7.9,8)==='number');
ok('snapPoint returns {x,y}', 'x' in MagneticSnap.snapPoint(1,2));
ok('isOnGrid returns boolean', typeof MagneticSnap.isOnGrid(8)==='boolean');

// DS contract
ok('DS.getSectionTop(s-rh)===0', DS.getSectionTop('s-rh')===0);
ok('DS.getTotalHeight()>0', DS.getTotalHeight()>0);

process.stdout.write('\nCONTRACT TEST PASS\n');
