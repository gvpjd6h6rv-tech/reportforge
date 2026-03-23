# Freeze Rules

## Immediate Freeze Rules

- No new features in `reportforge/designer/*` until canonicity is explicitly switched away from v4.
- No new DOM aliases such as `.rf-el` mirrors, legacy ids, or QA-only runtime selectors.
- No new bridges, shims, wrappers, or `patch/bind` redirections between legacy and v19 engines.
- No new DOM writes outside the canonical scheduler path.
- No new direct reads of `DS.zoom` outside `RF.Geometry`.
- No new alternate geometry contract shapes.
- No new inline presentation styles from JS.
- No new fallback runtime paths unless they are removal tooling only.
- No new selection overlay implementation outside the canonical runtime path.
- No new history stack implementation parallel to existing ones.

## Allowed During Freeze

- Documentation of ownership, contracts, and debt.
- Tests that expose runtime contradictions.
- Instrumentation that is temporary and development-only.
- Contract normalization work that removes ambiguity without adding new paths.

## Not Allowed During Freeze

- Shipping new UI features into the non-canonical runtime.
- Adding “temporary” compat to satisfy tests.
- Refactoring that preserves duplicate owners instead of removing one.
- Marking a migration phase as done while bridges remain active.
