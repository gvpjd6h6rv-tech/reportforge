---
layout: home

hero:
  name: ReportForge
  text: Crystal Reports–compatible Visual Designer
  tagline: Open-source report designer with Crystal Reports XI fidelity, Python render engine, and enterprise QA pipeline.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: Architecture
      link: /architecture/overview

features:
  - icon: 🖥️
    title: Visual Designer
    details: Crystal Reports XI–style designer with rulers, banded sections, snap guides, L-shaped handles, property inspector, and field explorer.
  - icon: ⚙️
    title: Render Engine
    details: Python engine renders layouts to HTML, PDF, XLSX, CSV. Formula engine supports IIf, aggregates, date functions, and Crystal syntax.
  - icon: 🔌
    title: REST API
    details: FastAPI server with OpenAPI docs. POST /render for PDF generation, /validate-formula for formula checking.
  - icon: 🧪
    title: QA Pipeline
    details: 43 QA scripts, 1000+ automated tests, 12 layout invariants. Zero regressions since v15.1.
  - icon: 📐
    title: Layout Invariant Engine
    details: Strict four-layer architecture (Viewport → Workspace → Canvas → Document). 12 invariants validated across 6 interaction scenarios.
  - icon: ⌨️
    title: Complete Command System
    details: 84/84 commands implemented (100% coverage) — alignment, ordering, grouping, zoom, sections, object properties.
