'use strict';
const { DS, ok } = require('./_harness');
const crypto=require('crypto');

function layoutSnapshot(){
  return DS.sections.map(s=>`${s.id}:${s.height}:${DS.getSectionTop(s.id)}`).join('|');
}

const snapshots=[];
for(let i=0;i<5;i++) snapshots.push(crypto.createHash('sha256').update(layoutSnapshot()).digest('hex'));
ok('5 snapshots identical (deterministic layout)',new Set(snapshots).size===1);

// Snapshot changes when model changes
const origH=DS.sections[0].height;
DS.sections[0].height=999;
const changedSnap=crypto.createHash('sha256').update(layoutSnapshot()).digest('hex');
DS.sections[0].height=origH;
ok('snapshot changes when model mutates',changedSnap!==snapshots[0]);
ok('snapshot restored after revert',crypto.createHash('sha256').update(layoutSnapshot()).digest('hex')===snapshots[0]);

process.stdout.write('\nSNAPSHOT TEST PASS\n');
