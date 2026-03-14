# export/csv_export.py — CSV export from report data
from __future__ import annotations
import csv, io
from pathlib import Path


def export_csv(data: dict, output: str | Path,
               dataset: str = "items",
               fields: list[str] = None,
               encoding: str = "utf-8-sig") -> Path:
    """
    Export a dataset from report data to CSV.
    
    Args:
        data:    Report data dict.
        output:  Output .csv file path.
        dataset: Key in data dict to export (default: "items").
        fields:  List of field names to include. If None, auto-detect.
    """
    p = Path(output)
    p.parent.mkdir(parents=True, exist_ok=True)

    rows = data.get(dataset, [])
    if not isinstance(rows, list):
        rows = []

    if not rows:
        p.write_text("", encoding=encoding)
        return p

    # Auto-detect fields from first row
    if not fields:
        fields = list(rows[0].keys()) if rows else []

    with p.open("w", newline="", encoding=encoding) as f:
        writer = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)

    return p


def export_all_csv(data: dict, output_dir: str | Path) -> dict[str, Path]:
    """Export all list-type datasets to separate CSV files."""
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)
    result = {}
    for key, val in data.items():
        if isinstance(val, list) and val:
            path = out / f"{key}.csv"
            result[key] = export_csv(data, path, dataset=key)
    return result
