# Formulas

## Overview

ReportForge formulas use a Crystal Reports–compatible syntax. Formulas are referenced as `{FormulaName}` in field elements.

## Syntax

```
// String
{customer.name} + " - " + {customer.city}

// Numeric
{order.qty} * {order.unit_price}

// Conditional
If {order.total} > 1000 Then "VIP" Else "Standard"

// Date
Year({order.date}) & "/" & Month({order.date})
```

## Built-in functions

| Category | Functions |
|----------|-----------|
| String   | `Trim`, `Left`, `Right`, `Mid`, `Len`, `Upper`, `Lower`, `Replace` |
| Numeric  | `Round`, `Abs`, `Int`, `Mod`, `Sqrt`, `Power` |
| Date     | `Year`, `Month`, `Day`, `Hour`, `Minute`, `DateDiff`, `DateAdd` |
| Summary  | `Sum`, `Count`, `Average`, `Min`, `Max`, `First`, `Last` |
| Boolean  | `IsNull`, `Not`, `And`, `Or` |

## Formula Workshop

Open via **Report → Formula Workshop** (Ctrl+F).

- Left panel: formula tree (field formulas, selection formulas, formatting formulas)
- Center: Monaco-style editor with autocomplete
- Right: function reference

## Running Totals

Open via **Report → Running Total Expert**.

| Property | Description |
|----------|-------------|
| Field to summarize | Source field path |
| Type | Sum / Count / Average / Min / Max |
| Evaluate | On change of group / record / formula |
| Reset | On change of group / page / never |

Reference as `{#RunningTotalName}` in elements.
