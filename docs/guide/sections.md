# Section System — ReportForge v18.0

## Section Types

ReportForge implements the Crystal Reports banded section model:

| Type | `stype` | Description |
|------|---------|-------------|
| Report Header | `RH` | Prints once at start of report |
| Page Header | `PH` | Prints at top of each page |
| Group Header N | `GH` | Before each group (multiple allowed) |
| Detail | `D` | Repeats for each data row |
| Group Footer N | `GF` | After each group |
| Page Footer | `PF` | Prints at bottom of each page |
| Report Footer | `RF` | Prints once at end of report |

## Section Properties

Each section in `DS.sections[]`:

```javascript
{
  id: "sec_1",
  stype: "D",          // section type code
  label: "Detail a",   // display label
  height: 120,         // height in pixels (document units)
  visible: true,       // visibility flag
}
```

## Section Commands

All section commands are in `CommandEngine`:

```javascript
CommandEngine.insertSection()     // insert new section after current
CommandEngine.deleteSection()     // delete section + all its elements
CommandEngine.moveSectionUp()     // swap with previous section
CommandEngine.moveSectionDown()   // swap with next section
CommandEngine.renameSection()     // prompt for new label
```

## Layout Calculation

Section y-offsets are computed by `DS.getSectionTop(sectionId)`:

```javascript
// Accumulate heights of all preceding sections
getSectionTop(id) {
  let y = 0;
  for (const sec of this.sections) {
    if (sec.id === id) return y;
    y += sec.height;
  }
  return y;
}
```

Element coordinates (`el.x`, `el.y`) are always **relative to their section**, not the whole canvas. The absolute canvas position is `getSectionTop(el.sectionId) + el.y`.
