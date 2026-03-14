// docs/.vitepress/components/rptData.js
// Mock Crystal Reports .rpt file structures for the workbench

export const RPT_FILES = [
  {
    id: 'sales_q4',
    name: 'SalesReport_Q4_2024.rpt',
    size: '284 KB',
    modified: '2024-12-18',
    icon: '📊',
    connection: 'SQL Server — PROD\\REPORTS',
    sections: [
      {
        id: 'rh', type: 'RH', label: 'Report Header', height: 72,
        elements: [
          { id: 'e1', type: 'picture',  label: 'CompanyLogo',    x: 8,   y: 8,  w: 120, h: 40, content: 'logo.png' },
          { id: 'e2', type: 'text',     label: 'ReportTitle',    x: 148, y: 14, w: 280, h: 26, content: 'Q4 2024 Sales Report', bold: true, fontSize: 16 },
          { id: 'e3', type: 'text',     label: 'SubTitle',       x: 148, y: 44, w: 280, h: 16, content: 'Confidential — Internal Distribution Only', italic: true, fontSize: 9, color: '#888' },
          { id: 'e4', type: 'line',     label: 'HRule',          x: 8,   y: 66, w: 580, h: 2,  lineColor: '#1c6ac8' },
        ]
      },
      {
        id: 'ph', type: 'PH', label: 'Page Header', height: 44,
        elements: [
          { id: 'e5', type: 'field',  label: 'ColHeader_Name',  x: 8,   y: 12, w: 140, h: 16, fieldPath: '"Customer Name"',  bold: true, bgColor: '#e8f0fc' },
          { id: 'e6', type: 'field',  label: 'ColHeader_Rep',   x: 156, y: 12, w: 100, h: 16, fieldPath: '"Sales Rep"',      bold: true, bgColor: '#e8f0fc' },
          { id: 'e7', type: 'field',  label: 'ColHeader_Qty',   x: 264, y: 12, w: 70,  h: 16, fieldPath: '"Qty"',            bold: true, bgColor: '#e8f0fc', align: 'right' },
          { id: 'e8', type: 'field',  label: 'ColHeader_Total', x: 342, y: 12, w: 90,  h: 16, fieldPath: '"Total"',          bold: true, bgColor: '#e8f0fc', align: 'right' },
          { id: 'e9', type: 'special', label: 'PrintDate',      x: 470, y: 4,  w: 120, h: 14, fieldPath: 'PrintDate',        align: 'right', fontSize: 9, color: '#666' },
        ]
      },
      {
        id: 'gh1', type: 'GH', label: 'Group Header #1 (Region)', height: 28,
        elements: [
          { id: 'e10', type: 'field',   label: 'RegionName',  x: 8,  y: 6, w: 200, h: 18, fieldPath: 'Sales.Region',  bold: true, bgColor: '#dde8f8', color: '#1c4a8a' },
        ]
      },
      {
        id: 'det', type: 'D', label: 'Detail', height: 22,
        elements: [
          { id: 'e11', type: 'field', label: 'CustomerName', x: 8,   y: 4, w: 140, h: 14, fieldPath: 'Sales.CustName' },
          { id: 'e12', type: 'field', label: 'SalesRep',     x: 156, y: 4, w: 100, h: 14, fieldPath: 'Sales.RepName' },
          { id: 'e13', type: 'field', label: 'Quantity',     x: 264, y: 4, w: 70,  h: 14, fieldPath: 'Sales.Qty',    align: 'right' },
          { id: 'e14', type: 'field', label: 'Total',        x: 342, y: 4, w: 90,  h: 14, fieldPath: 'Sales.Total',  align: 'right', fieldFmt: 'currency' },
          { id: 'e15', type: 'subreport', label: 'SubRpt_Detail', x: 440, y: 2,  w: 18,  h: 18, target: 'CustomerDetail.rpt', color: '#888' },
        ]
      },
      {
        id: 'gf1', type: 'GF', label: 'Group Footer #1 (Region)', height: 26,
        elements: [
          { id: 'e16', type: 'text',    label: 'SubtotalLabel', x: 220, y: 4,  w: 112, h: 14, content: 'Region Subtotal:', bold: true, align: 'right' },
          { id: 'e17', type: 'formula', label: 'RegionTotal',   x: 342, y: 4,  w: 90,  h: 14, fieldPath: '@RegionSum',   align: 'right', bold: true, fieldFmt: 'currency' },
          { id: 'e18', type: 'line',    label: 'SubRule',       x: 340, y: 2,  w: 92,  h: 1,  lineColor: '#aaa' },
        ]
      },
      {
        id: 'pf', type: 'PF', label: 'Page Footer', height: 28,
        elements: [
          { id: 'e19', type: 'text',    label: 'Confidential', x: 8,   y: 8,  w: 200, h: 14, content: 'CONFIDENTIAL', fontSize: 8, color: '#aaa' },
          { id: 'e20', type: 'special', label: 'PageN',        x: 440, y: 8,  w: 150, h: 14, fieldPath: 'PageNofM',   align: 'right', fontSize: 9 },
        ]
      },
      {
        id: 'rf', type: 'RF', label: 'Report Footer', height: 38,
        elements: [
          { id: 'e21', type: 'text',    label: 'GrandTotalLabel', x: 220, y: 8,  w: 112, h: 18, content: 'Grand Total:', bold: true, align: 'right', fontSize: 11 },
          { id: 'e22', type: 'formula', label: 'GrandTotal',      x: 342, y: 8,  w: 90,  h: 18, fieldPath: '@GrandSum',  align: 'right', bold: true, fontSize: 11, fieldFmt: 'currency' },
        ]
      },
    ],
    formulas: [
      { id: 'f1', name: 'RegionSum',  expr: 'Sum({Sales.Total}, {Sales.Region})',  type: 'number' },
      { id: 'f2', name: 'GrandSum',   expr: 'Sum({Sales.Total})',                  type: 'number' },
      { id: 'f3', name: 'GrowthPct',  expr: '({Sales.Total} - {Sales.PrevTotal}) / {Sales.PrevTotal} * 100', type: 'number' },
      { id: 'f4', name: 'RepLabel',   expr: 'UpperCase({Sales.RepName}) + " (" + {Sales.RepCode} + ")"', type: 'string' },
    ],
    parameters: [
      { id: 'p1', name: 'StartDate',  type: 'Date',   default: '2024-10-01', prompt: 'Report Start Date' },
      { id: 'p2', name: 'EndDate',    type: 'Date',   default: '2024-12-31', prompt: 'Report End Date' },
      { id: 'p3', name: 'Region',     type: 'String', default: '',           prompt: 'Filter by Region (blank = all)' },
    ],
    groups: [
      { id: 'g1', field: 'Sales.Region', order: 'ASC',  keepTogether: true },
    ],
    runningTotals: [
      { id: 'rt1', name: 'RunTotalSales', field: 'Sales.Total', summary: 'Sum', evaluateOn: 'everyRecord', resetOn: 'groupChange', resetGroup: 'g1' }
    ],
  },
  {
    id: 'customer_detail',
    name: 'CustomerDetail.rpt',
    size: '96 KB',
    modified: '2024-12-15',
    icon: '🔗',
    isSubreport: true,
    connection: 'SQL Server — PROD\\REPORTS',
    sections: [
      {
        id: 'rh', type: 'RH', label: 'Report Header', height: 0, suppress: true, elements: []
      },
      {
        id: 'det', type: 'D', label: 'Detail', height: 18,
        elements: [
          { id: 'c1', type: 'field', label: 'OrderDate',   x: 8,   y: 2, w: 80,  h: 14, fieldPath: 'Orders.OrderDate', fieldFmt: 'date' },
          { id: 'c2', type: 'field', label: 'OrderId',     x: 96,  y: 2, w: 60,  h: 14, fieldPath: 'Orders.OrderId' },
          { id: 'c3', type: 'field', label: 'OrderTotal',  x: 164, y: 2, w: 80,  h: 14, fieldPath: 'Orders.Total', align: 'right', fieldFmt: 'currency' },
        ]
      },
      { id: 'rf', type: 'RF', label: 'Report Footer', height: 22,
        elements: [
          { id: 'c4', type: 'formula', label: 'CustTotal', x: 164, y: 4, w: 80, h: 14, fieldPath: '@CustTotal', align: 'right', bold: true, fieldFmt: 'currency' }
        ]
      }
    ],
    formulas: [
      { id: 'cf1', name: 'CustTotal', expr: 'Sum({Orders.Total})', type: 'number' }
    ],
    parameters: [
      { id: 'cp1', name: 'CustID', type: 'Number', prompt: 'Customer ID (linked)' }
    ],
    groups: [],
    runningTotals: [],
  },
  {
    id: 'inventory',
    name: 'InventoryMatrix.rpt',
    size: '178 KB',
    modified: '2024-11-30',
    icon: '📦',
    connection: 'Oracle — WAREHOUSE_DB',
    sections: [
      {
        id: 'rh', type: 'RH', label: 'Report Header', height: 54,
        elements: [
          { id: 'i1', type: 'text',  label: 'Title',     x: 8, y: 12, w: 300, h: 24, content: 'Inventory Cross-Tab Analysis', bold: true, fontSize: 14 },
          { id: 'i2', type: 'chart', label: 'StockChart', x: 360, y: 4,  w: 220, h: 46, chartType: 'bar', color: '#5b9ad5' },
        ]
      },
      {
        id: 'det', type: 'D', label: 'Detail', height: 20,
        elements: [
          { id: 'i3', type: 'crosstab', label: 'InvCrossTab', x: 8, y: 2, w: 560, h: 16, rowField: 'Inv.Category', colField: 'Inv.Warehouse' }
        ]
      },
    ],
    formulas: [
      { id: 'if1', name: 'StockStatus', expr: 'If {Inv.QtyOnHand} < {Inv.ReorderPoint} Then "LOW" Else "OK"', type: 'string' },
    ],
    parameters: [
      { id: 'ip1', name: 'AsOfDate', type: 'Date', default: '', prompt: 'Inventory as of date' }
    ],
    groups: [],
    runningTotals: [],
  },
  {
    id: 'exec_summary',
    name: 'ExecutiveSummary.rpt',
    size: '342 KB',
    modified: '2025-01-03',
    icon: '📈',
    connection: 'SQL Server — ANALYTICS',
    sections: [
      {
        id: 'rh', type: 'RH', label: 'Report Header', height: 80,
        elements: [
          { id: 'x1', type: 'picture', label: 'Logo',       x: 8,   y: 8,  w: 80,  h: 56, content: 'logo.png' },
          { id: 'x2', type: 'text',    label: 'Title',      x: 100, y: 10, w: 340, h: 30, content: 'Executive Dashboard', bold: true, fontSize: 20 },
          { id: 'x3', type: 'chart',   label: 'KPIChart',   x: 100, y: 44, w: 480, h: 32, chartType: 'bullet', color: '#4ec9b0' },
        ]
      },
      {
        id: 'det', type: 'D', label: 'Detail', height: 240,
        elements: [
          { id: 'x4', type: 'chart',    label: 'RevChart',     x: 8,   y: 8,   w: 270, h: 100, chartType: 'line',  color: '#569cd6' },
          { id: 'x5', type: 'chart',    label: 'RegionPie',    x: 290, y: 8,   w: 120, h: 100, chartType: 'pie',   color: '#ce9178' },
          { id: 'x6', type: 'chart',    label: 'TrendBar',     x: 420, y: 8,   w: 160, h: 100, chartType: 'bar',   color: '#4ec9b0' },
          { id: 'x7', type: 'subreport', label: 'SalesSubRpt', x: 8,   y: 118, w: 570, h: 114, target: 'SalesReport_Q4_2024.rpt' },
        ]
      },
    ],
    formulas: [
      { id: 'xf1', name: 'YoYGrowth',   expr: '({KPI.Revenue} - {KPI.PrevRevenue}) / {KPI.PrevRevenue}', type: 'number' },
      { id: 'xf2', name: 'TargetStatus', expr: 'If {KPI.Actual} >= {KPI.Target} Then "✓ On Track" Else "⚠ Behind"', type: 'string' },
    ],
    parameters: [
      { id: 'xp1', name: 'FiscalYear', type: 'Number', default: '2024', prompt: 'Fiscal Year' }
    ],
    groups: [],
    runningTotals: [],
  }
]

