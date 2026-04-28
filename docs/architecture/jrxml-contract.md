# JRXML Contract

## Ownership

- `jrxml_parser.py` is facade-only.
- `jrxml_constants.py` owns JRXML maps.
- `jrxml_utils.py` owns tag and expression helpers.
- `jrxml_elements.py` owns JRXML element conversion.
- `jrxml_layout.py` owns JRXML root, band, and layout assembly.

## Invariants

- JRXML parsing does not mix layout assembly with element conversion.
- JRXML helpers stay pure and reusable.
- `render_from_jrxml` remains the public entrypoint.
- Compatibility imports continue to reexport the facade API only.
