# Expression Evaluator Contract

`reportforge/core/render/expressions/evaluator.py` is facade-only.

Responsibilities are split by ownership:
- `evaluator_runtime.py` owns `ExpressionEvaluator` and expression dispatch.
- `evaluator_support.py` owns regex patterns, `_split_args`, `safe_eval`, and string coercion helpers.

Invariants:
- `evaluator.py` does not host evaluation logic.
- `evaluator_runtime.py` owns the evaluator state machine and does not embed AST visitor sandboxing.
- `evaluator_support.py` stays pure and helper-only.
- public compatibility helpers `_split_args`, `_safe_eval`, `_safe_eval_ast`, and `_coerce_str` remain importable from `evaluator.py`.
