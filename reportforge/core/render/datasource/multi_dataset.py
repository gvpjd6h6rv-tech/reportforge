from __future__ import annotations

from typing import Any

from .data_source import DataSource, DataSourceError


class MultiDataset:
    """
    Manages multiple named datasets within a single report.
    Datasets can be accessed as: {dataset1.fieldName}, {dataset2.total}
    """

    def __init__(self, datasets: dict[str, Any]):
        self._datasets: dict[str, dict] = {}
        for name, spec in datasets.items():
            try:
                self._datasets[name] = DataSource.load(spec)
            except DataSourceError as e:
                self._datasets[name] = {"error": str(e), "items": []}

    def get(self, name: str) -> dict:
        return self._datasets.get(name, {})

    def items(self, name: str) -> list:
        return self._datasets.get(name, {}).get("items", [])

    def merged(self) -> dict:
        """Return flat dict with all datasets merged under their names."""
        return dict(self._datasets)

