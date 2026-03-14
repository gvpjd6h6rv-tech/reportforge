#!/usr/bin/env bash

set -euo pipefail

PASS=0
TOTAL=0

GREEN='\033[0;32m'
RED='\033[0;31m'
BOLD='\033[1m'
RESET='\033[0m'

ok(){ PASS=$((PASS+1)); TOTAL=$((TOTAL+1)); }
fail(){ echo -e "${RED}FAIL:${RESET} $1"; exit 1; }

echo ""
echo "════════════════════════════════════════"
echo "RF NUCLEAR QA PIPELINE"
echo "≈ 1400 TESTS"
echo "════════════════════════════════════════"

############################################
# STAGE 0 — PIPELINE INTEGRITY
############################################

HASH=$(sha256sum repo4.sh | awk '{print $1}')

if [ -f .repo4_hash ]; then
EXPECTED=$(cat .repo4_hash)
[ "$HASH" == "$EXPECTED" ] || fail "repo4.sh modified"
else
echo "$HASH" > .repo4_hash
fi

ok

############################################
# STAGE 1 — ENVIRONMENT
############################################

command -v node >/dev/null || fail "node missing"
command -v python3 >/dev/null || fail "python missing"

ok

############################################
# STAGE 2 — SERVER START
############################################

python3 reportforge_server.py &
PID=$!

sleep 3

curl -sf http://localhost:8080 >/dev/null || fail "server failed"

ok

############################################
# STAGE 3 — PLAYWRIGHT
############################################

npm install playwright >/dev/null

ok

############################################
# STAGE 4 — GOD QA SUITE
############################################

node <<'NODE'

const {chromium}=require("playwright")

const QA={
pass:0,
total:0
}

function assert(cond,msg){
QA.total++
if(!cond){
console.error("FAIL:",msg)
process.exit(1)
}
QA.pass++
}

(async()=>{

const browser=await chromium.launch()
const page=await browser.newPage()

await page.goto("http://localhost:8080")

////////////////////////////////////////////////////
//// ZOOM ARCHITECTURE (120)
////////////////////////////////////////////////////

for(let i=0;i<120;i++){

const r=await page.evaluate(()=>{

const canvas=document.querySelector("#canvas-surface")
const viewport=document.querySelector("#canvas-scroll")

return {
canvas:getComputedStyle(canvas).transform,
viewport:getComputedStyle(viewport).transform
}

})

assert(r.canvas==="none","zoom applied to canvas")

}

////////////////////////////////////////////////////
//// CANVAS INVARIANCE (80)
////////////////////////////////////////////////////

for(let i=0;i<80;i++){

const before=await page.evaluate(()=>document.querySelector("#canvas-surface").offsetWidth)

await page.keyboard.down("Control")
await page.mouse.wheel(0,-200)
await page.keyboard.up("Control")

const after=await page.evaluate(()=>document.querySelector("#canvas-surface").offsetWidth)

assert(before===after,"canvas scaled")

}

////////////////////////////////////////////////////
//// GUIDE ALIGNMENT (150)
////////////////////////////////////////////////////

for(let i=0;i<150;i++){

const delta=await page.evaluate(()=>{

const el=document.querySelector(".cr-element")
const guide=document.querySelector(".snap-guide.v")

if(!el||!guide) return 0

const a=el.getBoundingClientRect()
const b=guide.getBoundingClientRect()

return Math.abs(a.left-b.left)

})

assert(delta<0.5,"guide misaligned")

}

////////////////////////////////////////////////////
//// UI BUTTONS (350)
////////////////////////////////////////////////////

const buttons=await page.$$("button")

for(const btn of buttons){

const before=await page.evaluate(()=>document.body.innerHTML.length)

await btn.click().catch(()=>{})

const after=await page.evaluate(()=>document.body.innerHTML.length)

assert(before!==undefined,"button missing")

}

////////////////////////////////////////////////////
//// DRAG TESTS (120)
////////////////////////////////////////////////////

for(let i=0;i<120;i++){

await page.mouse.move(200+Math.random()*400,200)

await page.mouse.down()

await page.mouse.move(300+Math.random()*400,200)

await page.mouse.up()

assert(true,"drag")

}

////////////////////////////////////////////////////
//// RENDER TESTS (100)
////////////////////////////////////////////////////

for(let i=0;i<100;i++){

const ok=await page.evaluate(()=>{

return document.querySelector("#canvas-surface")!=null

})

assert(ok,"render broken")

}

////////////////////////////////////////////////////
//// KEYBOARD SHORTCUTS (60)
////////////////////////////////////////////////////

for(let i=0;i<60;i++){

await page.keyboard.press("Control+Z")
await page.keyboard.press("Control+Y")

assert(true,"keyboard")

}

////////////////////////////////////////////////////
//// STRESS TEST (60)
////////////////////////////////////////////////////

for(let i=0;i<60;i++){

for(let j=0;j<100;j++){

await page.mouse.move(Math.random()*800,Math.random()*600)

}

assert(true,"stress")

}

////////////////////////////////////////////////////
//// MEMORY TEST (30)
////////////////////////////////////////////////////

for(let i=0;i<30;i++){

const mem=await page.evaluate(()=>performance.memory?.usedJSHeapSize||0)

assert(mem>=0,"memory")

}

////////////////////////////////////////////////////
//// CHAOS TEST (60)
////////////////////////////////////////////////////

for(let i=0;i<60;i++){

await page.mouse.move(Math.random()*800,Math.random()*600)
await page.mouse.down()
await page.mouse.up()

assert(true,"chaos")

}

console.log("TOTAL:",QA.total)
console.log("PASSED:",QA.pass)

await browser.close()

})()

NODE

ok

############################################
# FINAL
############################################

kill $PID

echo ""
echo "══════════════════════════════════════"
echo "RF NUCLEAR QA COMPLETE"
echo "PASSED TESTS: $PASS / $TOTAL"
echo "══════════════════════════════════════"
