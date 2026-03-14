# Layout Schema

A report layout is a JSON object (`.rfd.json`) that describes all sections, elements, and configuration.

## Top-level

```json
{
  "name": "Sales Report",
  "pageSize": "A4",
  "orientation": "portrait",
  "pageWidth": 794,
  "pageHeight": 1123,
  "sections": [ ... ],
  "elements": [ ... ],
  "formulas": { ... },
  "parameters": [ ... ],
  "groups": [ ... ],
  "runningTotals": [ ... ]
}
```

## Element types

### Text

```json
{
  "id": "el-001", "type": "text", "sectionId": "s4",
  "x": 10, "y": 2, "w": 200, "h": 18,
  "content": "Hello World",
  "fontFamily": "Tahoma", "fontSize": 10,
  "bold": false, "italic": false, "underline": false,
  "align": "left", "color": "#000000", "bgColor": "transparent"
}
```

### Field

```json
{
  "id": "el-002", "type": "field", "sectionId": "s4",
  "x": 220, "y": 2, "w": 100, "h": 18,
  "fieldPath": "{items.name}",
  "fieldFmt": "",
  "fontFamily": "Tahoma", "fontSize": 10
}
```

### Line

```json
{
  "id": "el-003", "type": "line", "sectionId": "s2",
  "x": 0, "y": 16, "w": 794, "h": 1,
  "lineDir": "h", "lineWidth": 1, "color": "#000000"
}
```

### Rectangle

```json
{
  "id": "el-004", "type": "rect", "sectionId": "s1",
  "x": 10, "y": 5, "w": 300, "h": 50,
  "borderWidth": 1, "borderStyle": "solid", "borderColor": "#000000",
  "bgColor": "#F0F0F0"
}
```

### Image

```json
{
  "id": "el-005", "type": "image", "sectionId": "s1",
  "x": 600, "y": 5, "w": 150, "h": 60,
  "imageSrc": "logo.png",
  "fit": "contain"
}
```

### Chart

```json
{
  "id": "el-006", "type": "chart", "sectionId": "s7",
  "x": 50, "y": 10, "w": 500, "h": 200,
  "chartType": "bar",
  "fieldPath": "{items.total}",
  "groupBy": "{items.category}"
}
```

## Field path syntax

| Pattern | Resolves to |
|---------|------------|
| `{items.name}` | Field `name` from data rows |
| `{FormulaName}` | Result of formula `FormulaName` |
| `{#RunningTotal1}` | Running total value |
| `{?ParamName}` | Parameter value |
| `{PageNumber}` | Current page number |
| `{TotalPages}` | Total pages |
| `{PrintDate}` | Report print date |

## Conditional formatting

```json
{
  "conditionalStyles": [
    {
      "field": "{items.total}",
      "op": ">",
      "value": "1000",
      "color": "#CC0000",
      "bgColor": "#FFE0E0",
      "bold": true
    }
  ]
}
```
