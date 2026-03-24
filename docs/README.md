# ReportForge Documentation

Built with [VitePress](https://vitepress.dev). Includes Mermaid diagrams.

## Setup

```bash
cd docs
npm install
npm run dev      # development server on http://localhost:5173
npm run build    # build to docs/.vitepress/dist/
```

## Architectural gate

Canonical runtime changes must pass:

```bash
npm run test:contracts
npm run test:governance
npm run test:runtime
```

## Structure

```
docs/
├── .vitepress/
│   └── config.js          # VitePress configuration
├── src/
│   ├── index.md            # Home page
│   ├── designer/
│   │   └── index.md        # Designer user guide
│   ├── architecture/
│   │   ├── index.md        # Module dependency graphs (Mermaid)
│   │   └── refactor.md     # 8-phase CR fidelity refactor log
│   └── api/
│       └── designer.md     # Preview endpoint + layout JSON schema
├── package.json
└── README.md
```