export const PARSE_LOG = [
  { time: '00:00.000', level: 'info',  msg: 'ReportForge RPT Workbench ready' },
  { time: '00:00.012', level: 'info',  msg: 'Loading workspace…' },
  { time: '00:00.041', level: 'info',  msg: 'Found 4 .rpt files in workspace' },
]

export function generateParseLog(rpt) {
  const t = () => {
    const ms = Math.floor(Math.random() * 900 + 100)
    return `00:${String(Math.floor(ms/1000)).padStart(2,'0')}.${String(ms%1000).padStart(3,'0')}`
  }
  const lines = [
    { time: t(), level: 'info',    msg: `Parsing ${rpt.name}…` },
    { time: t(), level: 'info',    msg: `  Connection: ${rpt.connection}` },
    { time: t(), level: 'info',    msg: `  Sections: ${rpt.sections.length} found` },
    { time: t(), level: 'info',    msg: `  Elements: ${rpt.sections.reduce((a, s) => a + s.elements.length, 0)} total` },
    { time: t(), level: 'info',    msg: `  Formulas: ${rpt.formulas.length}` },
    { time: t(), level: 'info',    msg: `  Parameters: ${rpt.parameters.length}` },
  ]
  if (rpt.sections.some(s => s.elements.some(e => e.type === 'subreport'))) {
    lines.push({ time: t(), level: 'warn', msg: `  ⚠ Subreport reference(s) detected` })
  }
  if (rpt.isSubreport) {
    lines.push({ time: t(), level: 'warn', msg: `  ⚠ Linked parameter fields require parent context` })
  }
  const errors = rpt.formulas.filter(f => f.expr.includes('PrevTotal') || f.expr.includes('PrevRevenue'))
  if (errors.length) {
    lines.push({ time: t(), level: 'warn', msg: `  ⚠ ${errors.length} formula(s) reference previous-period fields — verify data source` })
  }
  lines.push({ time: t(), level: 'ok', msg: `✓ ${rpt.name} parsed successfully` })
  return lines
}
