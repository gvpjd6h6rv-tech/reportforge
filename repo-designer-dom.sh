#!/usr/bin/env bash
echo "════════════════════════════════════════"
echo "RF DESIGNER DOM CHECK"
echo "════════════════════════════════════════"
python3 reportforge_server.py &
PID=$!
sleep 3
node - <<'EOF'
const SUITE='REPO_DESIGNER_DOM';
const {chromium} = require('playwright');
const fs = require('fs');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport:{width:1400,height:900} });
  await page.goto('http://localhost:8080/classic');
  await page.waitForTimeout(2000);
  let pass=0,fail=0;
  function ok(m){console.log('PASS: '+m);pass++;}
  function bad(m){console.log('FAIL: '+m);fail++;}

  const required = [
    ['ruler-h-canvas','#ruler-h-canvas (horizontal ruler)'],
    ['ruler-v',       '#ruler-v (vertical ruler)'],
    ['workspace',     '#workspace'],
    ['viewport',      '#viewport'],
    ['canvas-layer',  '#canvas-layer'],
    ['ruler-h-row',   '#ruler-h-row'],
    ['ruler-corner',  '#ruler-corner'],
    ['sections-layer','#sections-layer'],
    ['handles-layer', '#handles-layer'],
    ['guide-layer',   '#guide-layer'],
  ];
  for(const [id,label] of required){
    const el=document.getElementById(id);
    if(!el){bad('MISSING: '+label); process.exit(1);}
    else ok(label+' exists');
  }
  // Also verify by alias IDs
  const aliases=[['h-ruler','#h-ruler alias'],['v-ruler','#v-ruler alias'],['section-gutter','#section-gutter']];
  for(const [id,label] of aliases){
    if(document.getElementById(id)) ok(label+' exists');
    else bad('MISSING: '+label);
  }
  console.log('\n──────────────────────────────');
  console.log(SUITE+': '+pass+' PASS, '+fail+' FAIL');
  await browser.close();
  if(fail>0)process.exit(1);
})().catch(e=>{console.log('FAIL: '+e.message.slice(0,150));process.exit(1);});
EOF
kill $PID 2>/dev/null
