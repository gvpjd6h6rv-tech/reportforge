# Render CLI Contract

`reportforge/core/render/__main__.py` is facade-only.

Responsibilities are split by ownership:
- `cli_io.py` owns CLI formatting and JSON loading helpers.
- `cli_render.py` owns render/export commands.
- `cli_layout.py` owns validation/info/convert commands.
- `cli_samples.py` owns sample and document-type listing commands.
- `cli_parser.py` owns parser wiring and subcommand registration.

Invariants:
- `__main__.py` does not host command logic.
- command families do not reimplement shared IO helpers.
- parser wiring remains the only place that binds subcommands to functions.
- command handlers remain thin orchestration over render/layout/sample services.
