# CR Functions Contract

`reportforge/core/render/expressions/cr_functions.py` is facade-only.

## Canonical Ownership

- Family owners are separate and explicit.
- `cr_functions_shared.py` owns shared coercion helpers used by the catalog split.
- `cr_functions_datetime.py` owns date/time functions and constructors.
- `cr_functions_string.py` owns string functions and aliases.
- `cr_functions_conversion.py` owns conversion functions.
- `cr_functions_math.py` owns math functions.
- `cr_functions_formatting.py` owns numeric/text formatting functions.
- `cr_functions_predicates.py` owns null/type predicates.
- `cr_functions_conditionals.py` owns conditionals and membership helpers.
- `cr_functions_registry.py` owns the registry, `call`, and `is_cr_function`.

## Invariants

- The facade only reexports and assembles the public catalog.
- Registry logic does not live inline in the facade.
- Function families do not own unrelated domains.
- Coercion helpers are shared, pure, and side-effect free.
