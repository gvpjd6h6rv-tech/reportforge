# rf-page-margin-model — Preview page-bounds vs printable-area diagnostic

Read-only visual-ink diagnostic for `AdvancedHtmlEngine.render_preview()`
(`reportforge/core/render/engines/advanced_engine.py`). Proves, from the
REAL rendered DOM (`getBoundingClientRect()`, never CSS/HTML source text),
whether the physical `.rpt-sheet` stays a constant size while `.rpt-page`
(the printable area) follows:

```
printableX     = pageX + marginLeft
printableWidth = pageWidth - marginLeft - marginRight
printableRight = printableX + printableWidth   (must never exceed pageWidth)
```

Born as the instrumentation behind `PAGE-MARGIN-MODEL-01` — the bug where a
large `margins.left` (e.g. 176mm) pushed report content past the fixed white
sheet's right edge, because the `.rpt-page` div's WIDTH never shrank to
account for margins. Kept here as a reusable tool so it never ships in the
normal runtime and any future regression in this specific contract can be
re-verified in one command.

**Two separate width concepts (updated post `PREVIEW-PDF-PARITY-A4-01` /
`PAGE-FRAME-PROD-FACTORY-RECONCILE-01`):** the tool's synthetic layout uses
`contentFrameWidth = 671` purely to drive the printable-area math below —
it is NOT expected to equal the physical sheet. `.rpt-sheet` (`sheetWidth`)
is always true A4 (`794px @96dpi`) for `pageSize:'A4'`, independent of the
layout's own `pageWidth`. Conflating the two was a real staleness bug fixed
during `FACTORY-MOCKUP-A4-RECONCILE-01`'s closure pass (this tool briefly
reported false FAILs after real layouts were migrated to `pageWidth:794`,
because it still asserted the physical sheet against the old `671` legacy
content-frame convention instead of true A4).

## Why source-text regex was not enough

The first attempt at this fix only changed the `.rpt-page{width:...}` CSS
**rule** in `_css()`. Reading the generated CSS *text* showed the right
number. A real browser still rendered the OLD width, because `_page()`
(a separate method) emits `<div class="rpt-page" style="width:...px">` —
an **inline style**, which always wins over any `<style>` rule regardless
of source order or selector. Two independent call sites computed the same
concept and could silently drift apart. This tool measures the live DOM
specifically so that kind of divergence can never hide again.

## What it diagnoses

For each of 5 required margin cases (A–E, see below) it measures:

| Field | Source | Meaning |
|---|---|---|
| `pageWidth` | `.rpt-sheet` `getBoundingClientRect().width` | The physical/visual paper size. Must be constant (794px, true A4) across every case. |
| `printableX` | `.rpt-page` `getBoundingClientRect().left` − `.rpt-sheet`'s | Where the printable area starts, relative to the sheet. |
| `printableWidth` | `.rpt-page` `getBoundingClientRect().width` | The real usable width, computed from `contentFrameWidth` (671, this tool's synthetic layout) minus margins. |
| `printableRight` | `printableX + printableWidth` | Must never exceed the physical sheet (794) — that is the literal "content escapes the sheet" bug. |

It never mutates the product. It only renders through the real engine,
loads the output in a real browser, reads `getBoundingClientRect()`, and
draws non-interactive debug ink (`outline`, background tint).

## Ink legend

- **Blue solid outline** — `.rpt-sheet`, the physical/visual A4 sheet. Must stay the same size and position in every case.
- **Red dashed outline** — `.rpt-page`, the printable area. Starts at `marginLeft`, is `pageWidth - left - right` wide.
- **Green fill** — actual report content (`.cr-el`). Must never render past the blue outline; may be clipped by the red one when margins are large.

## Activate

```bash
python3 tools/diagnostics/rf-page-margin-model/render_margin_cases.py /tmp/margin-cases
node tools/diagnostics/rf-page-margin-model/rf_page_margin_ink_probe.mjs /tmp/margin-cases
```

The first command renders 5 standalone HTML files (one per case) via the
real `AdvancedHtmlEngine`, with debug ink CSS injected. The second loads
each in a real headless browser, measures, screenshots (`case_*.png` next
to the `.html`), and prints a PASS/FAIL table plus full JSON.

## Required cases

| Case | left | right | Expects |
|---|---|---|---|
| A | 0 | 0 | printable area == full page |
| B | 100 | 0 | sheet fixed; printable starts further right; right edge unchanged |
| C | 0 | 100 | sheet fixed; printable ends further left; width shrinks |
| D | 100 | 100 | sheet fixed; printable shrinks from both sides (clamped to 0 if margins exceed pageWidth — never negative) |
| E | 176 | 0 | **the exact user-reported case** — ink must stay within the sheet |

## Bug criterion

**Bug ⇔ any of:** physical `pageWidth` (sheet) changes between cases or ≠ 794 · `printableWidth ≠ contentFrameWidth(671) - left - right` · `printableRight > 794` (escapes the physical sheet).

## Closure criterion

`rf_page_margin_ink_probe.mjs` exits 0 and every row prints `verdict: PASS`.

## ⚠️ Warning

**Read-only diagnostic. It must never patch the product.** It only renders
(through the real engine), measures, and reports. Any fix goes into
`advanced_engine.py`, validated *against* this tool — not inside it.

## Files

- `render_margin_cases.py` — renders the 5 cases through the real engine with debug ink. Pure render step, no measurement, no judgment.
- `rf_page_margin_ink_probe.mjs` — loads each case in a real browser, measures the real DOM, screenshots, judges PASS/FAIL. No rendering logic of its own.
