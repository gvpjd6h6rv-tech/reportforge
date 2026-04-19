# Datasource Package Contract

The `reportforge.core.render.datasource` package is a thin facade.

- `__init__.py` only reexports the public API.
- `data_source.py` owns `DataSource` and `DataSourceError`.
- `multi_dataset.py` owns `MultiDataset`.
- `DataSource.load()` stays the public entrypoint for generic datasource resolution.
- `MultiDataset` stays a separate owner for multi-source merging and lookup.

