# ReportForge Documentation

Built with [VitePress](https://vitepress.dev).

La documentación visible describe el sistema vivo real:

- shell HTML puro
- runtime canónico en `designer/crystal-reports-designer-v4.html`
- engines en `engines/`
- guardrails de governance, contracts y runtime

## Setup

```bash
cd docs
npm install
npm run dev
npm run build
```

## Gates obligatorios

Cambios del runtime canónico deben pasar:

```bash
npm run test:contracts
npm run test:governance
npm run test:runtime
```

## Entradas principales

- `docs/index.md`: home
- `docs/brochure.md`: brochure visual y navegable
- `docs/guide/*`: uso del diseñador
- `docs/architecture/*`: arquitectura histórica y técnica
- `docs/architecture.md`: resumen normativo
- `docs/layers.md`: límites por capa
- `docs/runtime-services.md`: registry estructural
- `docs/governance.md`: reglas de CI y guardrails
