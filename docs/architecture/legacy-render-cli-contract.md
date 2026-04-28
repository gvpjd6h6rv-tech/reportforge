# Legacy Render CLI Contract — REMOVED

`reportforge/core/render/cli.py` and all `cli_legacy_*.py` modules were deleted
as part of Fase 1 of the deprecation backlog (2026-04-25).

## What was removed

- `cli.py` — facade that re-exported the legacy command handlers
- `cli_legacy_parser.py` — argparse wiring for legacy subcommands
- `cli_legacy_generate.py` — `generate` command (SAP doc_entry → PDF via `RenderEngine.render_invoice`)
- `cli_legacy_preview.py` — `preview` command (SAP doc_entry → HTML via `render_html`)
- `cli_legacy_test.py` — `test` command (synthetic data → PDF)
- `cli_legacy_info.py` — `info` command (engine + weasyprint status)
- `cli_legacy_io.py` — `setup_logging` and `sample_data` fixture

## Canonical CLI

`reportforge/core/render/__main__.py` is the current entrypoint, backed by:

- `cli_parser.py` — command registration
- `cli_render.py` — `render`, `render-jrxml`, `preview`, `export`
- `cli_layout.py` — `validate`, `info`, `convert`
- `cli_samples.py` — `sample`, `list-types`
- `cli_io.py` — shared IO helpers

## Known gaps at removal time

The legacy `generate` and `test` commands called `RenderEngine.render_invoice()` with a
SAP `doc_entry` integer. The modern CLI takes explicit layout + data JSON files and has
no equivalent `render_invoice` path. Any caller that relied on that integration must
use the Python API (`RenderEngine`) directly.
