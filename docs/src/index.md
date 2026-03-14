---
layout: home

hero:
  name: "📊 ReportForge"
  text: Crystal Reports-Compatible Report Designer
  tagline: Visual drag-and-drop designer + REST API for generating professional reports from JSON layouts — no build step required.
  actions:
    - theme: brand
      text: 🚀 Get Started
      link: /designer/
    - theme: alt
      text: 🏗️ Architecture
      link: /architecture/
    - theme: alt
      text: 🔌 API Reference
      link: /api/designer

features:
  - icon: 🖥️
    title: Visual Designer
    details: Browser-based drag-and-drop designer with Crystal Reports look and feel — section labels, property grid, format toolbar, and full menu bar.
  - icon: ⚡
    title: ES Module Architecture
    details: 52 focused modules across 5 layers (Core → UX → Classic → Modules → V4). No bundler, no build step — just open in a browser.
  - icon: 📐
    title: Modern CSS
    details: CSS @layer cascade, container queries, logical properties, fluid clamp() sizing, focus-visible interactions, and a complete design token system.
  - icon: 🔄
    title: Smart Render Pipeline
    details: Layer invalidation system (elements / selection / sections). Non-destructive inspector diffs — only rebuilds when the element actually changes.
  - icon: 📊
    title: Full Report Elements
    details: Text, fields, lines, rectangles, images, charts, tables, barcodes, rich text, subreports, crosstabs, and maps.
  - icon: 🔌
    title: REST API
    details: POST /designer-preview with a layout JSON + data and receive rendered HTML ready for PDF conversion via headless Chrome or wkhtmltopdf.
---
